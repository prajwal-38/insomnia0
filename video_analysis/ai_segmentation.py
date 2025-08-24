# --- START OF FILE ai_segmentation.py ---

import json
import os
import sys
import cv2
import subprocess
import tempfile
import time
from typing import List, Dict, Any, Optional
from scenedetect import VideoManager, SceneManager, FrameTimecode
from scenedetect.detectors import ContentDetector, ThresholdDetector
from detect_scenes import detect_scenes  # Import existing cut-based detection as fallback

def extract_audio_for_transcription(video_path: str) -> Optional[str]:
    """
    Extract audio from video for transcription using FFmpeg.
    Returns path to temporary audio file or None if extraction fails.
    """
    try:
        # Create temporary audio file
        temp_audio = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        temp_audio_path = temp_audio.name
        temp_audio.close()

        # Use FFmpeg to extract audio
        command = [
            'ffmpeg', '-i', video_path,
            '-vn',  # No video
            '-acodec', 'pcm_s16le',  # PCM 16-bit little-endian
            '-ar', '16000',  # 16kHz sample rate (good for Whisper)
            '-ac', '1',  # Mono
            '-y',  # Overwrite output file
            temp_audio_path
        ]

        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Warning: Failed to extract audio: {result.stderr}", file=sys.stderr)
            os.unlink(temp_audio_path)
            return None

        return temp_audio_path

    except Exception as e:
        print(f"Warning: Audio extraction failed: {str(e)}", file=sys.stderr)
        return None

def transcribe_audio_whisper(audio_path: str) -> Optional[List[Dict[str, Any]]]:
    """
    Transcribe audio using local Whisper model with GPU acceleration when available.
    Returns list of segments with timestamps or None if transcription fails.
    """
    try:
        import whisper
        import torch

        # Check for GPU availability
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading Whisper model on {device.upper()}...", file=sys.stderr)

        # Load Whisper model - choose size based on available hardware
        # GPU: Use larger models for better accuracy since GPU is faster
        # CPU: Use smaller models for reasonable speed
        if device == "cuda":
            # Try to use medium model on GPU for best quality, fallback to small if OOM
            try:
                model_size = "medium"
                model = whisper.load_model(model_size, device=device)
                print(f"Loaded {model_size} model on GPU", file=sys.stderr)
            except torch.cuda.OutOfMemoryError:
                print("Medium model too large for GPU, using small model...", file=sys.stderr)
                model_size = "small"
                model = whisper.load_model(model_size, device=device)
        else:
            model_size = "base"
            model = whisper.load_model(model_size, device=device)

        # Transcribe with word-level timestamps and GPU acceleration
        print(f"Transcribing audio using {model_size} model on {device.upper()}...", file=sys.stderr)

        # Additional options for GPU optimization
        transcribe_options = {
            "word_timestamps": True,
            "fp16": device == "cuda",  # Use FP16 on GPU for faster processing
        }

        # Time the transcription process
        start_time = time.time()
        result = model.transcribe(audio_path, **transcribe_options)
        transcription_time = time.time() - start_time
        print(f"Transcription completed in {transcription_time:.2f} seconds", file=sys.stderr)

        # Convert to our format
        segments = []
        for segment in result.get("segments", []):
            segments.append({
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "words": segment.get("words", [])
            })

        return segments

    except ImportError:
        print("Warning: Whisper not available. Install with: pip install openai-whisper", file=sys.stderr)
        return None
    except torch.cuda.OutOfMemoryError:
        print("Warning: GPU out of memory, falling back to CPU...", file=sys.stderr)
        try:
            # Retry with CPU and smaller model
            model = whisper.load_model("base", device="cpu")
            result = model.transcribe(audio_path, word_timestamps=True, fp16=False)
            segments = []
            for segment in result.get("segments", []):
                segments.append({
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"].strip(),
                    "words": segment.get("words", [])
                })
            return segments
        except Exception as fallback_e:
            print(f"Warning: CPU fallback also failed: {str(fallback_e)}", file=sys.stderr)
            return None
    except Exception as e:
        print(f"Warning: Transcription failed: {str(e)}", file=sys.stderr)
        return None

def detect_topic_boundaries(segments: List[Dict[str, Any]], min_segment_length: float = 5.0) -> List[float]:
    """
    Simple topic boundary detection based on sentence endings and pauses.
    Returns list of timestamps where topic boundaries are detected.
    """
    boundaries = [0.0]  # Always start with beginning

    for i, segment in enumerate(segments):
        text = segment["text"].strip()
        duration = segment["end"] - segment["start"]

        # Look for natural boundaries
        is_sentence_end = text.endswith(('.', '!', '?'))
        is_long_pause = i < len(segments) - 1 and segments[i + 1]["start"] - segment["end"] > 1.0
        is_question = '?' in text

        # Add boundary if we have indicators and minimum length is met
        if (is_sentence_end or is_long_pause or is_question):
            if len(boundaries) == 0 or segment["end"] - boundaries[-1] >= min_segment_length:
                boundaries.append(segment["end"])

    return boundaries

def detect_scenes_ai(video_path: str, content_threshold: float = 27.0, fade_threshold: float = 5.0) -> List[Dict[str, Any]]:
    """
    AI-based scene detection combining visual cuts with speech analysis.
    Uses GPU acceleration when available for faster processing.

    Args:
        video_path (str): Path to the video file
        content_threshold (float): Threshold for ContentDetector (cuts)
        fade_threshold (float): Threshold for ThresholdDetector (fades)

    Returns:
        list: List of dictionaries containing scene start, end, and additional AI metadata
    """
    import torch

    # Check GPU availability for performance info
    device_info = "GPU (CUDA)" if torch.cuda.is_available() else "CPU"
    print(f"Starting AI-based segmentation using {device_info}...", file=sys.stderr)

    # Step 1: Get traditional cut-based boundaries as candidates
    print("Getting visual cut boundaries...", file=sys.stderr)
    visual_scenes = detect_scenes(video_path, content_threshold, fade_threshold)
    if not visual_scenes:
        print("Warning: No visual scenes detected", file=sys.stderr)
        return []

    # Step 2: Extract and transcribe audio
    print("Extracting audio for transcription...", file=sys.stderr)
    audio_path = extract_audio_for_transcription(video_path)

    transcript_segments = None
    topic_boundaries = []

    if audio_path:
        try:
            # Transcribe audio
            transcript_segments = transcribe_audio_whisper(audio_path)

            if transcript_segments:
                print(f"Transcribed {len(transcript_segments)} speech segments", file=sys.stderr)
                # Detect topic boundaries
                topic_boundaries = detect_topic_boundaries(transcript_segments)
                print(f"Detected {len(topic_boundaries)} topic boundaries", file=sys.stderr)

        finally:
            # Clean up temporary audio file
            if os.path.exists(audio_path):
                os.unlink(audio_path)

    # Step 3: Combine visual and speech boundaries
    print("Combining visual and speech boundaries...", file=sys.stderr)

    # Collect all potential boundaries
    all_boundaries = set()

    # Add visual boundaries
    for scene in visual_scenes:
        all_boundaries.add(scene["start"])
        all_boundaries.add(scene["end"])

    # Add topic boundaries
    for boundary in topic_boundaries:
        all_boundaries.add(boundary)

    # Sort boundaries
    sorted_boundaries = sorted(all_boundaries)

    # Create final scenes
    ai_scenes = []
    for i in range(len(sorted_boundaries) - 1):
        start_time = sorted_boundaries[i]
        end_time = sorted_boundaries[i + 1]

        # Skip very short segments (less than 2 seconds)
        if end_time - start_time < 2.0:
            continue

        # Find transcript for this segment
        segment_transcript = ""
        segment_topics = []

        if transcript_segments:
            segment_texts = []
            for seg in transcript_segments:
                # Check if segment overlaps with our scene
                if seg["start"] < end_time and seg["end"] > start_time:
                    segment_texts.append(seg["text"].strip())

            segment_transcript = " ".join(segment_texts).strip()

            # Simple topic extraction (first few words)
            if segment_transcript:
                words = segment_transcript.split()[:5]  # First 5 words as topic indicator
                if words:
                    segment_topics = [" ".join(words)]

        # Determine transition type (simplified)
        transition_type = "cut"  # Default

        # Check if this boundary came from topic detection
        if start_time in topic_boundaries:
            transition_type = "topic-change"

        scene = {
            "start": round(start_time, 2),
            "end": round(end_time, 2),
            "transition_type": transition_type,
            "transcript": segment_transcript,
            "topics": segment_topics,
            "confidence_score": 0.8 if segment_transcript else 0.6  # Higher confidence if we have speech
        }

        ai_scenes.append(scene)

    print(f"AI segmentation produced {len(ai_scenes)} scenes", file=sys.stderr)
    return ai_scenes

# --- END OF FILE ai_segmentation.py ---
