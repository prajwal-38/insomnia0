# Transcript service for automatic video transcription and storage
import os
import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import requests
import time
from sqlalchemy.orm import Session
from database import get_db
from models import VideoTranscript, TranscriptSegment, SceneSubtitle

logger = logging.getLogger(__name__)

class TranscriptService:
    def __init__(self):
        self.assemblyai_api_key = os.getenv('ASSEMBLYAI_API_KEY', '')
        self.assemblyai_base_url = 'https://api.assemblyai.com/v2'
        
        if not self.assemblyai_api_key:
            logger.warning("AssemblyAI API key not configured")
    
    async def transcribe_full_video(
        self, 
        analysis_id: str, 
        video_path: str,
        language_code: str = 'en-US'
    ) -> Dict[str, Any]:
        """
        Transcribe full video and store in database
        """
        start_time = time.time()
        
        try:
            logger.info(f"Starting transcription for analysis {analysis_id}")
            
            # Check if transcript already exists
            db = next(get_db())
            try:
                existing_transcript = db.query(VideoTranscript).filter(
                    VideoTranscript.analysis_id == analysis_id
                ).first()
                
                if existing_transcript:
                    logger.info(f"Transcript already exists for analysis {analysis_id}")
                    return {
                        'transcript_id': existing_transcript.id,
                        'analysis_id': analysis_id,
                        'status': 'already_exists',
                        'segments_count': len(existing_transcript.segments)
                    }
            finally:
                db.close()
            
            # Upload video to AssemblyAI
            upload_url = await self._upload_video_to_assemblyai(video_path)
            
            # Request transcription
            transcript_response = await self._request_transcription(
                upload_url, 
                language_code
            )
            
            # Poll for completion
            transcript_result = await self._poll_transcription_status(
                transcript_response['id']
            )
            
            # Store in database
            transcript_id = await self._store_transcript(
                analysis_id, 
                transcript_result,
                video_path,
                int(time.time() - start_time)
            )
            
            logger.info(f"Transcription completed for analysis {analysis_id} in {time.time() - start_time:.2f}s")
            
            return {
                'transcript_id': transcript_id,
                'analysis_id': analysis_id,
                'status': 'completed',
                'segments_count': len(transcript_result.get('words', [])),
                'processing_time': int(time.time() - start_time)
            }
            
        except Exception as e:
            logger.error(f"Transcription failed for {analysis_id}: {e}")
            raise
    
    async def _upload_video_to_assemblyai(self, video_path: str) -> str:
        """
        Upload video file to AssemblyAI
        """
        if not self.assemblyai_api_key:
            raise Exception("AssemblyAI API key not configured")
        
        logger.info(f"Uploading video to AssemblyAI: {video_path}")
        
        # Get upload URL
        upload_response = requests.post(
            f'{self.assemblyai_base_url}/upload',
            headers={'authorization': self.assemblyai_api_key}
        )
        
        if not upload_response.ok:
            raise Exception(f"Failed to get upload URL: {upload_response.text}")
        
        upload_url = upload_response.json()['upload_url']
        
        # Upload file
        with open(video_path, 'rb') as f:
            upload_file_response = requests.put(upload_url, data=f)
        
        if not upload_file_response.ok:
            raise Exception(f"Failed to upload video: {upload_file_response.text}")
        
        logger.info("Video uploaded successfully to AssemblyAI")
        return upload_url
    
    async def _request_transcription(
        self, 
        upload_url: str, 
        language_code: str
    ) -> Dict[str, Any]:
        """
        Request transcription from AssemblyAI
        """
        logger.info("Requesting transcription from AssemblyAI")
        
        transcript_request = {
            'audio_url': upload_url,
            'language_code': language_code.replace('-', '_').lower(),
            'punctuate': True,
            'format_text': True,
            'word_boost': ['video', 'scene', 'timeline', 'edit'],
            'boost_param': 'high'
        }
        
        response = requests.post(
            f'{self.assemblyai_base_url}/transcript',
            headers={
                'authorization': self.assemblyai_api_key,
                'content-type': 'application/json'
            },
            json=transcript_request
        )
        
        if not response.ok:
            raise Exception(f"Transcription request failed: {response.text}")
        
        return response.json()
    
    async def _poll_transcription_status(self, transcript_id: str) -> Dict[str, Any]:
        """
        Poll AssemblyAI for transcription completion
        """
        logger.info(f"Polling transcription status: {transcript_id}")
        
        max_polls = 300  # 5 minutes max
        poll_count = 0
        
        while poll_count < max_polls:
            response = requests.get(
                f'{self.assemblyai_base_url}/transcript/{transcript_id}',
                headers={'authorization': self.assemblyai_api_key}
            )
            
            if not response.ok:
                raise Exception(f"Polling failed: {response.text}")
            
            result = response.json()
            
            if result['status'] == 'completed':
                logger.info("Transcription completed successfully")
                return result
            elif result['status'] == 'error':
                raise Exception(f"AssemblyAI transcription failed: {result.get('error', 'Unknown error')}")
            
            # Wait before next poll
            await asyncio.sleep(1)
            poll_count += 1
            
            if poll_count % 30 == 0:
                logger.info(f"Still processing transcription... ({poll_count}s elapsed)")
        
        raise Exception("Transcription timeout - please try again")
    
    async def _store_transcript(
        self,
        analysis_id: str,
        transcript_result: Dict[str, Any],
        video_path: str,
        processing_time: int
    ) -> str:
        """
        Store transcript result in database
        """
        db = next(get_db())
        
        try:
            # Create main transcript record
            transcript = VideoTranscript(
                analysis_id=analysis_id,
                video_filename=os.path.basename(video_path),
                video_duration=transcript_result.get('audio_duration', 0) / 1000.0,  # Convert ms to seconds
                language_code=transcript_result.get('language_code', 'en-US'),
                transcription_method='assemblyai',
                confidence_score=transcript_result.get('confidence', 0.0),
                full_transcript_text=transcript_result.get('text', ''),
                processing_time_seconds=processing_time,
                api_response_id=transcript_result.get('id'),
                status='completed'
            )
            
            db.add(transcript)
            db.flush()  # Get the ID
            
            # Store individual word segments
            words = transcript_result.get('words', [])
            for word_data in words:
                segment = TranscriptSegment(
                    transcript_id=transcript.id,
                    start_time=word_data.get('start', 0) / 1000.0,  # Convert ms to seconds
                    end_time=word_data.get('end', 0) / 1000.0,
                    text=word_data.get('text', ''),
                    confidence=word_data.get('confidence', 0.0),
                    segment_type='word'
                )
                db.add(segment)
            
            db.commit()
            logger.info(f"Stored transcript with {len(words)} segments for analysis {analysis_id}")
            
            return transcript.id

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to store transcript: {e}")
            raise
        finally:
            db.close()

    async def get_scene_subtitles(
        self,
        analysis_id: str,
        scene_start: float,
        scene_end: float,
        scene_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get subtitle segments for specific scene timing
        """
        db = next(get_db())

        try:
            # Check scene cache first
            if scene_id:
                cached_subtitles = self._get_cached_scene_subtitles(db, scene_id)
                if cached_subtitles:
                    logger.info(f"Retrieved cached subtitles for scene {scene_id}")
                    return cached_subtitles

            # Query transcript segments
            transcript = db.query(VideoTranscript).filter(
                VideoTranscript.analysis_id == analysis_id
            ).first()

            if not transcript:
                logger.warning(f"No transcript found for analysis {analysis_id}")
                return []

            # Get segments within scene timing
            segments = db.query(TranscriptSegment).filter(
                TranscriptSegment.transcript_id == transcript.id,
                TranscriptSegment.start_time >= scene_start,
                TranscriptSegment.end_time <= scene_end
            ).order_by(TranscriptSegment.start_time).all()

            # Convert to subtitle format
            subtitles = self._convert_segments_to_subtitles(segments, scene_start)

            # Cache result if scene_id provided
            if scene_id and subtitles:
                self._cache_scene_subtitles(
                    db, scene_id, transcript.id,
                    scene_start, scene_end, subtitles
                )

            logger.info(f"Retrieved {len(subtitles)} subtitles for scene timing {scene_start}-{scene_end}")
            return subtitles

        finally:
            db.close()

    def _get_cached_scene_subtitles(self, db: Session, scene_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached subtitles for a scene
        """
        cached = db.query(SceneSubtitle).filter(
            SceneSubtitle.scene_id == scene_id
        ).first()

        if cached:
            return cached.subtitle_data

        return None

    def _cache_scene_subtitles(
        self,
        db: Session,
        scene_id: str,
        transcript_id: str,
        scene_start: float,
        scene_end: float,
        subtitles: List[Dict[str, Any]]
    ) -> None:
        """
        Cache subtitles for a scene
        """
        try:
            # Remove existing cache entry
            db.query(SceneSubtitle).filter(
                SceneSubtitle.scene_id == scene_id
            ).delete()

            # Create new cache entry
            cache_entry = SceneSubtitle(
                scene_id=scene_id,
                transcript_id=transcript_id,
                scene_start_time=scene_start,
                scene_end_time=scene_end,
                subtitle_data=subtitles
            )

            db.add(cache_entry)
            db.commit()

            logger.info(f"Cached {len(subtitles)} subtitles for scene {scene_id}")

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cache subtitles for scene {scene_id}: {e}")

    def _convert_segments_to_subtitles(
        self,
        segments: List[TranscriptSegment],
        scene_start: float
    ) -> List[Dict[str, Any]]:
        """
        Convert transcript segments to subtitle format
        """
        if not segments:
            return []

        subtitles = []

        # Group words into sentences for better subtitle display
        current_sentence = []
        current_start = None

        for segment in segments:
            if current_start is None:
                current_start = segment.start_time - scene_start

            current_sentence.append(segment.text)

            # End sentence on punctuation or after 5 seconds
            if (segment.text.endswith(('.', '!', '?')) or
                (segment.end_time - scene_start) - current_start > 5.0):

                subtitles.append({
                    'startTime': max(0, current_start),
                    'endTime': segment.end_time - scene_start,
                    'text': ' '.join(current_sentence).strip(),
                    'confidence': segment.confidence or 0.8
                })

                current_sentence = []
                current_start = None

        # Handle remaining words
        if current_sentence and segments:
            last_segment = segments[-1]
            subtitles.append({
                'startTime': max(0, current_start or 0),
                'endTime': last_segment.end_time - scene_start,
                'text': ' '.join(current_sentence).strip(),
                'confidence': last_segment.confidence or 0.8
            })

        return subtitles

    async def get_transcript_info(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """
        Get transcript information for an analysis
        """
        db = next(get_db())

        try:
            transcript = db.query(VideoTranscript).filter(
                VideoTranscript.analysis_id == analysis_id
            ).first()

            if not transcript:
                return None

            return {
                'transcript_id': transcript.id,
                'analysis_id': transcript.analysis_id,
                'video_filename': transcript.video_filename,
                'video_duration': transcript.video_duration,
                'language_code': transcript.language_code,
                'confidence_score': transcript.confidence_score,
                'processing_time_seconds': transcript.processing_time_seconds,
                'status': transcript.status,
                'created_at': transcript.created_at.isoformat() if transcript.created_at else None,
                'segments_count': len(transcript.segments)
            }

        finally:
            db.close()
