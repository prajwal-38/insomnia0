"""
Video segmentation utilities for generating proxy and mezzanine segments.
Implements the new strategy of storing real video segments instead of references.
"""

import os
import subprocess
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class VideoSegmentationError(Exception):
    """Custom exception for video segmentation errors."""
    pass

def generate_segment(
    original_full_video_path: str,
    output_segment_path: str,
    segment_start_original: float,
    segment_duration: float,
    ffmpeg_settings: List[str],
    overwrite: bool = True
) -> bool:
    """
    Generate a video segment using FFmpeg.
    
    Args:
        original_full_video_path: Path to the original full video
        output_segment_path: Path where the segment should be saved
        segment_start_original: Start time in the original video (seconds)
        segment_duration: Duration of the segment (seconds)
        ffmpeg_settings: List of FFmpeg settings/flags
        overwrite: Whether to overwrite existing files
        
    Returns:
        bool: True if successful, False otherwise
        
    Raises:
        VideoSegmentationError: If FFmpeg fails
    """
    try:
        # Ensure output directory exists
        output_dir = os.path.dirname(output_segment_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            
        # Build FFmpeg command
        command = [
            "ffmpeg",
            "-y" if overwrite else "-n",  # Overwrite or not
            "-ss", str(segment_start_original),  # Seek to start time
            "-i", original_full_video_path,      # Input file
            "-t", str(segment_duration),         # Duration
            *ffmpeg_settings,                    # Apply specific settings
            "-movflags", "+faststart",           # Optimize for web playback
            output_segment_path
        ]
        
        logger.info(f"Generating segment: {output_segment_path}")
        logger.debug(f"FFmpeg command: {' '.join(command)}")

        # Verify input file exists
        if not os.path.exists(original_full_video_path):
            error_msg = f"Input video file not found: {original_full_video_path}"
            logger.error(error_msg)
            raise VideoSegmentationError(error_msg)

        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=600  # 10 minute timeout (increased for large files)
        )

        if process.returncode != 0:
            error_msg = f"FFmpeg failed (code {process.returncode}) for {output_segment_path}"
            logger.error(f"{error_msg}")
            logger.error(f"FFmpeg stderr: {process.stderr}")
            logger.error(f"FFmpeg stdout: {process.stdout}")
            raise VideoSegmentationError(error_msg)

        # Verify output file was created
        if not os.path.exists(output_segment_path):
            error_msg = f"FFmpeg completed but output file not found: {output_segment_path}"
            logger.error(error_msg)
            raise VideoSegmentationError(error_msg)

        logger.info(f"Successfully generated segment: {output_segment_path}")
        return True
        
    except subprocess.TimeoutExpired:
        error_msg = f"FFmpeg timeout for segment generation: {output_segment_path}"
        logger.error(error_msg)
        raise VideoSegmentationError(error_msg)
    except Exception as e:
        error_msg = f"Unexpected error during segment generation: {str(e)}"
        logger.error(error_msg)
        raise VideoSegmentationError(error_msg)

def get_proxy_ffmpeg_settings() -> List[str]:
    """Get FFmpeg settings for proxy (low-res preview) segments optimized for VM."""
    return [
        "-vf", "scale=640:-2",      # Scale to 640px width, maintain aspect ratio
        "-c:v", "libx264",          # H.264 codec
        "-preset", "ultrafast",     # Fastest encoding for proxy
        "-threads", "0",            # Use all available CPU cores
        "-crf", "28",               # Lower quality for speed
        "-an",                      # No audio for proxy
        "-avoid_negative_ts", "make_zero",  # Handle timestamp issues
        "-fflags", "+genpts",       # Generate presentation timestamps
        "-movflags", "+faststart"   # Optimize for web streaming
    ]

def get_mezzanine_ffmpeg_settings() -> List[str]:
    """Get FFmpeg settings for mezzanine (high-quality) segments optimized for VM."""
    return [
        "-vf", "scale=1280:-2",     # Scale to 1280px width, maintain aspect ratio
        "-c:v", "libx264",          # H.264 codec
        "-preset", "veryfast",      # Very fast encoding (optimized for VM)
        "-threads", "0",            # Use all available CPU cores
        "-crf", "23",               # Good quality
        "-c:a", "aac",              # AAC audio codec
        "-b:a", "128k",             # Audio bitrate
        "-avoid_negative_ts", "make_zero",  # Handle timestamp issues
        "-fflags", "+genpts",       # Generate presentation timestamps
        "-movflags", "+faststart"   # Optimize for web streaming
    ]

def generate_scene_segments(
    analysis_id: str,
    original_video_path: str,
    scene_data: Dict[str, Any],
    segments_base_dir: str,
    generate_proxy: bool = True,
    generate_mezzanine: bool = True
) -> Dict[str, str]:
    """
    Generate proxy and mezzanine segments for a scene.
    
    Args:
        analysis_id: Analysis ID for organizing files
        original_video_path: Path to the original full video
        scene_data: Scene metadata containing start, end, sceneId
        segments_base_dir: Base directory for storing segments
        generate_proxy: Whether to generate proxy segment
        generate_mezzanine: Whether to generate mezzanine segment
        
    Returns:
        Dict containing URLs/paths to generated segments
        
    Raises:
        VideoSegmentationError: If segment generation fails
    """
    scene_id = scene_data.get("sceneId")
    if not scene_id:
        raise VideoSegmentationError("Scene data missing sceneId")
        
    start_time = scene_data.get("start", 0)
    end_time = scene_data.get("end", 0)
    duration = end_time - start_time
    
    if duration <= 0:
        raise VideoSegmentationError(f"Invalid scene duration: {duration}")
    
    # Create separate directories for proxy and mezzanine segments
    analysis_segments_dir = os.path.join(segments_base_dir, analysis_id, "segments")
    proxy_dir = os.path.join(analysis_segments_dir, "proxy")
    mezzanine_dir = os.path.join(analysis_segments_dir, "mezzanine")

    os.makedirs(proxy_dir, exist_ok=True)
    os.makedirs(mezzanine_dir, exist_ok=True)

    generated_segments = {}

    # Generate proxy segment
    if generate_proxy:
        proxy_filename = f"scene_{scene_id}_proxy.mp4"
        proxy_path = os.path.join(proxy_dir, proxy_filename)
        
        try:
            generate_segment(
                original_video_path,
                proxy_path,
                start_time,
                duration,
                get_proxy_ffmpeg_settings()
            )
            generated_segments["proxy_video_path"] = proxy_path
            generated_segments["proxy_video_url"] = f"/api/segment/{analysis_id}/proxy/{proxy_filename}"
        except VideoSegmentationError as e:
            logger.error(f"Failed to generate proxy segment for scene {scene_id}: {e}")
            # Continue with mezzanine generation even if proxy fails
    
    # Generate mezzanine segment
    if generate_mezzanine:
        mezzanine_filename = f"scene_{scene_id}_mezzanine.mp4"
        mezzanine_path = os.path.join(mezzanine_dir, mezzanine_filename)
        
        try:
            generate_segment(
                original_video_path,
                mezzanine_path,
                start_time,
                duration,
                get_mezzanine_ffmpeg_settings()
            )
            generated_segments["mezzanine_video_path"] = mezzanine_path
            generated_segments["mezzanine_video_url"] = f"/api/segment/{analysis_id}/mezzanine/{mezzanine_filename}"
        except VideoSegmentationError as e:
            logger.error(f"Failed to generate mezzanine segment for scene {scene_id}: {e}")
    
    if not generated_segments:
        raise VideoSegmentationError(f"Failed to generate any segments for scene {scene_id}")
    
    return generated_segments

def regenerate_scene_segments(
    analysis_id: str,
    original_video_path: str,
    scene_data: Dict[str, Any],
    new_start_original: float,
    new_duration: float,
    segments_base_dir: str,
    existing_proxy_path: Optional[str] = None,
    existing_mezzanine_path: Optional[str] = None
) -> Dict[str, str]:
    """
    Regenerate segments for a scene after trimming.
    
    Args:
        analysis_id: Analysis ID
        original_video_path: Path to original video
        scene_data: Scene metadata
        new_start_original: New start time in original video
        new_duration: New duration after trimming
        segments_base_dir: Base directory for segments
        existing_proxy_path: Path to existing proxy file (will be overwritten)
        existing_mezzanine_path: Path to existing mezzanine file (will be overwritten)
        
    Returns:
        Dict containing updated segment information
    """
    scene_id = scene_data.get("sceneId")
    if not scene_id:
        raise VideoSegmentationError("Scene data missing sceneId")
    
    analysis_segments_dir = os.path.join(segments_base_dir, analysis_id, "segments")
    proxy_dir = os.path.join(analysis_segments_dir, "proxy")
    mezzanine_dir = os.path.join(analysis_segments_dir, "mezzanine")

    os.makedirs(proxy_dir, exist_ok=True)
    os.makedirs(mezzanine_dir, exist_ok=True)

    regenerated_segments = {}

    # Regenerate proxy if path provided or determine default path
    if existing_proxy_path or True:  # Always try to regenerate proxy
        if not existing_proxy_path:
            proxy_filename = f"scene_{scene_id}_proxy.mp4"
            existing_proxy_path = os.path.join(proxy_dir, proxy_filename)
        
        try:
            generate_segment(
                original_video_path,
                existing_proxy_path,
                new_start_original,
                new_duration,
                get_proxy_ffmpeg_settings(),
                overwrite=True
            )
            regenerated_segments["proxy_video_path"] = existing_proxy_path
            proxy_filename = os.path.basename(existing_proxy_path)
            regenerated_segments["proxy_video_url"] = f"/api/segment/{analysis_id}/proxy/{proxy_filename}"
        except VideoSegmentationError as e:
            logger.error(f"Failed to regenerate proxy segment for scene {scene_id}: {e}")
    
    # Regenerate mezzanine if path provided or determine default path
    if existing_mezzanine_path or True:  # Always try to regenerate mezzanine
        if not existing_mezzanine_path:
            mezzanine_filename = f"scene_{scene_id}_mezzanine.mp4"
            existing_mezzanine_path = os.path.join(mezzanine_dir, mezzanine_filename)
        
        try:
            generate_segment(
                original_video_path,
                existing_mezzanine_path,
                new_start_original,
                new_duration,
                get_mezzanine_ffmpeg_settings(),
                overwrite=True
            )
            regenerated_segments["mezzanine_video_path"] = existing_mezzanine_path
            mezzanine_filename = os.path.basename(existing_mezzanine_path)
            regenerated_segments["mezzanine_video_url"] = f"/api/segment/{analysis_id}/mezzanine/{mezzanine_filename}"
        except VideoSegmentationError as e:
            logger.error(f"Failed to regenerate mezzanine segment for scene {scene_id}: {e}")
    
    return regenerated_segments
