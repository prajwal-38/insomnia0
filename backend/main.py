import os
import sys
import shutil
import subprocess
import json
import uuid
import logging
import tempfile
import asyncio
import requests
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException, Path as FastApiPath, Body, Request, Form, Query, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Google Cloud imports
try:
    from google.cloud import storage
    from google.auth import default
    GOOGLE_CLOUD_AVAILABLE = True
    logger.info("Google Cloud libraries loaded successfully")
except ImportError:
    GOOGLE_CLOUD_AVAILABLE = False
    logger.warning("Google Cloud libraries not available. Cloud storage features disabled.")

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime
from video_segmentation import (
    generate_scene_segments,
    regenerate_scene_segments,
    VideoSegmentationError
)
from video_export import export_timeline_to_mp4, VideoExportError, get_export_filename

# Database and transcript service imports
from database import init_database, get_database_info, get_db
from sqlalchemy.orm import Session
from services.transcript_service import TranscriptService
from services.auth_service import AuthService

# Performance monitoring
from performance_monitor import performance_monitor, measure_video_analysis, measure_api_request

# --- Configuration ---
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_UPLOAD_DIR = os.path.join(BACKEND_DIR, "temp_video_uploads")
ANALYZED_VIDEOS_DIR = os.path.join(BACKEND_DIR, "analyzed_videos_store")
ANALYSIS_DATA_DIR = os.path.join(BACKEND_DIR, "analysis_data_store")

os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
os.makedirs(ANALYZED_VIDEOS_DIR, exist_ok=True)
os.makedirs(ANALYSIS_DATA_DIR, exist_ok=True)

# Check if video_analysis directory exists in backend directory (Docker) or project root (local)
VIDEO_ANALYSIS_DIR = os.path.join(BACKEND_DIR, "video_analysis")
if not os.path.exists(VIDEO_ANALYSIS_DIR):
    # Fallback to project root for local development
    PROJECT_ROOT_DIR = os.path.dirname(BACKEND_DIR)
    VIDEO_ANALYSIS_DIR = os.path.join(PROJECT_ROOT_DIR, "video_analysis")

ANALYZE_VIDEO_SCRIPT = os.path.join(VIDEO_ANALYSIS_DIR, "analyze_video.py")

# Verify the video analysis script exists
if not os.path.exists(ANALYZE_VIDEO_SCRIPT):
    logger.error(f"Video analysis script not found at: {ANALYZE_VIDEO_SCRIPT}")
    logger.error(f"Backend directory: {BACKEND_DIR}")
    logger.error(f"Video analysis directory: {VIDEO_ANALYSIS_DIR}")
    logger.error(f"Directory contents: {os.listdir(BACKEND_DIR) if os.path.exists(BACKEND_DIR) else 'Backend dir not found'}")
else:
    logger.info(f"Video analysis script found at: {ANALYZE_VIDEO_SCRIPT}")

PYTHON_EXECUTABLE = sys.executable

# Cloud Storage Configuration
CLOUD_STORAGE_ENABLED = os.getenv('CLOUD_STORAGE_ENABLED', 'false').lower() == 'true'
GCS_BUCKET_NAME = os.getenv('GCS_BUCKET_NAME', '')
GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID', '')

# Initialize Google Cloud Storage client if available
storage_client = None
if GOOGLE_CLOUD_AVAILABLE and CLOUD_STORAGE_ENABLED and GCS_BUCKET_NAME:
    try:
        storage_client = storage.Client(project=GCP_PROJECT_ID)
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        logger.info(f"Google Cloud Storage initialized with bucket: {GCS_BUCKET_NAME}")
    except Exception as e:
        logger.error(f"Failed to initialize Google Cloud Storage: {e}")
        storage_client = None

# --- Pydantic Models for Request Bodies ---
class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., description="Google OAuth credential token")

class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, max_length=1000, description="Project description")

class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, max_length=1000, description="Project description")
    thumbnail: Optional[str] = Field(None, description="Thumbnail URL")
    video_file_name: Optional[str] = Field(None, description="Video file name")
    duration: Optional[float] = Field(None, ge=0, description="Project duration in seconds")
    scene_count: Optional[int] = Field(None, ge=0, description="Number of scenes")

class SceneMetadataUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, description="New title for the scene")
    tags: Optional[List[str]] = Field(None, description="List of tags for the scene")

class SceneTrimData(BaseModel):
    new_clip_start_time: float = Field(..., ge=0, description="Start time of the trim relative to the current segment's beginning")
    new_clip_duration: float = Field(..., gt=0, description="Desired duration of the segment after trimming")

class TimelineExportData(BaseModel):
    timeline_data: Dict[str, Any] = Field(..., description="Timeline data from the frontend")
    analysis_id: str = Field(..., description="Analysis ID for locating video segments")
    composition_settings: Optional[Dict[str, Any]] = Field(None, description="Video composition settings (width, height, fps)")
    export_name: Optional[str] = Field(None, description="Optional name for the exported video")

class AudioTranslationRequest(BaseModel):
    videoUrl: str = Field(..., description="URL of the video to translate")
    sceneStart: float = Field(..., ge=0, description="Start time of the scene in seconds")
    sceneDuration: float = Field(..., gt=0, description="Duration of the scene in seconds")
    targetLanguage: str = Field(..., description="Target language code (e.g., 'es', 'fr', 'de')")
    voice: str = Field(..., description="Voice name for text-to-speech (e.g., 'Kore', 'Puck', 'Leda')")
    sceneId: str = Field(..., description="Scene ID for tracking")
    analysisId: str = Field(..., description="Analysis ID for the video")

# Initialize database
try:
    init_database()
    logger.info("Database initialized successfully")
except Exception as e:
    logger.error(f"Database initialization failed: {e}")

# Initialize transcript service
transcript_service = TranscriptService()

# --- FastAPI App ---
app = FastAPI(
    title="Insomnia Video Editor API",
    description="Backend API for the Insomnia video editing application",
    version="1.0.0"
)

@app.get("/")
def read_root():
    return {"message": "Insomnia Video Editor API", "version": "1.0.0", "status": "running"}

@app.get("/api/health")
def health_check():
    db_info = get_database_info()
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "server": "uvicorn-fresh",
        "cloud_storage": CLOUD_STORAGE_ENABLED,
        "gcs_bucket": GCS_BUCKET_NAME if CLOUD_STORAGE_ENABLED else None,
        "database": db_info
    }

# Authentication endpoints
@app.post("/api/auth/google")
async def google_auth(request: Request, db: Session = Depends(get_db)):
    """Authenticate user with Google OAuth credential"""
    try:
        body = await request.json()
        credential = body.get('credential')

        if not credential:
            raise HTTPException(status_code=400, detail="Google credential is required")

        # Verify Google token
        google_user_info = AuthService.verify_google_token(credential)
        if not google_user_info:
            raise HTTPException(status_code=401, detail="Invalid Google credential")

        # Get or create user
        user = AuthService.get_or_create_user(db, google_user_info)
        if not user:
            raise HTTPException(status_code=500, detail="Failed to create user")

        # Create JWT token
        jwt_token = AuthService.create_jwt_token(user)

        return JSONResponse(content={
            "token": jwt_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "picture": user.picture,
                "googleId": user.google_id
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google authentication error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.get("/api/auth/verify")
async def verify_auth(authorization: str = Header(None), db: Session = Depends(get_db)):
    """Verify JWT token and return user information"""
    try:
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        return JSONResponse(content={
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "picture": user.picture,
                "googleId": user.google_id
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")

# Project management endpoints
@app.post("/api/projects")
async def create_project(
    project_data: ProjectCreateRequest,
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Create a new project for the authenticated user"""
    try:
        # Authenticate user
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Create new project
        from models import Project
        new_project = Project(
            user_id=user.id,
            name=project_data.name,
            description=project_data.description
        )

        db.add(new_project)
        db.commit()
        db.refresh(new_project)

        return JSONResponse(content={
            "id": new_project.id,
            "name": new_project.name,
            "description": new_project.description,
            "created_at": new_project.created_at.isoformat(),
            "updated_at": new_project.updated_at.isoformat(),
            "user_id": new_project.user_id
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Project creation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")

@app.get("/api/projects")
async def get_user_projects(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Get all projects for the authenticated user"""
    try:
        # Authenticate user
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Get user's projects
        from models import Project
        projects = db.query(Project).filter(
            Project.user_id == user.id,
            Project.is_active == True
        ).order_by(Project.updated_at.desc()).all()

        return JSONResponse(content={
            "projects": [
                {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "thumbnail": project.thumbnail,
                    "video_file_name": project.video_file_name,
                    "duration": project.duration,
                    "scene_count": project.scene_count,
                    "created_at": project.created_at.isoformat(),
                    "updated_at": project.updated_at.isoformat(),
                    "last_modified": project.last_modified.isoformat()
                }
                for project in projects
            ]
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Projects retrieval error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve projects")

@app.get("/api/projects/{project_id}")
async def get_project(
    project_id: str,
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Get a specific project by ID (only if user owns it)"""
    try:
        # Authenticate user
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Get project
        from models import Project
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == user.id,
            Project.is_active == True
        ).first()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        return JSONResponse(content={
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "thumbnail": project.thumbnail,
            "video_file_name": project.video_file_name,
            "duration": project.duration,
            "scene_count": project.scene_count,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
            "last_modified": project.last_modified.isoformat()
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Project retrieval error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve project")

@app.put("/api/projects/{project_id}")
async def update_project(
    project_id: str,
    project_data: ProjectUpdateRequest,
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Update a specific project (only if user owns it)"""
    try:
        # Authenticate user
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Get project
        from models import Project
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == user.id,
            Project.is_active == True
        ).first()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Update project fields
        if project_data.name is not None:
            project.name = project_data.name
        if project_data.description is not None:
            project.description = project_data.description
        if project_data.thumbnail is not None:
            project.thumbnail = project_data.thumbnail
        if project_data.video_file_name is not None:
            project.video_file_name = project_data.video_file_name
        if project_data.duration is not None:
            project.duration = project_data.duration
        if project_data.scene_count is not None:
            project.scene_count = project_data.scene_count

        db.commit()
        db.refresh(project)

        return JSONResponse(content={
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "thumbnail": project.thumbnail,
            "video_file_name": project.video_file_name,
            "duration": project.duration,
            "scene_count": project.scene_count,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
            "last_modified": project.last_modified.isoformat()
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Project update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update project")

@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Delete a specific project (only if user owns it)"""
    try:
        # Authenticate user
        user = AuthService.authenticate_request(db, authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Get project
        from models import Project
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == user.id,
            Project.is_active == True
        ).first()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Soft delete the project
        project.is_active = False
        db.commit()

        return JSONResponse(content={
            "message": "Project deleted successfully",
            "project_id": project_id
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Project deletion error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete project")

# Update CORS to support both deployment strategies
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://insomniav23.vercel.app",
    "https://*.vercel.app"
]

# Add environment-specific origins
if os.getenv('FRONTEND_URL'):
    ALLOWED_ORIGINS.append(os.getenv('FRONTEND_URL'))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def save_analysis_data(analysis_id: str, data: Dict[str, Any]):
    file_path = os.path.join(ANALYSIS_DATA_DIR, f"{analysis_id}.json")
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)
    # print(f"Saved analysis data for {analysis_id} to {file_path}")
    # print(f"Data saved: {json.dumps(data, indent=2)}")


def load_analysis_data(analysis_id: str) -> Union[Dict[str, Any], None]:
    file_path = os.path.join(ANALYSIS_DATA_DIR, f"{analysis_id}.json")
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return None

# Cloud Storage Helper Functions
def upload_to_gcs(local_file_path: str, gcs_blob_name: str) -> str:
    """Upload a file to Google Cloud Storage and return the public URL"""
    if not storage_client or not GCS_BUCKET_NAME:
        raise Exception("Google Cloud Storage not configured")

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(gcs_blob_name)

        blob.upload_from_filename(local_file_path)

        # Make the blob publicly readable
        blob.make_public()

        logger.info(f"File uploaded to GCS: {gcs_blob_name}")
        return blob.public_url
    except Exception as e:
        logger.error(f"Failed to upload to GCS: {e}")
        raise

def get_signed_upload_url(file_name: str, content_type: str, folder: str = "uploads") -> Dict[str, str]:
    """Generate a signed URL for direct client upload to GCS"""
    if not storage_client or not GCS_BUCKET_NAME:
        raise Exception("Google Cloud Storage not configured")

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob_name = f"{folder}/{file_name}"
        blob = bucket.blob(blob_name)

        # Generate signed URL for upload (valid for 1 hour)
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=3600,  # 1 hour
            method="PUT",
            content_type=content_type
        )

        # Generate public URL for accessing the file after upload
        public_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{blob_name}"

        return {
            "signedUrl": signed_url,
            "fileUrl": public_url,
            "blobName": blob_name
        }
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {e}")
        raise

# Cloud Storage Endpoints
@app.post("/storage/signed-url")
async def get_signed_url_endpoint(request: Request):
    """Generate signed URL for direct client upload to Google Cloud Storage"""
    if not CLOUD_STORAGE_ENABLED:
        raise HTTPException(status_code=501, detail="Cloud storage not enabled")

    try:
        body = await request.json()
        file_name = body.get('fileName')
        content_type = body.get('contentType')
        folder = body.get('folder', 'uploads')

        if not file_name or not content_type:
            raise HTTPException(status_code=400, detail="fileName and contentType are required")

        result = get_signed_upload_url(file_name, content_type, folder)
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Error generating signed URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/processing/start")
async def start_cloud_processing(request: Request):
    """Start cloud processing job for AI agents"""
    if not CLOUD_STORAGE_ENABLED:
        raise HTTPException(status_code=501, detail="Cloud processing not enabled")

    try:
        body = await request.json()
        scene_id = body.get('sceneId')
        agent_type = body.get('agentType')
        source_video_url = body.get('sourceVideoUrl')
        parameters = body.get('parameters', {})

        if not all([scene_id, agent_type, source_video_url]):
            raise HTTPException(status_code=400, detail="sceneId, agentType, and sourceVideoUrl are required")

        # Generate a job ID
        job_id = str(uuid.uuid4())

        # For now, return a mock response - in production this would trigger actual cloud processing
        return JSONResponse(content={
            "jobId": job_id,
            "status": "queued",
            "message": f"Processing job started for scene {scene_id} with agent {agent_type}"
        })

    except Exception as e:
        logger.error(f"Error starting cloud processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/processing/status/{job_id}")
async def get_processing_status(job_id: str):
    """Get status of cloud processing job"""
    if not CLOUD_STORAGE_ENABLED:
        raise HTTPException(status_code=501, detail="Cloud processing not enabled")

    # Mock response - in production this would check actual job status
    return JSONResponse(content={
        "jobId": job_id,
        "status": "completed",
        "progress": 100,
        "resultUrl": f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/processed/{job_id}_result.mp4"
    })

@app.post("/api/analyze")
async def analyze_video_endpoint(request: Request, video: UploadFile = File(...), segmentation_method: str = Form("cut-based")):
    """Analyze video with performance monitoring."""
    # Debug: Log all form data to file
    debug_log_path = os.path.join(BACKEND_DIR, "debug.log")
    with open(debug_log_path, "a") as f:
        f.write(f"DEBUG: Received video file: {video.filename}\n")
        f.write(f"DEBUG: Video content type: {video.content_type}\n")
        f.write(f"DEBUG: Received segmentation_method: '{segmentation_method}' (type: {type(segmentation_method)})\n")

    # Also log to console
    logger.info(f"DEBUG: Received video file: {video.filename}")
    logger.info(f"DEBUG: Video content type: {video.content_type}")
    logger.info(f"DEBUG: Received segmentation_method: '{segmentation_method}' (type: {type(segmentation_method)})")

    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    # Validate segmentation method
    if segmentation_method not in ["cut-based", "ai-based"]:
        raise HTTPException(status_code=400, detail="Invalid segmentation method. Must be 'cut-based' or 'ai-based'.")

    # Debug: Confirm validation passed
    logger.info(f"DEBUG: Segmentation method validation passed: '{segmentation_method}'")

    original_filename = video.filename
    analysis_id = str(uuid.uuid4())

    file_extension = os.path.splitext(original_filename)[1] if original_filename else ".mp4"
    stored_video_filename = f"{analysis_id}{file_extension}"
    stored_video_path_on_server = os.path.join(ANALYZED_VIDEOS_DIR, stored_video_filename)
    temp_upload_path_on_server = os.path.join(TEMP_UPLOAD_DIR, f"temp_{analysis_id}_{original_filename}")

    # Performance monitoring metadata
    video_metadata = {
        "filename": original_filename,
        "file_size": video.size if hasattr(video, 'size') else 0,
        "segmentation_method": segmentation_method
    }

    try:
        with measure_video_analysis(video_metadata):
            with open(temp_upload_path_on_server, "wb") as buffer:
                shutil.copyfileobj(video.file, buffer)

            # Verify the analysis script exists before running
            if not os.path.exists(ANALYZE_VIDEO_SCRIPT):
                error_msg = f"Video analysis script not found at: {ANALYZE_VIDEO_SCRIPT}"
                logger.error(error_msg)
                raise HTTPException(status_code=500, detail=error_msg)

        command = [
            PYTHON_EXECUTABLE,
            ANALYZE_VIDEO_SCRIPT,
            "--input", temp_upload_path_on_server,
            "--fade-threshold", "5.0",
            "--segmentation-method", segmentation_method
        ]

        # Debug: Log the command being executed
        logger.info(f"DEBUG: Executing command: {' '.join(command)}")
        logger.info(f"DEBUG: Working directory: {VIDEO_ANALYSIS_DIR}")
        logger.info(f"DEBUG: Script exists: {os.path.exists(ANALYZE_VIDEO_SCRIPT)}")

        process = subprocess.run(
            command, capture_output=True, text=True, cwd=VIDEO_ANALYSIS_DIR, check=False
        )

        # Debug: Log subprocess output
        logger.info(f"DEBUG: Subprocess return code: {process.returncode}")
        logger.info(f"DEBUG: Subprocess stderr: {process.stderr[:1000]}")
        logger.info(f"DEBUG: Subprocess stdout length: {len(process.stdout)}")

        if process.returncode != 0:
            error_message = f"Video analysis script failed. Stderr: {process.stderr[:500]}..."
            print(f"Error running analysis script (ID: {analysis_id}): {process.stderr}", file=sys.stderr)
            raise HTTPException(status_code=500, detail=error_message)

        try:
            full_analysis_result = json.loads(process.stdout)

            # Debug: Log analysis result details
            logger.info(f"DEBUG: Analysis result contains {len(full_analysis_result.get('scenes', []))} scenes")
            if "scenes" in full_analysis_result and len(full_analysis_result["scenes"]) > 0:
                first_scene = full_analysis_result["scenes"][0]
                logger.info(f"DEBUG: First scene segmentation_method: {first_scene.get('segmentation_method', 'NOT_SET')}")
                logger.info(f"DEBUG: First scene transition_type: {first_scene.get('transition_type', 'NOT_SET')}")

            if "scenes" in full_analysis_result:
                for i, scene_data in enumerate(full_analysis_result["scenes"]):
                    scene_data.setdefault("title", f"Scene {scene_data.get('scene_index', i) + 1}")
                    scene_data.setdefault("tags", [])
                    scene_data["sceneId"] = str(uuid.uuid4()) # Add UUID for each scene
                    # Ensure scene_index is present, if analyze_video.py doesn't add it consistently
                    if "scene_index" not in scene_data:
                        scene_data["scene_index"] = i

                    # Add original timing metadata for trimming support
                    scene_data["start_original"] = scene_data.get("start", 0)
                    scene_data["end_original"] = scene_data.get("end", 0)
                    scene_data["current_trimmed_start"] = 0.0
                    scene_data["current_trimmed_duration"] = scene_data.get("duration", 0)
        except json.JSONDecodeError:
            error_message = f"Failed to parse JSON from analysis script. Output: {process.stdout[:500]}..."
            print(error_message, file=sys.stderr)
            raise HTTPException(status_code=500, detail=error_message)

        shutil.move(temp_upload_path_on_server, stored_video_path_on_server)

        # Generate video segments for each scene
        logger.info(f"Generating video segments for {len(full_analysis_result.get('scenes', []))} scenes")

        if "scenes" in full_analysis_result:
            for scene_data in full_analysis_result["scenes"]:
                try:
                    # Generate proxy and mezzanine segments for this scene
                    generated_segments = generate_scene_segments(
                        analysis_id,
                        stored_video_path_on_server,
                        scene_data,
                        ANALYZED_VIDEOS_DIR,
                        generate_proxy=True,
                        generate_mezzanine=True
                    )

                    # Update scene data with segment URLs
                    scene_data.update(generated_segments)
                    logger.info(f"Generated segments for scene {scene_data.get('sceneId')}: {list(generated_segments.keys())}")

                except VideoSegmentationError as e:
                    logger.error(f"Failed to generate segments for scene {scene_data.get('sceneId')}: {e}")
                    # Continue with other scenes even if one fails
                except Exception as e:
                    logger.error(f"Unexpected error generating segments for scene {scene_data.get('sceneId')}: {e}")

        base_url = str(request.base_url).rstrip('/')
        relative_api_path = f"/api/video/{analysis_id}"
        absolute_video_url = f"{base_url}{relative_api_path}"

        analysis_data_to_store = {
            "analysisId": analysis_id,
            "originalFileName": original_filename,
            "storedVideoPath": stored_video_path_on_server,
            "videoUrl": absolute_video_url,
            "analysisResult": full_analysis_result
        }
        save_analysis_data(analysis_id, analysis_data_to_store)

        # NEW: Trigger automatic transcription in background
        try:
            logger.info(f"Starting automatic transcription for analysis {analysis_id}")
            # Start transcription asynchronously (non-blocking)
            asyncio.create_task(
                transcript_service.transcribe_full_video(
                    analysis_id,
                    stored_video_path_on_server
                )
            )
            logger.info(f"Automatic transcription initiated for analysis {analysis_id}")
        except Exception as e:
            # Don't fail the upload if transcription fails
            logger.warning(f"Failed to start automatic transcription for {analysis_id}: {e}")

        return JSONResponse(content={
            "analysisId": analysis_id,
            "fileName": original_filename,
            "videoUrl": absolute_video_url,
            "scenes": full_analysis_result.get("scenes", []),
            "metadata": full_analysis_result.get("metadata", {}),
            "transcription_status": "initiated"  # Indicate transcription has started
        })

    except HTTPException:
        if os.path.exists(temp_upload_path_on_server): os.remove(temp_upload_path_on_server)
        raise
    except Exception as e:
        print(f"An unexpected error occurred during /api/analyze (ID: {analysis_id}): {str(e)}", file=sys.stderr)
        if os.path.exists(temp_upload_path_on_server): os.remove(temp_upload_path_on_server)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if video and hasattr(video, 'file') and not video.file.closed: video.file.close()
        if os.path.exists(temp_upload_path_on_server) and not os.path.exists(stored_video_path_on_server):
             os.remove(temp_upload_path_on_server)


@app.get("/api/analysis/{analysis_id}")
async def get_analysis_result(request: Request, analysis_id: str = FastApiPath(..., title="The ID of the analysis to retrieve")):
    stored_data = load_analysis_data(analysis_id)
    if not stored_data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    video_url_from_store = stored_data.get("videoUrl", "")
    if video_url_from_store.startswith("/api/"):
        base_url = str(request.base_url).rstrip('/')
        absolute_video_url = f"{base_url}{video_url_from_store}"
    elif not video_url_from_store.startswith("http"):
        base_url = str(request.base_url).rstrip('/')
        absolute_video_url = f"{base_url}/api/video/{analysis_id}"
    else: absolute_video_url = video_url_from_store

    return JSONResponse(content={
        "analysisId": stored_data["analysisId"],
        "fileName": stored_data["originalFileName"],
        "videoUrl": absolute_video_url,
        "scenes": stored_data["analysisResult"].get("scenes", []),
        "metadata": stored_data["analysisResult"].get("metadata", {})
    })

@app.get("/api/video/{analysis_id}")
@app.head("/api/video/{analysis_id}")
@app.options("/api/video/{analysis_id}")
async def stream_video(analysis_id: str = FastApiPath(..., title="The ID of the analysis whose video to stream")):
    stored_data = load_analysis_data(analysis_id)
    if not stored_data or not stored_data.get("storedVideoPath"):
        raise HTTPException(status_code=404, detail="Video for analysis not found (no stored data)")

    video_path_from_json = stored_data.get("storedVideoPath")
    if not video_path_from_json:
        raise HTTPException(status_code=404, detail="Video for analysis not found (no path in stored data)")

    if not os.path.exists(video_path_from_json):
        raise HTTPException(status_code=404, detail=f"Video file missing on server. Expected at: {video_path_from_json}")

    # Add CORS headers for video streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
        "Cache-Control": "no-cache"
    }

    return FileResponse(video_path_from_json, media_type="video/mp4", headers=headers)

# NEW: Scene-specific video segment endpoint for subtitle generation
@app.get("/api/video/{analysis_id}/scene")
@app.head("/api/video/{analysis_id}/scene")
@app.options("/api/video/{analysis_id}/scene")
async def stream_scene_segment(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    start: float = 0,
    duration: float = None
):
    """
    Stream a specific scene segment from the video for subtitle generation.
    This creates a temporary video segment on-the-fly.
    """
    stored_data = load_analysis_data(analysis_id)
    if not stored_data or not stored_data.get("storedVideoPath"):
        raise HTTPException(status_code=404, detail="Video for analysis not found")

    video_path = stored_data.get("storedVideoPath")
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file missing on server")

    # Create a temporary scene segment using ffmpeg
    temp_dir = os.path.join(BACKEND_DIR, "temp_scene_segments")
    os.makedirs(temp_dir, exist_ok=True)

    # Generate unique filename for this scene segment
    segment_id = f"{analysis_id}_{start}_{duration or 'full'}"
    temp_segment_path = os.path.join(temp_dir, f"scene_{segment_id}.mp4")

    # Check if segment already exists (cache)
    if not os.path.exists(temp_segment_path):
        try:
            # Use ffmpeg to extract scene segment
            ffmpeg_cmd = [
                "ffmpeg", "-y",  # -y to overwrite existing files
                "-i", video_path,
                "-ss", str(start),  # Start time
            ]

            if duration:
                ffmpeg_cmd.extend(["-t", str(duration)])  # Duration

            ffmpeg_cmd.extend([
                "-c", "copy",  # Copy streams without re-encoding for speed
                "-avoid_negative_ts", "make_zero",
                temp_segment_path
            ])

            logger.info(f"Creating scene segment: {' '.join(ffmpeg_cmd)}")

            result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True,
                timeout=60  # 60 second timeout
            )

            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                raise HTTPException(status_code=500, detail="Failed to create scene segment")

        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="Scene segment creation timeout")
        except Exception as e:
            logger.error(f"Error creating scene segment: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to create scene segment")

    # Add CORS headers for video streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
        "Cache-Control": "public, max-age=3600"  # Cache for 1 hour
    }

    return FileResponse(temp_segment_path, media_type="video/mp4", headers=headers)

# NEW: Segment file serving endpoints
@app.get("/api/segment/{analysis_id}/mezzanine/{filename}")
@app.head("/api/segment/{analysis_id}/mezzanine/{filename}")
@app.options("/api/segment/{analysis_id}/mezzanine/{filename}")
async def serve_mezzanine_segment(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    filename: str = FastApiPath(..., title="The segment filename")
):
    """
    Serve mezzanine video segments for timeline playback
    """
    # Construct the path to the mezzanine segment
    segment_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", "mezzanine", filename)

    if not os.path.exists(segment_path):
        logger.error(f"Mezzanine segment not found: {segment_path}")
        raise HTTPException(status_code=404, detail=f"Segment file not found: {filename}")

    # Add CORS headers for video streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
        "Cache-Control": "public, max-age=3600"  # Cache for 1 hour
    }

    return FileResponse(segment_path, media_type="video/mp4", headers=headers)

@app.get("/api/segment/{analysis_id}/proxy/{filename}")
@app.head("/api/segment/{analysis_id}/proxy/{filename}")
@app.options("/api/segment/{analysis_id}/proxy/{filename}")
async def serve_proxy_segment(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    filename: str = FastApiPath(..., title="The segment filename")
):
    """
    Serve proxy video segments for timeline playback
    """
    # Construct the path to the proxy segment
    segment_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", "proxy", filename)

    if not os.path.exists(segment_path):
        logger.error(f"Proxy segment not found: {segment_path}")
        raise HTTPException(status_code=404, detail=f"Segment file not found: {filename}")

    # Add CORS headers for video streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
        "Cache-Control": "public, max-age=3600"  # Cache for 1 hour
    }

    return FileResponse(segment_path, media_type="video/mp4", headers=headers)

# MODIFIED: Use scene_id (UUID) instead of scene_index
@app.patch("/api/analysis/{analysis_id}/scene/{scene_id}")
async def update_scene_metadata(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    scene_id: str = FastApiPath(..., title="The UUID of the scene to update"), # Changed from scene_index
    update_data: SceneMetadataUpdate = Body(...)
):
    analysis_data = load_analysis_data(analysis_id)
    if not analysis_data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    scenes = analysis_data.get("analysisResult", {}).get("scenes", [])

    target_scene = None
    for scene in scenes:
        if scene.get("sceneId") == scene_id: # Find by sceneId (UUID)
            target_scene = scene
            break

    if not target_scene:
        raise HTTPException(status_code=404, detail=f"Scene with ID {scene_id} not found in analysis {analysis_id}")

    updated_fields = False
    if update_data.title is not None:
        if not update_data.title.strip():
             raise HTTPException(status_code=400, detail="Title cannot be empty or just whitespace.")
        target_scene["title"] = update_data.title.strip()
        updated_fields = True

    if update_data.tags is not None:
        target_scene["tags"] = sorted(list(set(tag.strip() for tag in update_data.tags if tag.strip())))
        updated_fields = True

    # No explicit action if no fields updated, just returns current state after saving
    save_analysis_data(analysis_id, analysis_data)
    return JSONResponse(content=target_scene)

# NEW: Scene trimming endpoint
@app.post("/api/analysis/{analysis_id}/scene/{scene_id}/trim")
async def trim_scene_segment(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    scene_id: str = FastApiPath(..., title="The UUID of the scene to trim"),
    trim_data: SceneTrimData = Body(...)
):
    """
    Trim a scene segment by regenerating proxy and mezzanine files.
    This implements the new strategy of storing real video segments.
    """
    analysis_data = load_analysis_data(analysis_id)
    if not analysis_data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    original_full_video_path = analysis_data.get("storedVideoPath")
    if not original_full_video_path or not os.path.exists(original_full_video_path):
        raise HTTPException(status_code=404, detail="Original full video for analysis not found on server.")

    scenes = analysis_data.get("analysisResult", {}).get("scenes", [])
    scene_index = -1
    target_scene_data = None
    for i, s_data in enumerate(scenes):
        if s_data.get("sceneId") == scene_id:
            target_scene_data = s_data
            scene_index = i
            break

    if not target_scene_data:
        raise HTTPException(status_code=404, detail=f"Scene with ID {scene_id} not found.")

    # Get current original start time of the segment (relative to the full video)
    current_segment_start_original = target_scene_data.get("start_original", target_scene_data.get("start"))
    if current_segment_start_original is None:
        raise HTTPException(status_code=500, detail=f"Scene {scene_id} is missing start time metadata. Cannot perform trim.")

    # Calculate the new absolute start time for the trimmed segment within the FULL original video
    new_absolute_start_for_trimmed_segment = current_segment_start_original + trim_data.new_clip_start_time
    new_duration_for_trimmed_segment = trim_data.new_clip_duration

    # Get existing segment paths if they exist (updated for new directory structure)
    existing_proxy_path = None
    existing_mezzanine_path = None

    if target_scene_data.get("proxy_video_url"):
        proxy_filename = target_scene_data["proxy_video_url"].split('/')[-1]
        existing_proxy_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", "proxy", proxy_filename)

    if target_scene_data.get("mezzanine_video_url"):
        mezzanine_filename = target_scene_data["mezzanine_video_url"].split('/')[-1]
        existing_mezzanine_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", "mezzanine", mezzanine_filename)

    try:
        # Regenerate segments with new timing
        regenerated_segments = regenerate_scene_segments(
            analysis_id,
            original_full_video_path,
            target_scene_data,
            new_absolute_start_for_trimmed_segment,
            new_duration_for_trimmed_segment,
            ANALYZED_VIDEOS_DIR,
            existing_proxy_path,
            existing_mezzanine_path
        )

        # Update scene metadata in the loaded analysis_data
        updated_scene_metadata = {
            **target_scene_data,
            "start_original": new_absolute_start_for_trimmed_segment,
            "end_original": new_absolute_start_for_trimmed_segment + new_duration_for_trimmed_segment,
            "start": new_absolute_start_for_trimmed_segment,  # Update start for compatibility
            "end": new_absolute_start_for_trimmed_segment + new_duration_for_trimmed_segment,  # Update end for compatibility
            "duration": new_duration_for_trimmed_segment,
            # Update URLs if segments were regenerated
            **{k: v for k, v in regenerated_segments.items() if k.endswith("_url")},
            # Reset trimming state since segment is now the new baseline
            "current_trimmed_start": 0.0,
            "current_trimmed_duration": new_duration_for_trimmed_segment,
        }

        analysis_data["analysisResult"]["scenes"][scene_index] = updated_scene_metadata
        save_analysis_data(analysis_id, analysis_data)

        # Add cache-busting timestamp to URLs
        timestamp = int(datetime.now().timestamp())
        updated_proxy_url = f"{regenerated_segments.get('proxy_video_url', '')}?v={timestamp}" if regenerated_segments.get('proxy_video_url') else None
        updated_mezzanine_url = f"{regenerated_segments.get('mezzanine_video_url', '')}?v={timestamp}" if regenerated_segments.get('mezzanine_video_url') else None

        return JSONResponse(content={
            "message": "Scene trimmed successfully",
            "updated_scene_metadata": {
                **updated_scene_metadata,
                "proxy_video_url": updated_proxy_url,
                "mezzanine_video_url": updated_mezzanine_url
            }
        })

    except VideoSegmentationError as e:
        logger.error(f"Video segmentation error during trim: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate video segments: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during scene trim: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error during trim operation: {str(e)}")

# NEW: Segment serving endpoint with directory structure
@app.get("/api/segment/{analysis_id}/{segment_type}/{segment_filename}")
@app.head("/api/segment/{analysis_id}/{segment_type}/{segment_filename}")
@app.options("/api/segment/{analysis_id}/{segment_type}/{segment_filename}")
async def stream_segment(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    segment_type: str = FastApiPath(..., title="The type of segment (proxy or mezzanine)"),
    segment_filename: str = FastApiPath(..., title="The filename of the segment to stream")
):
    """
    Stream video segments (proxy/mezzanine files) for scenes.
    """
    # Validate analysis exists
    analysis_data = load_analysis_data(analysis_id)
    if not analysis_data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Validate segment type
    if segment_type not in ["proxy", "mezzanine"]:
        raise HTTPException(status_code=400, detail="Invalid segment type. Must be 'proxy' or 'mezzanine'")

    # Construct segment path with directory structure
    segment_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", segment_type, segment_filename)

    if not os.path.exists(segment_path):
        raise HTTPException(status_code=404, detail=f"Segment file not found: {segment_filename}")

    # Security check: ensure the file is within the expected directory
    expected_dir = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "segments", segment_type)
    if not os.path.commonpath([segment_path, expected_dir]) == expected_dir:
        raise HTTPException(status_code=403, detail="Access denied")

    # Add CORS headers for video streaming
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
        "Cache-Control": "no-cache"
    }

    return FileResponse(segment_path, media_type="video/mp4", headers=headers)

# NEW: Video export endpoint
@app.post("/api/export/video")
async def export_timeline_video(export_data: TimelineExportData = Body(...)):
    """
    Export timeline data to MP4 video by stitching mezzanine segments.
    """
    try:
        # Debug: Log the received timeline data structure
        logger.info(f"🎬 Received export request for analysis: {export_data.analysis_id}")
        logger.info(f"📊 Timeline data keys: {list(export_data.timeline_data.keys())}")

        # Check for trackItemsMap
        track_items_map = export_data.timeline_data.get('trackItemsMap', {})
        logger.info(f"🎞️ trackItemsMap has {len(track_items_map)} items")

        # Log a sample of track items for debugging
        if track_items_map:
            sample_item_id = list(track_items_map.keys())[0]
            sample_item = track_items_map[sample_item_id]
            logger.info(f"📝 Sample track item: {sample_item}")

        # Validate analysis exists
        analysis_data = load_analysis_data(export_data.analysis_id)
        if not analysis_data:
            raise HTTPException(status_code=404, detail="Analysis not found")

        # Generate output filename
        output_filename = get_export_filename(
            export_data.analysis_id,
            export_data.export_name
        )

        # Create exports directory if it doesn't exist
        exports_dir = os.path.join(ANALYZED_VIDEOS_DIR, export_data.analysis_id, "exports")
        os.makedirs(exports_dir, exist_ok=True)

        output_path = os.path.join(exports_dir, output_filename)

        # Export timeline to MP4
        export_result = export_timeline_to_mp4(
            export_data.timeline_data,
            export_data.analysis_id,
            ANALYZED_VIDEOS_DIR,
            output_path,
            export_data.composition_settings
        )

        if export_result["success"]:
            # Return download URL for the exported video
            download_url = f"/api/export/{export_data.analysis_id}/{output_filename}"

            return JSONResponse(content={
                "success": True,
                "message": export_result["message"],
                "download_url": download_url,
                "filename": output_filename,
                "file_size": export_result["file_size"],
                "segments_count": export_result["segments_count"],
                "export_duration": export_result["export_duration"]
            })
        else:
            raise HTTPException(status_code=500, detail="Export failed")

    except VideoExportError as e:
        logger.error(f"Video export error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during video export: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# NEW: Export download endpoint
@app.get("/api/export/{analysis_id}/{filename}")
@app.head("/api/export/{analysis_id}/{filename}")
@app.options("/api/export/{analysis_id}/{filename}")
async def download_exported_video(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis"),
    filename: str = FastApiPath(..., title="The filename of the exported video")
):
    """
    Download exported video files.
    """
    # Validate analysis exists
    analysis_data = load_analysis_data(analysis_id)
    if not analysis_data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Construct export file path
    export_path = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "exports", filename)

    if not os.path.exists(export_path):
        raise HTTPException(status_code=404, detail=f"Export file not found: {filename}")

    # Security check: ensure the file is within the expected directory
    expected_dir = os.path.join(ANALYZED_VIDEOS_DIR, analysis_id, "exports")
    if not os.path.commonpath([export_path, expected_dir]) == expected_dir:
        raise HTTPException(status_code=403, detail="Access denied")

    # Add headers for download
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length, Content-Type",
    }

    return FileResponse(export_path, media_type="video/mp4", headers=headers, filename=filename)

# NEW: Analysis data retrieval endpoint
@app.get("/api/analysis/{analysis_id}")
async def get_analysis_data(
    analysis_id: str = FastApiPath(..., title="The ID of the analysis")
):
    """
    Retrieve analysis data for a given analysis ID
    """
    try:
        # Use the existing load_analysis_data function
        analysis_data = load_analysis_data(analysis_id)
        if not analysis_data:
            logger.error(f"Analysis data not found for ID: {analysis_id}")
            raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")

        logger.info(f"Successfully retrieved analysis data for {analysis_id}")
        return analysis_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving analysis data for {analysis_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve analysis data: {str(e)}")

# --- Transcript API Endpoints ---

@app.post("/api/transcript/{analysis_id}/generate")
async def generate_transcript(analysis_id: str):
    """Generate transcript for analysis"""
    try:
        # Get video path from analysis
        analysis_data = load_analysis_data(analysis_id)
        if not analysis_data:
            raise HTTPException(status_code=404, detail="Analysis not found")

        # Find video file
        video_path = os.path.join(ANALYZED_VIDEOS_DIR, f"{analysis_id}.mp4")
        if not os.path.exists(video_path):
            # Try with original filename
            video_filename = analysis_data.get('fileName', f"{analysis_id}.mp4")
            video_path = os.path.join(ANALYZED_VIDEOS_DIR, video_filename)

            if not os.path.exists(video_path):
                raise HTTPException(status_code=404, detail="Video file not found")

        # Start transcription
        result = await transcript_service.transcribe_full_video(
            analysis_id,
            video_path
        )

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Transcript generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transcript/{analysis_id}")
async def get_transcript_info(analysis_id: str):
    """Get transcript information for analysis"""
    try:
        transcript_info = await transcript_service.get_transcript_info(analysis_id)

        if not transcript_info:
            raise HTTPException(status_code=404, detail="Transcript not found")

        return JSONResponse(content=transcript_info)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get transcript info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transcript/{analysis_id}/scene")
async def get_scene_subtitles(
    analysis_id: str,
    scene_start: float = Query(..., description="Scene start time in seconds"),
    scene_end: float = Query(..., description="Scene end time in seconds"),
    scene_id: Optional[str] = Query(None, description="Optional scene ID for caching")
):
    """Get subtitles for specific scene"""
    try:
        subtitles = await transcript_service.get_scene_subtitles(
            analysis_id, scene_start, scene_end, scene_id
        )

        return JSONResponse(content={
            'subtitles': subtitles,
            'scene_start': scene_start,
            'scene_end': scene_end,
            'count': len(subtitles)
        })

    except Exception as e:
        logger.error(f"Scene subtitle retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def root_health_check():
    return {"status": "ok", "timestamp": "2024-test", "server": "uvicorn-fresh"}

# NEW: Healthcheck endpoint
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": "2024-test", "server": "uvicorn-fresh"}

# Debug endpoint to test if our server is being hit
@app.get("/api/debug")
async def debug_endpoint():
    debug_log_path = os.path.join(BACKEND_DIR, "debug.log")
    with open(debug_log_path, "a") as f:
        f.write("DEBUG: /api/debug endpoint was hit!\n")
    return {"message": "Debug endpoint hit", "log_written": True}

# NEW: Audio Translation endpoint
@app.post("/api/translate-audio")
async def translate_audio_endpoint(translation_request: AudioTranslationRequest = Body(...)):
    """
    Translate audio in a video scene using the audio-translator.py script.
    """
    try:
        logger.info(f"Starting audio translation for scene {translation_request.sceneId}")
        logger.info(f"Translation request: {translation_request}")

        # Get the video file path from analysis data
        analysis_data = load_analysis_data(translation_request.analysisId)
        logger.info(f"Analysis data found: {bool(analysis_data)}")
        if not analysis_data or not analysis_data.get("storedVideoPath"):
            logger.error(f"Video file not found for analysis {translation_request.analysisId}")
            raise HTTPException(status_code=404, detail="Video file not found for analysis")

        video_path = analysis_data["storedVideoPath"]
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="Video file does not exist on server")

        # Create a temporary scene-specific video segment
        temp_scene_dir = os.path.join(BACKEND_DIR, "temp_scene_segments")
        os.makedirs(temp_scene_dir, exist_ok=True)

        scene_video_path = os.path.join(temp_scene_dir, f"scene_{translation_request.sceneId}_{uuid.uuid4().hex[:8]}.mp4")

        # Extract scene segment using ffmpeg
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-ss", str(translation_request.sceneStart),
            "-t", str(translation_request.sceneDuration),
            "-c", "copy",
            scene_video_path
        ]

        logger.info(f"Extracting scene segment: {' '.join(ffmpeg_cmd)}")
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"FFmpeg failed: {result.stderr}")
            raise HTTPException(status_code=500, detail="Failed to extract scene segment")

        # Prepare translation script path
        translation_script_path = os.path.join(BACKEND_DIR, "multi_tool_agent", "audio-translator.py")
        logger.info(f"Looking for translation script at: {translation_script_path}")
        if not os.path.exists(translation_script_path):
            logger.error(f"Translation script not found at: {translation_script_path}")
            logger.error(f"Backend directory contents: {os.listdir(BACKEND_DIR)}")
            multi_tool_dir = os.path.join(BACKEND_DIR, "multi_tool_agent")
            if os.path.exists(multi_tool_dir):
                logger.error(f"Multi tool agent directory contents: {os.listdir(multi_tool_dir)}")
            raise HTTPException(status_code=500, detail="Translation script not found")

        # Check if GEMINI_API_KEY is set
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
        logger.info("GEMINI_API_KEY is configured")

        # Create output directory for translated videos
        translated_videos_dir = os.path.join(BACKEND_DIR, "translated_videos")
        os.makedirs(translated_videos_dir, exist_ok=True)

        # Create a working directory for the translation script
        script_work_dir = os.path.join(BACKEND_DIR, "multi_tool_agent")

        # Set up environment variables for the subprocess
        env = os.environ.copy()
        env['PYTHONPATH'] = BACKEND_DIR
        env['PYTHONUNBUFFERED'] = '1'  # Ensure output is not buffered
        # Disable MoviePy progress bars to avoid tqdm issues in subprocess
        env['MOVIEPY_PROGRESS_BAR'] = '0'
        # Ensure Google Cloud credentials are available
        if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
            env['GOOGLE_APPLICATION_CREDENTIALS'] = os.environ['GOOGLE_APPLICATION_CREDENTIALS']
        # Set Google Cloud project ID
        if 'GCP_PROJECT_ID' in os.environ:
            env['GOOGLE_CLOUD_PROJECT'] = os.environ['GCP_PROJECT_ID']

        # Build the command exactly like your manual execution
        # Copy the scene video to the script directory so paths work the same
        scene_video_name = os.path.basename(scene_video_path)
        local_scene_path = os.path.join(script_work_dir, scene_video_name)
        shutil.copy2(scene_video_path, local_scene_path)

        # Use the same Python interpreter that's running the backend
        python_executable = sys.executable

        # Build the command with the correct Python interpreter
        translation_cmd_str = f'cd "{script_work_dir}" && "{python_executable}" audio-translator.py "{scene_video_name}" "{translation_request.targetLanguage}" "{translation_request.voice}"'

        logger.info(f"Running translation command: {translation_cmd_str}")
        start_time = datetime.now()

        # Run translation with shell=True for better environment handling
        translation_result = subprocess.run(
            translation_cmd_str,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            env=env  # Pass environment variables
        )

        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        if translation_result.returncode != 0:
            logger.error(f"Translation script failed with return code: {translation_result.returncode}")
            logger.error(f"STDOUT: {translation_result.stdout}")
            logger.error(f"STDERR: {translation_result.stderr}")
            logger.error(f"Command: {translation_cmd_str}")
            raise HTTPException(status_code=500, detail=f"Translation failed: {translation_result.stderr}")

        # Parse the output to get the translated video path
        output_lines = translation_result.stdout.strip().split('\n')
        translated_video_path = None

        for line in output_lines:
            if "Final translated video saved at:" in line:
                translated_video_path = line.split("Final translated video saved at:")[-1].strip()
                # The script creates files in its working directory, so make path absolute
                if not os.path.isabs(translated_video_path):
                    translated_video_path = os.path.join(script_work_dir, translated_video_path)
                break

        if not translated_video_path:
            logger.error(f"Could not find translated video path in output: {output_lines}")
            raise HTTPException(status_code=500, detail="Translation completed but output path not found in script output")

        if not os.path.exists(translated_video_path):
            logger.error(f"Translated video file does not exist: {translated_video_path}")
            raise HTTPException(status_code=500, detail=f"Translation completed but output video not found at: {translated_video_path}")

        # Move the translated video to our managed directory
        final_translated_path = os.path.join(
            translated_videos_dir,
            f"translated_{translation_request.sceneId}_{uuid.uuid4().hex[:8]}.mp4"
        )
        shutil.move(translated_video_path, final_translated_path)

        # Create a URL for the translated video
        translated_video_url = f"/api/translated-video/{os.path.basename(final_translated_path)}"

        # Clean up temporary scene videos
        if os.path.exists(scene_video_path):
            os.remove(scene_video_path)
        if os.path.exists(local_scene_path):
            os.remove(local_scene_path)

        logger.info(f"Translation completed successfully in {processing_time:.2f} seconds")

        return JSONResponse(content={
            "translatedVideoUrl": translated_video_url,
            "originalLanguage": "en",  # Assuming English as default
            "targetLanguage": translation_request.targetLanguage,
            "voice": translation_request.voice,
            "processingTime": f"{processing_time:.2f}s",
            "sceneId": translation_request.sceneId,
            "analysisId": translation_request.analysisId
        })

    except subprocess.TimeoutExpired:
        logger.error("Translation process timed out")
        raise HTTPException(status_code=408, detail="Translation process timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during translation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

# NEW: Translated video serving endpoint
@app.get("/api/translated-video/{filename}")
@app.head("/api/translated-video/{filename}")
@app.options("/api/translated-video/{filename}")
async def serve_translated_video(filename: str = FastApiPath(..., title="The translated video filename")):
    """Serve translated video files"""
    translated_videos_dir = os.path.join(BACKEND_DIR, "translated_videos")
    video_path = os.path.join(translated_videos_dir, filename)

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Translated video not found")

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600"  # Cache for 1 hour
    }

    return FileResponse(video_path, media_type="video/mp4", headers=headers)

# Remotion Renderer Configuration
REMOTION_RENDERER_URL = "http://localhost:3001"

# Remotion render endpoints
@app.post("/api/render")
async def start_render(request: Request):
    """Start a Remotion render job by proxying to the Remotion renderer service"""
    try:
        body = await request.json()
        logger.info("🎬 Received render request, forwarding to Remotion renderer")

        # Forward the request to the Remotion renderer service
        response = requests.post(
            f"{REMOTION_RENDERER_URL}/api/render",
            json=body,
            timeout=30
        )

        if response.status_code != 200:
            logger.error(f"Remotion renderer error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        return JSONResponse(content=response.json())

    except requests.exceptions.ConnectionError:
        logger.error("Could not connect to Remotion renderer service")
        raise HTTPException(status_code=503, detail="Remotion renderer service unavailable")
    except requests.exceptions.Timeout:
        logger.error("Remotion renderer service timeout")
        raise HTTPException(status_code=504, detail="Remotion renderer service timeout")
    except Exception as e:
        logger.error(f"Error forwarding render request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/render")
async def check_render_status(request: Request):
    """Check render status by proxying to the Remotion renderer service"""
    try:
        # Forward query parameters
        query_params = dict(request.query_params)
        logger.info(f"🎬 Checking render status: {query_params}")

        response = requests.get(
            f"{REMOTION_RENDERER_URL}/api/render",
            params=query_params,
            timeout=10
        )

        if response.status_code != 200:
            logger.error(f"Remotion renderer error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        return JSONResponse(content=response.json())

    except requests.exceptions.ConnectionError:
        logger.error("Could not connect to Remotion renderer service")
        raise HTTPException(status_code=503, detail="Remotion renderer service unavailable")
    except requests.exceptions.Timeout:
        logger.error("Remotion renderer service timeout")
        raise HTTPException(status_code=504, detail="Remotion renderer service timeout")
    except Exception as e:
        logger.error(f"Error checking render status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{filename}")
async def download_rendered_video(filename: str):
    """Download rendered video by proxying to the Remotion renderer service"""
    try:
        logger.info(f"🎬 Downloading rendered video: {filename}")

        response = requests.get(
            f"{REMOTION_RENDERER_URL}/api/download/{filename}",
            stream=True,
            timeout=30
        )

        if response.status_code != 200:
            logger.error(f"Remotion renderer error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail="Video not found")

        # Stream the file response
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(
            generate(),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Accept-Ranges": "bytes"
            }
        )

    except requests.exceptions.ConnectionError:
        logger.error("Could not connect to Remotion renderer service")
        raise HTTPException(status_code=503, detail="Remotion renderer service unavailable")
    except requests.exceptions.Timeout:
        logger.error("Remotion renderer service timeout")
        raise HTTPException(status_code=504, detail="Remotion renderer service timeout")
    except Exception as e:
        logger.error(f"Error downloading rendered video: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/performance/metrics")
async def get_performance_metrics(hours: int = Query(24, description="Time window in hours")):
    """Get performance metrics summary for the specified time window."""
    try:
        summary = performance_monitor.get_metrics_summary(time_window_hours=hours)
        return JSONResponse(content=summary)
    except Exception as e:
        logger.error(f"Error retrieving performance metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve performance metrics")

@app.post("/api/performance/clear")
async def clear_old_metrics(days: int = Query(7, description="Keep metrics newer than N days")):
    """Clear old performance metrics."""
    try:
        performance_monitor.clear_old_metrics(days_to_keep=days)
        return JSONResponse(content={"message": f"Cleared metrics older than {days} days"})
    except Exception as e:
        logger.error(f"Error clearing performance metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clear performance metrics")

if __name__ == "__main__":
    import uvicorn
    # Use PORT environment variable for cloud deployment, default to 8080 for consistency
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)