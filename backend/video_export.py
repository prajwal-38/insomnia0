"""
Video Export Module
Handles exporting timeline data to MP4 videos by stitching mezzanine segments
"""

import os
import subprocess
import tempfile
import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime


class VideoExportError(Exception):
    """Custom exception for video export errors"""
    pass


def create_ffmpeg_concat_file(segments: List[Dict[str, Any]], temp_dir: str) -> str:
    """
    Create an FFmpeg concat file for stitching video segments.
    
    Args:
        segments: List of segment data with file paths and timing
        temp_dir: Temporary directory for concat file
        
    Returns:
        Path to the concat file
    """
    concat_file_path = os.path.join(temp_dir, f"concat_{uuid.uuid4().hex}.txt")
    
    with open(concat_file_path, 'w') as f:
        for segment in segments:
            # Write each segment file path
            segment_path = segment['file_path']
            if os.path.exists(segment_path):
                f.write(f"file '{segment_path}'\n")
            else:
                raise VideoExportError(f"Segment file not found: {segment_path}")
    
    return concat_file_path


def extract_timeline_segments(timeline_data: Dict[str, Any], analysis_id: str, segments_base_dir: str) -> List[Dict[str, Any]]:
    """
    Extract mezzanine segment information from timeline data.

    Args:
        timeline_data: Timeline data from frontend
        analysis_id: Analysis ID for locating segments
        segments_base_dir: Base directory containing segments

    Returns:
        List of segment data for stitching
    """
    segments = []

    # Try to get clips from different possible locations in timeline data
    clips = []

    # First, try trackItemsMap (designcombo timeline format)
    track_items_map = timeline_data.get('trackItemsMap', {})
    if track_items_map:
        print(f"🎬 Found trackItemsMap with {len(track_items_map)} items")
        clips = list(track_items_map.values())

    # Fallback: try clips array (legacy format)
    if not clips:
        clips = timeline_data.get('clips', [])
        if clips:
            print(f"🎬 Found clips array with {len(clips)} items")

    if not clips:
        # Debug: print available keys in timeline data
        available_keys = list(timeline_data.keys())
        print(f"❌ No clips found. Available keys in timeline data: {available_keys}")
        raise VideoExportError("No clips found in timeline data")

    # Filter for mezzanine video segments
    mezzanine_clips = []
    for clip in clips:
        clip_type = clip.get('type', '')
        is_mezzanine = clip.get('metadata', {}).get('isMezzanineSegment', False)
        has_src = bool(clip.get('details', {}).get('src', ''))

        print(f"🔍 Checking clip {clip.get('id', 'unknown')}: type={clip_type}, isMezzanine={is_mezzanine}, hasSrc={has_src}")

        if clip_type == 'video' and is_mezzanine and has_src:
            mezzanine_clips.append(clip)

    if not mezzanine_clips:
        print(f"❌ No mezzanine video segments found. Total clips checked: {len(clips)}")
        raise VideoExportError("No mezzanine video segments found in timeline")

    print(f"✅ Found {len(mezzanine_clips)} mezzanine clips")

    # Sort clips by timeline position (display.from)
    mezzanine_clips.sort(key=lambda x: x.get('display', {}).get('from', 0))

    # Build segment list
    mezzanine_dir = os.path.join(segments_base_dir, analysis_id, "segments", "mezzanine")

    for clip in mezzanine_clips:
        src_url = clip.get('details', {}).get('src', '')
        if not src_url:
            continue

        # Extract filename from URL
        filename = src_url.split('/')[-1].split('?')[0]  # Remove query params
        segment_path = os.path.join(mezzanine_dir, filename)

        print(f"🎞️ Processing segment: {filename}")
        print(f"   Timeline: {clip.get('display', {}).get('from', 0)} - {clip.get('display', {}).get('to', 0)}")
        print(f"   Path: {segment_path}")

        if not os.path.exists(segment_path):
            raise VideoExportError(f"Mezzanine segment file not found: {segment_path}")

        segments.append({
            'file_path': segment_path,
            'timeline_start': clip.get('display', {}).get('from', 0),
            'timeline_end': clip.get('display', {}).get('to', 0),
            'scene_id': clip.get('metadata', {}).get('sceneId'),
            'clip_id': clip.get('id')
        })

    print(f"✅ Successfully extracted {len(segments)} segments for export")
    return segments


def export_timeline_to_mp4(
    timeline_data: Dict[str, Any],
    analysis_id: str,
    segments_base_dir: str,
    output_path: str,
    composition_settings: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Export timeline data to MP4 by stitching mezzanine segments.
    
    Args:
        timeline_data: Timeline data from frontend
        analysis_id: Analysis ID for locating segments
        segments_base_dir: Base directory containing segments
        output_path: Output MP4 file path
        composition_settings: Video composition settings (width, height, fps)
        
    Returns:
        Export result information
    """
    start_time = datetime.now()
    
    try:
        # Extract segments from timeline data
        segments = extract_timeline_segments(timeline_data, analysis_id, segments_base_dir)
        
        if not segments:
            raise VideoExportError("No valid segments found for export")
        
        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create FFmpeg concat file
            concat_file_path = create_ffmpeg_concat_file(segments, temp_dir)
            
            # Prepare FFmpeg command for concatenation
            ffmpeg_cmd = [
                "ffmpeg",
                "-y",  # Overwrite output file
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file_path,
                "-c", "copy",  # Copy streams without re-encoding for speed
                "-movflags", "+faststart",  # Optimize for web playback
            ]
            
            # Add composition settings if provided
            if composition_settings:
                width = composition_settings.get('width', 1920)
                height = composition_settings.get('height', 1080)
                fps = composition_settings.get('fps', 30)
                
                # If we need to resize or change fps, we need to re-encode
                ffmpeg_cmd = [
                    "ffmpeg",
                    "-y",
                    "-f", "concat",
                    "-safe", "0", 
                    "-i", concat_file_path,
                    "-vf", f"scale={width}:{height}",
                    "-r", str(fps),
                    "-c:v", "libx264",
                    "-preset", "medium",
                    "-crf", "23",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    "-movflags", "+faststart",
                ]
            
            ffmpeg_cmd.append(output_path)
            
            # Execute FFmpeg command
            process = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True,
                check=False
            )
            
            if process.returncode != 0:
                error_msg = f"FFmpeg failed: {process.stderr}"
                raise VideoExportError(error_msg)
            
            # Verify output file was created
            if not os.path.exists(output_path):
                raise VideoExportError("Output file was not created")
            
            # Get file size
            file_size = os.path.getsize(output_path)
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            return {
                "success": True,
                "output_path": output_path,
                "file_size": file_size,
                "segments_count": len(segments),
                "export_duration": duration,
                "composition_settings": composition_settings,
                "message": f"Successfully exported {len(segments)} segments to MP4"
            }
            
    except VideoExportError:
        raise
    except Exception as e:
        raise VideoExportError(f"Unexpected error during export: {str(e)}")


def get_export_filename(analysis_id: str, timeline_name: Optional[str] = None) -> str:
    """
    Generate a filename for the exported video.
    
    Args:
        analysis_id: Analysis ID
        timeline_name: Optional timeline name
        
    Returns:
        Generated filename
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if timeline_name:
        # Sanitize timeline name for filename
        safe_name = "".join(c for c in timeline_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_name = safe_name.replace(' ', '_')
        return f"{safe_name}_{timestamp}.mp4"
    else:
        return f"timeline_export_{analysis_id[:8]}_{timestamp}.mp4"
