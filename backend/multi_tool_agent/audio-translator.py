import os
import uuid
import base64
import wave
# Disable MoviePy progress bars to prevent tqdm issues in subprocess
os.environ['MOVIEPY_PROGRESS_BAR'] = '0'
from moviepy.editor import VideoFileClip, AudioFileClip
from pydub import AudioSegment
from google.cloud import speech, translate_v2 as translate
from google import genai
from dotenv import load_dotenv

load_dotenv()

def unique_id():
    return uuid.uuid4().hex[:8]

def unique_file(prefix, suffix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}.{suffix}"

class AudioExtractorAgent:
    def run(self, input_video_path: str) -> str:
        print(f"[Pipeline] Starting audio extraction from: {input_video_path}")
        clip = VideoFileClip(input_video_path)
        audio_path = unique_file("extracted_audio", "wav")
        clip.audio.write_audiofile(audio_path, verbose=False, logger=None)
        print(f"[Pipeline] Extracted audio saved at: {audio_path}")
        return audio_path

class SpeechToTextAgent:
    def run(self, audio_path: str) -> str:
        try:
            print(f"[Pipeline] Starting speech-to-text for: {audio_path}")
            client = speech.SpeechClient()
            sound = AudioSegment.from_file(audio_path).set_channels(1)
            wav_path = unique_file("converted_audio", "wav")
            sound.export(wav_path, format="wav")

            with open(wav_path, "rb") as audio_file:
                content = audio_file.read()

            audio = speech.RecognitionAudio(content=content)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                language_code="en-US"
            )

            response = client.recognize(config=config, audio=audio)
            transcript = " ".join([result.alternatives[0].transcript for result in response.results])
            print(f"[Pipeline] Transcribed text: {transcript}")
            return transcript
        except Exception as e:
            print(f"[Pipeline] Error in speech-to-text: {str(e)}")
            raise

class TranslatorAgent:
    def run(self, text: str, target_language="es") -> str:
        try:
            print(f"[Pipeline] Starting translation to {target_language}")
            client = translate.Client()
            result = client.translate(text, target_language=target_language)
            translated = result["translatedText"]
            print(f"[Pipeline] Translated text ({target_language}): {translated}")
            return translated
        except Exception as e:
            print(f"[Pipeline] Error in translation: {str(e)}")
            raise

class GeminiTextToSpeechAgent:
    def __init__(self, api_key, voice="Kore"):
        self.client = genai.Client(api_key=api_key)
        self.voice = voice

    def run(self, text: str) -> str:
        response = self.client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,  # single string works fine
            config=genai.types.GenerateContentConfig(
                response_modalities=["audio"],
                speech_config=genai.types.SpeechConfig(
                    voice_config=genai.types.VoiceConfig(
                        prebuilt_voice_config=genai.types.PrebuiltVoiceConfig(
                            voice_name=self.voice  # Use the configured voice
                        )
                    )
                ),
            )
        )

        candidate = response.candidates[0]
        data = candidate.content.parts[0].inline_data.data  # PCM bytes
        print(f"[TTS Debug] Returned audio bytes: {len(data)}")

        if not data:
            raise RuntimeError("❌ Gemini TTS returned no audio data.")

        output_path = unique_file("translated_speech", "wav")
        channels = 1
        rate = 24000
        sample_width = 2

        with wave.open(output_path, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(data)

        print(f"[Pipeline] Generated speech audio saved at: {output_path}")
        return output_path



class VideoRebuilderAgent:
    def run(self, video_path: str, translated_audio_path: str) -> str:
        print("[VideoRebuilderAgent] Rebuilding video with translated audio...")

        video = VideoFileClip(video_path)
        video_duration = video.duration

        # Load translated audio with pydub
        translated = AudioSegment.from_file(translated_audio_path)

        # Convert to stereo and 44100 Hz sample rate to avoid playback issues
        translated = translated.set_channels(2).set_frame_rate(44100)

        translated_duration = translated.duration_seconds

        # Pad if shorter than video
        if translated_duration < video_duration:
            padding_ms = int((video_duration - translated_duration) * 1000)
            silence = AudioSegment.silent(duration=padding_ms)
            padded = translated + silence
        else:
            padded = translated

        # Export the processed audio to a temp wav file
        padded_audio_path = translated_audio_path.replace(".wav", "_stereo_44100.wav")
        padded.export(padded_audio_path, format="wav")

        # Attach audio to video with MoviePy
        audio = AudioFileClip(padded_audio_path)
        new_video = video.set_audio(audio)

        output_path = f"final_video_{unique_id()}.mp4"
        new_video.write_videofile(output_path, codec="libx264", audio_codec="aac", verbose=False, logger=None)

        print(f"[Pipeline] Final video saved at: {output_path}")
        return output_path


def process_video_pipeline(video_path: str, target_lang="es", voice="Kore", gemini_api_key=None):
    try:
        print(f"[Pipeline] Starting pipeline for video: {video_path}")
        print(f"[Pipeline] Target language: {target_lang}, Voice: {voice}")

        audio_path = AudioExtractorAgent().run(video_path)
        transcript = SpeechToTextAgent().run(audio_path)
        translated_text = TranslatorAgent().run(transcript, target_lang)
        tts_agent = GeminiTextToSpeechAgent(api_key=gemini_api_key, voice=voice)
        translated_audio = tts_agent.run(translated_text)
        final_video = VideoRebuilderAgent().run(video_path, translated_audio)
        return final_video
    except Exception as e:
        print(f"[Pipeline] Error in pipeline: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    import sys

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

    if len(sys.argv) < 2:
        print("Usage: python audio-translator.py <video_path> [target_language] [voice]")
        print("Example: python audio-translator.py video.mp4 es Kore")
        sys.exit(1)

    video_path = sys.argv[1]
    target_lang = sys.argv[2] if len(sys.argv) > 2 else "es"
    voice = sys.argv[3] if len(sys.argv) > 3 else "Kore"

    print("🎬 Starting video translation...")
    print(f"📹 Video: {video_path}")
    print(f"🌐 Target language: {target_lang}")
    print(f"🎤 Voice: {voice}")

    try:
        final_video_path = process_video_pipeline(video_path, target_lang=target_lang, voice=voice, gemini_api_key=GEMINI_API_KEY)
        print(f"✅ Final translated video saved at: {final_video_path}")
    except Exception as e:
        print(f"❌ Translation failed: {str(e)}")
        sys.exit(1)