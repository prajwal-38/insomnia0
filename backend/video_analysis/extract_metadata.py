# --- START OF FILE extract_metadata.py ---

import json
import os
import sys
import cv2
from moviepy.editor import VideoFileClip
import contextlib # For redirecting stdout/stderr

# Helper for temporarily suppressing stdout/stderr
@contextlib.contextmanager
def suppress_stdout_stderr():
    """A context manager that redirects stdout and stderr to devnull"""
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    devnull = open(os.devnull, 'w')
    try:
        sys.stdout = devnull
        sys.stderr = devnull
        yield
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        devnull.close()

def extract_metadata(video_path):
    """
    Extract metadata from a video file using moviepy and OpenCV.
    
    Args:
        video_path (str): Path to the video file
        
    Returns:
        dict: Dictionary containing video metadata
    """
    try:
        # First try to get basic metadata using OpenCV (faster)
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            # Try with MoviePy as a fallback for opening, suppressing its output
            try:
                with suppress_stdout_stderr(): # Suppress MoviePy's own console output
                    with VideoFileClip(video_path, audio=False) as clip_check:
                        if not clip_check:
                            raise Exception("Could not open video file with MoviePy either")
            except Exception as e_moviepy:
                # Print actual error to our stderr if MoviePy fails
                print(f"MoviePy check failed: {e_moviepy}", file=sys.__stderr__) # Use original stderr
                raise Exception(f"Could not open video file with OpenCV or MoviePy")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        
        cap.release()
        
        metadata = {
            "duration": round(duration, 3),
            "fps": round(fps, 3),
            "resolution": { "width": width, "height": height },
            "frame_count": frame_count,
            "audio": None
        }
        
        # Use MoviePy to get audio information, suppressing its output
        with suppress_stdout_stderr(): # Suppress MoviePy's own console output
            with VideoFileClip(video_path, audio=True) as clip:
                if clip.audio is not None:
                    metadata["audio"] = {
                        "channels": clip.audio.nchannels,
                        "fps": clip.audio.fps,
                        "duration": round(clip.audio.duration, 3)
                    }
        
        return metadata
    
    except Exception as e:
        # Print the error to the *original* stderr so it's visible in backend logs
        print(f"Error extracting metadata: {str(e)}", file=sys.__stderr__)
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_metadata.py <video_file_path>", file=sys.stderr)
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    if not os.path.exists(video_path):
        print(f"Error: File '{video_path}' does not exist", file=sys.stderr)
        sys.exit(1)
    
    metadata_result = extract_metadata(video_path) # Renamed for clarity
    
    if metadata_result:
        print(json.dumps(metadata_result, indent=2)) # To stdout for backend
    else:
        # Error message already printed to stderr by extract_metadata
        sys.exit(1)

if __name__ == "__main__":
    main()
# --- END OF FILE extract_metadata.py ---