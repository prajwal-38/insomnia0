import type { SubtitleCue } from '../components/SubtitleOverlay';
import { getApiKey, hasApiKey } from '../config/apiKeys';

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface SubtitleGenerationOptions {
  language?: string;
  maxDuration?: number;
  confidence?: number;
}

export interface SubtitleGenerationResult {
  subtitles: SubtitleCue[];
  language: string;
  confidence: number;
  method: 'web-speech-api' | 'whisper' | 'assemblyai' | 'fallback';
  duration: number;
}

class SubtitleGeneratorService {
  private recognition: any = null;
  private isSupported: boolean = false;

  constructor() {
    this.initializeWebSpeechAPI();
  }

  private initializeWebSpeechAPI(): void {
    // Check if Web Speech API is supported
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.isSupported = true;
      console.log('✅ Web Speech API initialized successfully');
    } else {
      console.warn('⚠️ Web Speech API not supported in this browser');
      this.isSupported = false;
    }
  }

  async generateSubtitles(
    videoElement: HTMLVideoElement,
    options: SubtitleGenerationOptions = {}
  ): Promise<SubtitleGenerationResult> {
    const { language = 'en-US', confidence = 0.8 } = options;

    try {
      // Use direct video URL approach instead of audio extraction
      console.log('🤖 Using AssemblyAI with direct video URL...');
      return await this.generateWithDirectVideoURL(videoElement, language);

    } catch (error) {
      console.error('❌ AssemblyAI processing failed:', error);

      // Fallback to test subtitles
      console.log('🔄 Using test subtitles as fallback...');
      return this.generateTestSubtitles(videoElement, language);
    }
  }

  private async generateWithDirectVideoURL(
    videoElement: HTMLVideoElement,
    language: string
  ): Promise<SubtitleGenerationResult> {
    console.log('🎯 Starting AssemblyAI transcription with scene video segment...');

    try {
      // Check API key
      if (!hasApiKey('assemblyai')) {
        throw new Error('AssemblyAI API key not configured');
      }

      const apiKey = getApiKey('assemblyai');

      // Get the scene video segment (should already be scene-specific from aiProcessingManager)
      console.log('📹 Fetching scene video segment for upload...');
      const videoUrl = videoElement.src;

      if (!videoUrl) {
        throw new Error('No video URL available');
      }

      console.log('🎬 Scene video URL:', videoUrl);

      // Check if this is a scene-specific URL or full video URL
      const isSceneSpecific = videoUrl.includes('/scene?');
      console.log(`🎯 Video type: ${isSceneSpecific ? 'Scene segment' : 'Full video'}`);

      const videoResponse = await fetch(videoUrl);

      if (!videoResponse.ok) {
        // If scene-specific URL fails, this is expected - the backend will handle it
        if (isSceneSpecific && videoResponse.status === 404) {
          console.log('⚠️ Scene segment endpoint not available, this is expected');
        }
        throw new Error(`Failed to fetch scene video: ${videoResponse.statusText}`);
      }

      const sceneVideoBlob = await videoResponse.blob();
      const sizeMB = Math.round(sceneVideoBlob.size / 1024 / 1024 * 100) / 100;
      console.log(`✅ ${isSceneSpecific ? 'Scene segment' : 'Full video'} fetched, size: ${sizeMB} MB`);

      // Check file size (AssemblyAI has limits)
      if (sceneVideoBlob.size > 500 * 1024 * 1024) { // 500MB limit
        throw new Error('Scene video too large for processing (max 500MB)');
      }

      // Upload scene video segment to AssemblyAI
      console.log('📤 Uploading scene video segment to AssemblyAI...');
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
        },
        body: sceneVideoBlob
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const { upload_url } = await uploadResponse.json();
      console.log('✅ Video uploaded successfully');

      // Request transcription with uploaded file
      console.log('🎯 Requesting transcription from AssemblyAI...');
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: upload_url,
          language_code: language.replace('-', '_').toLowerCase(),
          punctuate: true,
          format_text: true,
          word_boost: ['video', 'scene', 'timeline', 'edit'],
          boost_param: 'high'
        })
      });

      if (!transcriptResponse.ok) {
        throw new Error(`Transcription request failed: ${transcriptResponse.statusText}`);
      }

      const transcript = await transcriptResponse.json();
      console.log('⏳ Transcription started, polling for completion...');

      // Poll for completion
      let result = transcript;
      let pollCount = 0;
      const maxPolls = 120; // 2 minutes max wait time

      while (result.status !== 'completed' && result.status !== 'error' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds

        const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${result.id}`, {
          headers: {
            'authorization': apiKey,
          }
        });

        if (!pollResponse.ok) {
          throw new Error(`Polling failed: ${pollResponse.statusText}`);
        }

        result = await pollResponse.json();
        pollCount++;

        if (pollCount % 5 === 0) {
          console.log(`⏳ Still processing... (${pollCount * 2}s elapsed)`);
        }
      }

      if (result.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${result.error}`);
      }

      if (pollCount >= maxPolls) {
        throw new Error('Transcription timeout - please try again');
      }

      console.log('✅ Transcription completed successfully');

      // Convert AssemblyAI response to subtitle format
      const subtitles: SubtitleCue[] = [];
      if (result.words && result.words.length > 0) {
        let currentSubtitle = '';
        let startTime = 0;
        let wordCount = 0;
        const maxWordsPerSubtitle = 8;
        const maxDurationPerSubtitle = 4; // 4 seconds max per subtitle

        for (let i = 0; i < result.words.length; i++) {
          const word = result.words[i];

          if (wordCount === 0) {
            startTime = word.start / 1000; // Convert ms to seconds
          }

          currentSubtitle += (wordCount > 0 ? ' ' : '') + word.text;
          wordCount++;

          const currentDuration = (word.end / 1000) - startTime;
          const isLastWord = i === result.words.length - 1;
          const hasNaturalBreak = word.text.match(/[.!?]$/);
          const shouldBreak = wordCount >= maxWordsPerSubtitle ||
                             currentDuration >= maxDurationPerSubtitle ||
                             hasNaturalBreak ||
                             isLastWord;

          if (shouldBreak && currentSubtitle.trim()) {
            subtitles.push({
              startTime,
              endTime: word.end / 1000, // Convert ms to seconds
              text: currentSubtitle.trim(),
              id: `assembly-${subtitles.length + 1}`
            });

            currentSubtitle = '';
            wordCount = 0;
          }
        }
      }

      console.log(`🎉 Generated ${subtitles.length} real subtitle segments from AssemblyAI`);

      return {
        subtitles,
        language,
        confidence: result.confidence || 0.8,
        method: 'assemblyai',
        duration: result.audio_duration ? result.audio_duration / 1000 : 0
      };

    } catch (error) {
      console.error('❌ AssemblyAI direct URL processing failed:', error);
      throw error;
    }
  }

  private async extractSceneSegment(videoElement: HTMLVideoElement): Promise<Blob> {
    console.log('🎬 Extracting scene segment for transcription...');

    try {
      // Create a canvas to capture video frames
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas size to match video
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;

      // Create audio context for recording
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Create a silent video element for processing
      const processingVideo = videoElement.cloneNode(true) as HTMLVideoElement;
      processingVideo.muted = true;
      processingVideo.volume = 0;
      processingVideo.style.display = 'none';
      document.body.appendChild(processingVideo);

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        processingVideo.onloadeddata = () => resolve();
        processingVideo.onerror = () => reject(new Error('Failed to load video for segment extraction'));
        processingVideo.load();
      });

      // Get scene timing from video element's current position
      const sceneStart = videoElement.currentTime || 0;
      const sceneDuration = Math.min(videoElement.duration - sceneStart, 300); // Max 5 minutes

      console.log(`📐 Scene segment: ${sceneStart}s to ${sceneStart + sceneDuration}s (${sceneDuration}s duration)`);

      // Set video to scene start
      processingVideo.currentTime = sceneStart;

      // Create media source for audio recording
      const source = audioContext.createMediaElementSource(processingVideo);
      source.connect(destination);

      // Record the scene segment
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      const chunks: Blob[] = [];

      return new Promise((resolve, reject) => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          console.log('✅ Scene segment extracted, size:', audioBlob.size, 'bytes');

          // Clean up
          document.body.removeChild(processingVideo);
          audioContext.close();

          resolve(audioBlob);
        };

        mediaRecorder.onerror = (event) => {
          console.error('❌ MediaRecorder error:', event);
          document.body.removeChild(processingVideo);
          audioContext.close();
          reject(new Error('Scene segment recording failed'));
        };

        // Start recording
        mediaRecorder.start();

        // Play the video for the scene duration
        processingVideo.play().catch(error => {
          console.error('❌ Failed to play video for segment extraction:', error);
          reject(error);
        });

        // Stop recording after scene duration
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          processingVideo.pause();
        }, sceneDuration * 1000);
      });

    } catch (error) {
      console.error('❌ Scene segment extraction failed:', error);
      throw new Error(`Scene segment extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateTestSubtitles(
    videoElement: HTMLVideoElement,
    language: string
  ): SubtitleGenerationResult {
    console.log('🧪 Generating test subtitles as fallback...');

    const testSubtitles: SubtitleCue[] = [
      {
        startTime: 0,
        endTime: 4,
        text: "⚠️ AssemblyAI processing failed",
        id: "test-1"
      },
      {
        startTime: 4,
        endTime: 8,
        text: "Check browser console for error details",
        id: "test-2"
      },
      {
        startTime: 8,
        endTime: 12,
        text: "These are test subtitles - not real transcription",
        id: "test-3"
      },
      {
        startTime: 12,
        endTime: 16,
        text: "Real subtitles will appear when API issues are resolved",
        id: "test-4"
      }
    ];

    return {
      subtitles: testSubtitles,
      language,
      confidence: 0.5,
      method: 'fallback',
      duration: videoElement.duration || 16
    };
  }

  private async generateWithWebSpeechAPI(
    videoElement: HTMLVideoElement,
    language: string,
    confidence: number
  ): Promise<SubtitleGenerationResult> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not available'));
        return;
      }

      const subtitles: SubtitleCue[] = [];
      let startTime = 0;
      let currentText = '';

      this.recognition.lang = language;
      this.recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        startTime = videoElement.currentTime;
      };

      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && result[0].confidence >= confidence) {
            const endTime = videoElement.currentTime;
            const text = result[0].transcript.trim();
            
            if (text.length > 0) {
              subtitles.push({
                startTime,
                endTime,
                text,
                id: `subtitle-${subtitles.length + 1}`
              });
              startTime = endTime;
            }
          }
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        reject(new Error(`Speech recognition failed: ${event.error}`));
      };

      this.recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        resolve({
          subtitles,
          language,
          confidence,
          method: 'web-speech-api',
          duration: videoElement.duration
        });
      };

      // Start recognition and play video
      this.recognition.start();
      videoElement.play();

      // Stop recognition when video ends
      videoElement.addEventListener('ended', () => {
        this.recognition?.stop();
      });
    });
  }

  private async generateWithWhisperAPI(
    videoElement: HTMLVideoElement,
    language: string,
    confidence: number
  ): Promise<SubtitleGenerationResult> {
    try {
      // Extract audio from video
      const audioBlob = await this.extractAudioFromVideo(videoElement);

      // Check for API keys using config
      if (hasApiKey('openai')) {
        console.log('🤖 Using OpenAI Whisper API...');
        return await this.transcribeWithOpenAI(audioBlob, language);
      } else if (hasApiKey('assemblyai')) {
        console.log('🤖 Using AssemblyAI API...');
        return await this.transcribeWithAssemblyAI(audioBlob, language);
      } else {
        throw new Error('No transcription API key found. Please add your API key to src/config/apiKeys.ts');
      }
    } catch (error) {
      console.error('Whisper API transcription failed:', error);
      throw error;
    }
  }

  private async transcribeWithOpenAI(audioBlob: Blob, language: string): Promise<SubtitleGenerationResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', language.split('-')[0]); // Convert 'en-US' to 'en'
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey('openai')}`,
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = await response.json();

    // Convert OpenAI response to subtitle format
    const subtitles: SubtitleCue[] = [];
    if (result.words) {
      let currentSubtitle = '';
      let startTime = 0;
      let wordCount = 0;

      for (const word of result.words) {
        if (wordCount === 0) {
          startTime = word.start;
        }

        currentSubtitle += (wordCount > 0 ? ' ' : '') + word.word;
        wordCount++;

        // Create subtitle every 8-10 words or at natural breaks
        if (wordCount >= 8 || word.word.includes('.') || word.word.includes('!') || word.word.includes('?')) {
          subtitles.push({
            startTime,
            endTime: word.end,
            text: currentSubtitle.trim(),
            id: `openai-${subtitles.length + 1}`
          });

          currentSubtitle = '';
          wordCount = 0;
        }
      }

      // Add remaining words as final subtitle
      if (currentSubtitle.trim()) {
        const lastWord = result.words[result.words.length - 1];
        subtitles.push({
          startTime,
          endTime: lastWord.end,
          text: currentSubtitle.trim(),
          id: `openai-${subtitles.length + 1}`
        });
      }
    }

    return {
      subtitles,
      language,
      confidence: 0.9,
      method: 'whisper',
      duration: result.duration || 0
    };
  }

  private async transcribeWithAssemblyAI(audioBlob: Blob, language: string): Promise<SubtitleGenerationResult> {
    console.log('🤖 Starting AssemblyAI transcription...');

    try {
      // Upload audio file
      console.log('📤 Uploading audio to AssemblyAI...');
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': getApiKey('assemblyai'),
        },
        body: audioBlob
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const { upload_url } = await uploadResponse.json();
      console.log('✅ Audio uploaded successfully');

      // Request transcription with word-level timestamps
      console.log('🎯 Requesting transcription...');
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': getApiKey('assemblyai'),
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: upload_url,
          language_code: language.replace('-', '_').toLowerCase(),
          punctuate: true,
          format_text: true,
          word_boost: ['video', 'scene', 'timeline', 'edit'],
          boost_param: 'high'
        })
      });

      if (!transcriptResponse.ok) {
        throw new Error(`Transcription request failed: ${transcriptResponse.statusText}`);
      }

      const transcript = await transcriptResponse.json();
      console.log('⏳ Transcription started, polling for completion...');

      // Poll for completion with better error handling
      let result = transcript;
      let pollCount = 0;
      const maxPolls = 120; // 2 minutes max wait time

      while (result.status !== 'completed' && result.status !== 'error' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${result.id}`, {
          headers: {
            'authorization': getApiKey('assemblyai'),
          }
        });

        if (!pollResponse.ok) {
          throw new Error(`Polling failed: ${pollResponse.statusText}`);
        }

        result = await pollResponse.json();
        pollCount++;

        if (pollCount % 10 === 0) {
          console.log(`⏳ Still processing... (${pollCount}s elapsed)`);
        }
      }

      if (result.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${result.error}`);
      }

      if (pollCount >= maxPolls) {
        throw new Error('Transcription timeout - please try again');
      }

      console.log('✅ Transcription completed successfully');

      // Convert AssemblyAI response to subtitle format with improved chunking
      const subtitles: SubtitleCue[] = [];
      if (result.words && result.words.length > 0) {
        let currentSubtitle = '';
        let startTime = 0;
        let wordCount = 0;
        const maxWordsPerSubtitle = 10;
        const maxDurationPerSubtitle = 5; // 5 seconds max per subtitle

        for (let i = 0; i < result.words.length; i++) {
          const word = result.words[i];

          if (wordCount === 0) {
            startTime = word.start / 1000; // Convert ms to seconds
          }

          currentSubtitle += (wordCount > 0 ? ' ' : '') + word.text;
          wordCount++;

          const currentDuration = (word.end / 1000) - startTime;
          const isLastWord = i === result.words.length - 1;
          const hasNaturalBreak = word.text.match(/[.!?]$/);
          const shouldBreak = wordCount >= maxWordsPerSubtitle ||
                             currentDuration >= maxDurationPerSubtitle ||
                             hasNaturalBreak ||
                             isLastWord;

          if (shouldBreak && currentSubtitle.trim()) {
            subtitles.push({
              startTime,
              endTime: word.end / 1000, // Convert ms to seconds
              text: currentSubtitle.trim(),
              id: `assembly-${subtitles.length + 1}`
            });

            currentSubtitle = '';
            wordCount = 0;
          }
        }
      }

      console.log(`🎉 Generated ${subtitles.length} subtitle segments`);

      return {
        subtitles,
        language,
        confidence: result.confidence || 0.8,
        method: 'assemblyai',
        duration: result.audio_duration ? result.audio_duration / 1000 : 0
      };

    } catch (error) {
      console.error('❌ AssemblyAI transcription error:', error);
      throw error;
    }
  }

  private async extractAudioFromVideo(videoElement: HTMLVideoElement): Promise<Blob> {
    console.log('🎵 Extracting audio from video for transcription...');

    try {
      // Create a canvas to capture video frames (for audio extraction)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set canvas size to match video
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;

      // Create audio context for processing
      const audioContext = new AudioContext();

      // Create a silent video element for audio extraction
      const silentVideo = videoElement.cloneNode(true) as HTMLVideoElement;
      silentVideo.muted = true; // Ensure no sound plays
      silentVideo.volume = 0;   // Double ensure no sound
      silentVideo.style.display = 'none'; // Hide the element
      document.body.appendChild(silentVideo);

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        silentVideo.onloadeddata = () => resolve();
        silentVideo.onerror = () => reject(new Error('Failed to load video for audio extraction'));
        silentVideo.load();
      });

      // Create media element source from the silent video
      const source = audioContext.createMediaElementSource(silentVideo);
      const destination = audioContext.createMediaStreamDestination();

      // Connect source to destination (but not to speakers)
      source.connect(destination);

      // Record the audio stream
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      const chunks: Blob[] = [];

      return new Promise((resolve, reject) => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          console.log('✅ Audio extraction completed, blob size:', audioBlob.size);

          // Clean up
          document.body.removeChild(silentVideo);
          audioContext.close();

          resolve(audioBlob);
        };

        mediaRecorder.onerror = (event) => {
          console.error('❌ MediaRecorder error:', event);
          document.body.removeChild(silentVideo);
          audioContext.close();
          reject(new Error('Audio recording failed'));
        };

        // Start recording
        mediaRecorder.start();

        // Play the silent video to generate audio data
        silentVideo.play().catch(error => {
          console.error('❌ Failed to play video for audio extraction:', error);
          reject(error);
        });

        // Stop recording when video ends or after reasonable time
        silentVideo.addEventListener('ended', () => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        });

        // Fallback timeout (max 5 minutes)
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            console.log('⏰ Audio extraction timeout, stopping...');
            mediaRecorder.stop();
          }
        }, 300000);
      });

    } catch (error) {
      console.error('❌ Audio extraction failed:', error);
      throw new Error(`Audio extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateIntelligentFallback(
    videoElement: HTMLVideoElement,
    language: string,
    confidence: number
  ): SubtitleGenerationResult {
    // Generate test subtitles for debugging
    console.log('⚠️ Subtitle generation failed - generating test subtitles for debugging');

    const testSubtitles: SubtitleCue[] = [
      {
        startTime: 0,
        endTime: 3,
        text: "This is a test subtitle generated by fallback",
        id: "fallback-1"
      },
      {
        startTime: 3,
        endTime: 6,
        text: "AssemblyAI transcription failed, showing test content",
        id: "fallback-2"
      },
      {
        startTime: 6,
        endTime: 9,
        text: "Check console for error details",
        id: "fallback-3"
      }
    ];

    return {
      subtitles: testSubtitles,
      language,
      confidence: 0.5,
      method: 'fallback',
      duration: videoElement.duration || 10
    };
  }

  // Check if real-time subtitle generation is supported
  isRealTimeSupported(): boolean {
    return this.isSupported;
  }

  // Stop any ongoing recognition
  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }
}

export const subtitleGenerator = new SubtitleGeneratorService();
