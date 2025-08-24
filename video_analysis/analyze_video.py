# --- START OF FILE analyze_video.py ---

import json
import os
import sys
import argparse
from extract_metadata import extract_metadata
from detect_scenes import detect_scenes # detect_scenes will now also return transition type
from analyze_audio import analyze_audio

def analyze_video(video_path, scene_threshold=30.0, fade_threshold=5.0, # Added fade_threshold
                 audio_interval=1.0, audio_threshold=0.7, segmentation_method="cut-based"):
    """
    Perform comprehensive analysis on a video file.

    Args:
        video_path (str): Path to the video file
        scene_threshold (float): Threshold for ContentDetector (cuts)
        fade_threshold (float): Threshold for ThresholdDetector (potential fades)
        audio_interval (float): Interval for audio analysis
        audio_threshold (float): Threshold for high energy audio detection
        segmentation_method (str): Method for segmentation - "cut-based" or "ai-based"

    Returns:
        dict: Combined analysis results
    """
    try:
        print(f"Analyzing video: {os.path.basename(video_path)}", file=sys.stderr)

        print("Extracting metadata...", file=sys.stderr)
        metadata = extract_metadata(video_path)
        if not metadata:
            raise Exception("Failed to extract metadata")

        print(f"Detecting scenes using {segmentation_method} method...", file=sys.stderr)

        if segmentation_method == "ai-based":
            print("DEBUG: Attempting AI-based segmentation...", file=sys.stderr)
            # Import AI segmentation module (we'll create this)
            try:
                from ai_segmentation import detect_scenes_ai
                print("DEBUG: Successfully imported ai_segmentation module", file=sys.stderr)
                scenes = detect_scenes_ai(video_path, content_threshold=scene_threshold, fade_threshold=fade_threshold)
                print(f"DEBUG: AI segmentation returned {len(scenes) if scenes else 0} scenes", file=sys.stderr)
            except ImportError as e:
                print(f"Warning: AI segmentation not available ({str(e)}), falling back to cut-based detection", file=sys.stderr)
                scenes = detect_scenes(video_path, content_threshold=scene_threshold, fade_threshold=fade_threshold)
            except Exception as e:
                print(f"Error in AI segmentation ({str(e)}), falling back to cut-based detection", file=sys.stderr)
                scenes = detect_scenes(video_path, content_threshold=scene_threshold, fade_threshold=fade_threshold)
        else:
            print("DEBUG: Using cut-based segmentation...", file=sys.stderr)
            # Use existing cut-based detection
            scenes = detect_scenes(video_path, content_threshold=scene_threshold, fade_threshold=fade_threshold)
        if scenes is None:
            raise Exception("Failed to detect scenes")
        if len(scenes) == 0:
            print("Warning: No scenes detected in the video", file=sys.stderr)
            # Create a single scene spanning the whole video if none detected
            scenes = [{
                "start": 0,
                "end": metadata["duration"],
                "transition_type": "cut" # Default for a single, all-encompassing scene
            }]

        print("Analyzing audio...", file=sys.stderr)
        audio_data = analyze_audio(video_path, interval=audio_interval,
                                  high_energy_threshold=audio_threshold)
        if audio_data is None:
            print("Warning: Audio analysis failed, continuing without audio data", file=sys.stderr)
            audio_data = []

        enhanced_scenes = []

        for i, scene_info in enumerate(scenes):
            scene_start = scene_info["start"]
            scene_end = scene_info["end"]
            # transition_type will be associated with the beginning of this scene
            transition_type = scene_info.get("transition_type", "cut")

            scene_audio = []
            for audio_item in audio_data:
                if (audio_item["start"] <= scene_end and
                    audio_item["end"] >= scene_start):
                    scene_audio.append(audio_item)

            avg_volume = 0
            high_energy = False
            if scene_audio:
                total_volume = sum(a["volume"] for a in scene_audio)
                avg_volume = round(total_volume / len(scene_audio), 3)
                high_energy = any(a["high_energy"] for a in scene_audio)

            enhanced_scene = {
                "scene_index": i, # Add a scene index
                "start": scene_start,
                "end": scene_end,
                "duration": round(scene_end - scene_start, 2),
                "transition_type": transition_type, # Transition leading into this scene
                "avg_volume": avg_volume,
                "high_energy": int(high_energy),
                "segmentation_method": segmentation_method # Track which method was used
            }

            enhanced_scenes.append(enhanced_scene)

        result = {
            "metadata": metadata, # Overall video metadata
            "scenes": enhanced_scenes,
            "raw_data": {
                "audio_analysis": audio_data
            }
        }

        result_str = json.dumps(result)
        result = json.loads(result_str)

        return result

    except Exception as e:
        print(f"Error analyzing video: {str(e)}", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="Analyze video and extract metadata, scenes, text, and audio information")

    parser.add_argument("--input", "-i", required=True, help="Path to input video file")
    parser.add_argument("--output", "-o", help="Path to output JSON file (if not specified, prints to stdout)")
    parser.add_argument("--scene-threshold", type=float, default=27.0, # Default ContentDetector threshold
                        help="Threshold for scene cut detection (ContentDetector, default: 27.0)")
    parser.add_argument("--fade-threshold", type=float, default=5.0, # Default ThresholdDetector threshold
                        help="Threshold for fade detection (ThresholdDetector, default: 5.0, lower is more sensitive to gradual changes)")
    parser.add_argument("--audio-interval", type=float, default=1.0,
                        help="Interval in seconds for audio analysis (default: 1.0)")
    parser.add_argument("--audio-threshold", type=float, default=0.7,
                        help="Threshold for high energy audio detection (default: 0.7)")
    parser.add_argument("--segmentation-method", type=str, default="cut-based",
                        choices=["cut-based", "ai-based"],
                        help="Segmentation method: cut-based (fast) or ai-based (smart, default: cut-based)")

    args = parser.parse_args()

    # Debug: Log the parsed arguments
    print(f"DEBUG: Parsed arguments - segmentation_method: '{args.segmentation_method}'", file=sys.stderr)
    print(f"DEBUG: Input file: '{args.input}'", file=sys.stderr)

    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' does not exist", file=sys.stderr)
        sys.exit(1)

    result = analyze_video(
        args.input,
        scene_threshold=args.scene_threshold,
        fade_threshold=args.fade_threshold, # Pass new threshold
        audio_interval=args.audio_interval,
        audio_threshold=args.audio_threshold,
        segmentation_method=args.segmentation_method
    )

    if not result:
        sys.exit(1)

    if args.output:
        try:
            with open(args.output, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"Analysis complete. Results saved to {args.output}", file=sys.stderr)
        except Exception as e:
            print(f"Error writing to output file: {str(e)}", file=sys.stderr)
            sys.exit(1)
    else:
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
# --- END OF FILE analyze_video.py ---