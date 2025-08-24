# Database models for transcript storage and user management
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, ForeignKey, JSON, Index, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

class User(Base):
    """
    User table for authentication and project ownership
    """
    __tablename__ = "users"

    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Google OAuth information
    google_id = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    picture = Column(String)  # Profile picture URL

    # Account status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime)

    # Relationships
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index('idx_google_id', 'google_id'),
        Index('idx_email', 'email'),
        Index('idx_created_at', 'created_at'),
    )

class Project(Base):
    """
    Project table for user-specific project management
    """
    __tablename__ = "projects"

    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Foreign key to user
    user_id = Column(String, ForeignKey('users.id'), nullable=False)

    # Project metadata
    name = Column(String, nullable=False)
    description = Column(Text)
    thumbnail = Column(String)  # Thumbnail URL
    video_file_name = Column(String)
    duration = Column(Float)
    scene_count = Column(Integer, default=0)

    # Project status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_modified = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    owner = relationship("User", back_populates="projects")

    # Indexes
    __table_args__ = (
        Index('idx_user_id', 'user_id'),
        Index('idx_user_updated', 'user_id', 'updated_at'),
        Index('idx_active', 'is_active'),
    )

class VideoTranscript(Base):
    """
    Main table for storing video transcripts
    """
    __tablename__ = "video_transcripts"
    
    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key to analysis
    analysis_id = Column(String, nullable=False, unique=True, index=True)
    
    # Video metadata
    video_filename = Column(String, nullable=False)
    video_duration = Column(Float, nullable=False)
    
    # Transcription metadata
    language_code = Column(String, default='en-US')
    transcription_method = Column(String, default='assemblyai')
    confidence_score = Column(Float)
    full_transcript_text = Column(Text)
    
    # Processing metadata
    processing_time_seconds = Column(Integer)
    api_response_id = Column(String)  # AssemblyAI transcript ID
    status = Column(String, default='completed')
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    segments = relationship("TranscriptSegment", back_populates="transcript", cascade="all, delete-orphan")
    scene_subtitles = relationship("SceneSubtitle", back_populates="transcript", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_analysis_id', 'analysis_id'),
        Index('idx_status', 'status'),
        Index('idx_created_at', 'created_at'),
    )

class TranscriptSegment(Base):
    """
    Table for storing individual transcript segments with word-level timing
    """
    __tablename__ = "transcript_segments"
    
    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key to transcript
    transcript_id = Column(String, ForeignKey('video_transcripts.id'), nullable=False)
    
    # Timing information
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    
    # Content
    text = Column(Text, nullable=False)
    confidence = Column(Float)
    speaker_label = Column(String)
    segment_type = Column(String, default='word')  # 'word', 'sentence', 'paragraph'
    
    # Relationship
    transcript = relationship("VideoTranscript", back_populates="segments")
    
    # Indexes for fast time-based queries
    __table_args__ = (
        Index('idx_transcript_timing', 'transcript_id', 'start_time', 'end_time'),
        Index('idx_transcript_text', 'transcript_id', 'text'),
        Index('idx_segment_type', 'transcript_id', 'segment_type'),
    )

class SceneSubtitle(Base):
    """
    Cache table for scene-specific subtitle data
    """
    __tablename__ = "scene_subtitles"
    
    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Scene identification
    scene_id = Column(String, nullable=False, index=True)
    
    # Foreign key to transcript
    transcript_id = Column(String, ForeignKey('video_transcripts.id'), nullable=False)
    
    # Scene timing
    scene_start_time = Column(Float, nullable=False)
    scene_end_time = Column(Float, nullable=False)
    
    # Cached subtitle data (JSON format)
    subtitle_data = Column(JSON, nullable=False)
    
    # Timestamp
    generated_at = Column(DateTime, server_default=func.now())
    
    # Relationship
    transcript = relationship("VideoTranscript", back_populates="scene_subtitles")
    
    # Indexes
    __table_args__ = (
        Index('idx_scene_subtitles', 'scene_id'),
        Index('idx_transcript_scenes', 'transcript_id'),
        Index('idx_scene_timing', 'scene_start_time', 'scene_end_time'),
    )
