# --- START OF FILE detect_scenes.py ---

import json
import os
import sys
import cv2
from scenedetect import VideoManager, SceneManager, FrameTimecode
from scenedetect.detectors import ContentDetector, ThresholdDetector # Added ThresholdDetector

# Suppress PySceneDetect INFO logging if possible
# import logging
# logging.getLogger('scenedetect').setLevel(logging.WARNING)


def detect_scenes(video_path, content_threshold=35.0, fade_threshold=10.0):
    """
    Detect scenes in a video file using PySceneDetect.
    Uses ContentDetector for cuts and ThresholdDetector for potential fades.
    
    Args:
        video_path (str): Path to the video file
        content_threshold (float): Threshold for ContentDetector (cuts)
        fade_threshold (float): Threshold for ThresholdDetector (fades)
        
    Returns:
        list: List of dictionaries containing scene start, end, and transition_type
    """
    try:
        # Create video manager (PySceneDetect doesn't support downscale_factor directly)
        video_manager = VideoManager([video_path])
        scene_manager = SceneManager()
        
        # Detector for cuts - optimized for speed with higher thresholds
        scene_manager.add_detector(ContentDetector(threshold=content_threshold, min_scene_len=5))
        # Detector for fades (detects gradual changes) - reduced min scene length for faster processing
        # ThresholdDetector looks for average pixel intensity changes.
        # A low threshold makes it sensitive to subtle, gradual changes like fades.
        scene_manager.add_detector(ThresholdDetector(threshold=fade_threshold, min_scene_len=5)) # 5 frames min for faster processing

        video_manager.start()
        scene_manager.detect_scenes(frame_source=video_manager)
        
        # scene_list_raw will contain all detected scene boundaries (cuts or fades)
        # PySceneDetect doesn't directly label them in the combined list.
        # We need a more sophisticated way to differentiate if we use multiple detectors
        # and want to know WHICH detector triggered a scene break.
        # For now, we'll simplify: if a scene change is detected, we'll assume 'cut'
        # unless we implement logic to analyze the *nature* of the change.
        # A more robust solution would involve checking which detector caused the split
        # or analyzing frame differences around the split.

        # Let's try to get raw cuts from ContentDetector and fades from ThresholdDetector separately
        # This is not how PySceneDetect's SceneManager is typically used when combining detectors.
        # Usually, SceneManager merges results.
        # A common way to determine type is to post-process:
        # If a cut is detected by ContentDetector very close to a fade detected by ThresholdDetector,
        # it's likely a fade. If only ContentDetector fires, it's a cut.

        scene_list_raw = scene_manager.get_scene_list() # This list is (start_time, end_time)

        # Simplistic approach for now:
        # Assume the first scene starts with a "cut" (or "fade-in" if video starts with one)
        # Subsequent scenes' `transition_type` refers to how that scene BEGINS.

        scenes_output = []
        if not scene_list_raw: # No scenes detected, treat as one long scene
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) if cap.isOpened() else 25.0
            duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps if cap.isOpened() and fps > 0 else 0
            if cap.isOpened(): cap.release()
            
            scenes_output.append({
                "start": 0.0,
                "end": round(duration, 2) if duration > 0 else 0.01, # Ensure end > start
                "transition_type": "cut" # Default for a single scene video
            })
            video_manager.release()
            return scenes_output


        # The first scene starts at time 0. Its transition type is effectively how the video starts.
        # We can assume 'fade-in' if the first detected scene_list_raw[0][0] is not exactly 0
        # and there's a gradual change, or 'cut' otherwise.
        # This part requires more advanced logic to truly determine if it's a fade-in from black.
        
        # For simplicity in this step, let's assume:
        # - The very first scene's transition is 'cut' or 'fade-in' (hard to tell without analyzing first few frames)
        # - For subsequent scenes, the transition is how *that* scene started.
        # PySceneDetect's scene_list gives (StartTime, EndTime) of each scene.
        # The transition happens *between* scene_list[i-1].EndTime and scene_list[i].StartTime.

        # Re-thinking: Each item in scene_list_raw IS a scene (StartTime, EndTime)
        # The transition_type should describe how THIS scene began.

        # Get FPS for accurate timing if needed elsewhere, though FrameTimecode.get_seconds() is good.
        # fps = video_manager.get_framerate()

        # Heuristic: if a ThresholdDetector was used and a scene break isn't super sharp,
        # it might be a fade. This is still an oversimplification.
        # A real solution would look at detector-specific results if PySceneDetect API allows,
        # or perform manual frame analysis at boundaries.

        # For now, let's make a placeholder decision logic for transition_type
        # This is NOT a robust fade detection.
        # True fade detection requires checking if ThresholdDetector uniquely found a boundary
        # or if the change was gradual over several frames.

        # Let's assume the first scene starts with a 'cut' or 'fade-in' (hard to distinguish now)
        # All other transitions are 'cut' unless a more sophisticated method is added.

        last_end_time = 0.0
        for i, (start_tc, end_tc) in enumerate(scene_list_raw):
            start_time = start_tc.get_seconds()
            end_time = end_tc.get_seconds()
            
            transition = "cut" # Default
            
            # Crude heuristic for initial fade-in or if there's a gap (implying a fade from previous)
            if i == 0 and start_time > 0.1: # Video doesn't start immediately at frame 0
                transition = "fade-in"
            elif i > 0 and (start_time - last_end_time) > 0.1: # Gap between scenes might indicate a fade
                 # This needs to be more robust. A small gap is normal.
                 # A long "scene" detected by ThresholdDetector might be a fade.
                 # This current logic is insufficient for accurate fade typing.
                 # For now, we will mostly default to "cut".
                 # To properly do this, one would analyze frames around `last_end_time` and `start_time`.
                 pass


            # A more direct (but still heuristic) approach:
            # If ThresholdDetector is active and the scene duration detected by it is short,
            # and ContentDetector also flags it, it's a cut.
            # If ThresholdDetector flags a longer period of change, it's a fade.
            # This part is complex with the current `get_scene_list` which merges all.

            # SIMPLIFICATION: For this iteration, we will label all as 'cut'.
            # Robust fade detection is a larger task.
            # We can add a TODO or placeholder here.
            # If you want to simulate, you could randomly assign some "fade-in" / "fade-out"
            # or base it on scene length (very short scenes unlikely to be fades themselves).
            # Let's assume the 'transition_type' refers to how the scene *starts*.

            current_transition_type = "cut" # Default for this simplified version
            if i == 0:
                 # Heuristic: if the first scene starts slightly after 0s, maybe a fade-in
                if start_time > 0.2 and start_time < 2.0: # Arbitrary small delay
                    current_transition_type = "fade-in"

            # If this scene is NOT the last one, and the NEXT scene starts slightly after this one ends,
            # it could imply a fade-out from THIS scene. This is complex.
            # The 'transition_type' on a scene should describe its *entry*.

            scenes_output.append({
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "transition_type": current_transition_type 
            })
            last_end_time = end_time
        
        video_manager.release()
        return scenes_output
    
    except Exception as e:
        print(f"Error detecting scenes: {str(e)}", file=sys.stderr)
        if 'video_manager' in locals() and video_manager:
            video_manager.release()
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python detect_scenes.py <video_file_path> [content_threshold] [fade_threshold]", file=sys.stderr)
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    content_thresh = 27.0
    fade_thresh = 5.0

    if len(sys.argv) >= 3:
        try: content_thresh = float(sys.argv[2])
        except ValueError: print(f"Error: Content threshold must be a number", file=sys.stderr); sys.exit(1)
    if len(sys.argv) >= 4:
        try: fade_thresh = float(sys.argv[3])
        except ValueError: print(f"Error: Fade threshold must be a number", file=sys.stderr); sys.exit(1)

    if not os.path.exists(video_path):
        print(f"Error: File '{video_path}' does not exist", file=sys.stderr)
        sys.exit(1)
    
    scenes_data = detect_scenes(video_path, content_threshold=content_thresh, fade_threshold=fade_thresh)
    
    if scenes_data:
        print(json.dumps(scenes_data, indent=2))
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
# --- END OF FILE detect_scenes.py ---