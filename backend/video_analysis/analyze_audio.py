# --- START OF FILE analyze_audio.py ---

import json
import os
import sys
import numpy as np
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

def analyze_audio(video_path, interval=1.0, high_energy_threshold=0.7):
    """
    Analyze audio volume from a video file to estimate scene energy.
    """
    try:
        # Load the video file, suppress console output from MoviePy
        with suppress_stdout_stderr(): # Suppress MoviePy's own console output
            with VideoFileClip(video_path) as video:
                if video.audio is None:
                    # Print to original stderr if needed for actual warnings
                    print("Warning: No audio track found in the video", file=sys.__stderr__)
                    return []
                
                audio = video.audio
                # Specify target fps for to_soundarray if you want to resample
                # If not, it uses audio.fps by default.
                audio_array = audio.to_soundarray(fps=audio.fps) 
        
        # Continue with processing audio_array (which is now outside the suppress block)
        if len(audio_array.shape) > 1 and audio_array.shape[1] > 1:
            audio_array = np.mean(audio_array, axis=1)
        
        # Use the duration obtained from the VideoFileClip context
        # This duration should be from the clip object before it's closed
        # So, it's better to get it while 'video' (the clip) is still in scope
        # For this, we might need to extract duration within the suppress block
        # Or, rely on metadata from extract_metadata.py passed in, which is cleaner.
        # For now, let's re-open briefly to get duration if not passed in.
        # A better design would be to pass duration from the metadata step.

        # Re-open briefly (and silently) just for duration if not available elsewhere
        # This is inefficient but works if duration isn't passed.
        temp_duration = 0
        with suppress_stdout_stderr():
             with VideoFileClip(video_path) as temp_clip:
                 temp_duration = temp_clip.duration

        duration = temp_duration # video.duration would be out of scope here

        num_intervals = int(np.ceil(duration / interval))
        
        samples_per_interval = int(audio.fps * interval) # audio.fps is from the first clip opening
        
        volume_data = []
        
        for i in range(num_intervals):
            start_time = i * interval
            end_time = min((i + 1) * interval, duration)
            
            start_idx = int(start_time * audio.fps)
            end_idx = min(int(end_time * audio.fps), len(audio_array))
            
            if start_idx >= end_idx:
                continue
            
            segment = audio_array[start_idx:end_idx]
            
            if segment.size == 0:
                volume = 0.0
            else:
                volume = np.sqrt(np.mean(segment**2))

            normalized_volume = min(1.0, volume / 0.05 if volume > 1e-5 else 0.0) 
            is_high_energy = normalized_volume >= high_energy_threshold
            
            volume_data.append({
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "volume": round(normalized_volume, 3),
                "high_energy": int(is_high_energy)
            })
        
        return volume_data
    
    except Exception as e:
        print(f"Error analyzing audio: {str(e)}", file=sys.__stderr__) # Print to original stderr
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_audio.py <video_file_path> [interval] [threshold]", file=sys.stderr)
        sys.exit(1)
    
    video_path = sys.argv[1]
    interval = 1.0
    threshold = 0.7
    
    if len(sys.argv) >= 3:
        try: interval = float(sys.argv[2])
        except ValueError: 
            print(f"Error: Interval must be a number", file=sys.stderr); sys.exit(1)
    if len(sys.argv) >= 4:
        try:
            threshold = float(sys.argv[3])
            if not 0 <= threshold <= 1: raise ValueError("Threshold must be between 0 and 1")
        except ValueError as e: print(f"Error: {str(e)}", file=sys.stderr); sys.exit(1)
    
    if not os.path.exists(video_path):
        print(f"Error: File '{video_path}' does not exist", file=sys.stderr); sys.exit(1)
    
    volume_data_result = analyze_audio(video_path, interval, threshold) # Renamed
    
    if volume_data_result is not None:
        print(json.dumps(volume_data_result, indent=2)) # To stdout for backend
    else:
        # Error message already printed to stderr by analyze_audio
        sys.exit(1)

if __name__ == "__main__":
    main()
# --- END OF FILE analyze_audio.py ---