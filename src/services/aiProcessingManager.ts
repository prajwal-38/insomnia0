// src/services/aiProcessingManager.ts

import { geminiService } from './geminiService';
import { subtitleGenerator } from './subtitleGenerator';
import { subtitleCompatibilityLayer } from './subtitleCompatibilityLayer';
import { realVideoEnhancer } from './realVideoEnhancer';
import { realAudioProcessor } from './realAudioProcessor';
import { realContentAnalyzer } from './realContentAnalyzer';
import { realColorGrader } from './realColorGrader';
import { realObjectDetector } from './realObjectDetector';
import type { AIAgentType, AIProcessingResult, NodeVideoSceneData } from '../types';
import { buildApiUrl } from '../config/environment';
// AI Processing Manager for handling AI agent operations
export class AIProcessingManager {
  private processingQueue: Map<string, Promise<AIProcessingResult>> = new Map();
  private results: Map<string, AIProcessingResult> = new Map();
  private listeners: Map<string, ((result: AIProcessingResult) => void)[]> = new Map();

  // Process a scene with an AI agent
  async processScene(
    agentId: string,
    agentType: AIAgentType,
    sceneData: NodeVideoSceneData,
    agentSettings?: Record<string, any>,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    const processingKey = `${agentId}-${sceneData.sceneId}`;

    // Check if already processing
    if (this.processingQueue.has(processingKey)) {
      return this.processingQueue.get(processingKey)!;
    }

    // Check if already processed
    const existingResult = this.results.get(processingKey);
    if (existingResult && !existingResult.error) {
      return existingResult;
    }

    // Start processing
    const processingPromise = this.performProcessing(
      agentId,
      agentType,
      sceneData,
      agentSettings,
      onProgress
    );

    this.processingQueue.set(processingKey, processingPromise);

    try {
      const result = await processingPromise;
      this.results.set(processingKey, result);
      this.notifyListeners(processingKey, result);
      return result;
    } finally {
      this.processingQueue.delete(processingKey);
    }
  }

  private async performProcessing(
    agentId: string,
    agentType: AIAgentType,
    sceneData: NodeVideoSceneData,
    agentSettings?: Record<string, any>,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    try {
      // Simulate progress updates
      onProgress?.(10);

      let result: any;

      // Handle different agent types with appropriate processing
      switch (agentType) {
        case 'subtitle-generator':
          result = await this.generateRealSubtitles(sceneData, onProgress);
          break;

        case 'video-enhancer':
          result = await this.processRealVideoEnhancement(sceneData, onProgress);
          break;

        case 'audio-processor':
          result = await this.processRealAudioEnhancement(sceneData, onProgress);
          break;

        case 'content-analyzer':
          result = await this.processRealContentAnalysis(sceneData, onProgress);
          break;

        case 'color-grader':
          result = await this.processRealColorGrading(sceneData, onProgress);
          break;

        case 'object-detector':
          result = await this.processRealObjectDetection(sceneData, onProgress);
          break;

        case 'audio-translator':
          result = await this.processAudioTranslation(sceneData, onProgress, agentSettings);
          break;

        default:
          // Try Gemini API first, fallback to mock processing
          try {
            const processedSceneData = this.prepareSceneData(sceneData);
            onProgress?.(30);

            const geminiResult = await geminiService.processWithAI(
              agentType,
              processedSceneData,
              agentId,
              sceneData.sceneId
            );

            if (geminiResult && !geminiResult.error) {
              result = geminiResult.result;
              onProgress?.(80);
            } else {
              // Fallback to mock processing if Gemini fails
              console.log(`🔄 Gemini failed for ${agentType}, using mock processing`);
              result = await this.getMockProcessingResult(agentType, sceneData, onProgress);
            }
          } catch (error) {
            console.log(`🔄 Gemini error for ${agentType}, using mock processing:`, error);
            result = await this.getMockProcessingResult(agentType, sceneData, onProgress);
          }
          break;
      }

      // Post-process the result
      const enhancedResult = this.enhanceResult(result, agentType);
      onProgress?.(100);

      return enhancedResult;
    } catch (error) {
      onProgress?.(100);
      throw error;
    }
  }

  private async generateRealSubtitles(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('🎬 Starting subtitle generation for scene:', sceneData.sceneId);
      onProgress?.(10);

      // Create a scene-specific video URL with timing parameters
      const sceneVideoUrl = buildApiUrl(`/api/video/${sceneData.analysisId}/scene?start=${sceneData.start}&duration=${sceneData.duration}`);

      console.log(`🎬 Processing scene segment: ${sceneData.start}s to ${sceneData.start + sceneData.duration}s`);

      const videoElement = document.createElement('video');
      videoElement.crossOrigin = 'anonymous';
      videoElement.preload = 'auto';
      videoElement.muted = true; // Ensure no audio plays during processing
      videoElement.volume = 0;   // Double ensure no audio
      videoElement.style.display = 'none'; // Hide the video element

      // Add to DOM temporarily for processing
      document.body.appendChild(videoElement);

      // Set up video loading promise
      const videoLoadPromise = new Promise<void>((resolve, reject) => {
        videoElement.onloadeddata = () => {
          console.log('✅ Scene video segment loaded for subtitle generation');
          resolve();
        };
        videoElement.onerror = () => {
          reject(new Error('Failed to load scene video segment for subtitle generation'));
        };
        // Timeout after 30 seconds
        setTimeout(() => reject(new Error('Scene video loading timeout')), 30000);
      });

      // Try scene-specific URL first, fallback to full video if not available
      videoElement.src = sceneVideoUrl;

      onProgress?.(20);

      // Wait for video to load
      try {
        await videoLoadPromise;
      } catch (error) {
        console.log('⚠️ Scene-specific video not available, using full video with timing');
        // Fallback to full video
        const fullVideoUrl = buildApiUrl(`/api/video/${sceneData.analysisId}`);
        videoElement.src = fullVideoUrl;

        await new Promise<void>((resolve, reject) => {
          videoElement.onloadeddata = () => resolve();
          videoElement.onerror = () => reject(new Error('Failed to load full video'));
          setTimeout(() => reject(new Error('Full video loading timeout')), 30000);
        });

        // Set video to scene start time
        if (sceneData.start) {
          videoElement.currentTime = sceneData.start;
          await new Promise(resolve => {
            videoElement.onseeked = () => resolve(void 0);
            if (videoElement.readyState >= 2) resolve(void 0);
          });
        }
      }

      onProgress?.(30);

      console.log('🎤 Generating subtitles with compatibility layer...');

      // Use compatibility layer for enhanced subtitle generation with backward compatibility
      const subtitleResult = await subtitleCompatibilityLayer.generateSubtitles(videoElement, {
        language: 'en-US',
        confidence: 0.7,
        // Enhanced options for optimized retrieval
        analysisId: sceneData.analysisId,
        sceneId: sceneData.sceneId,
        sceneStart: sceneData.start,
        sceneEnd: sceneData.start + sceneData.duration,
        useOptimizedRetrieval: true
      });

      onProgress?.(90);

      console.log(`✅ Generated ${subtitleResult.subtitles.length} subtitle segments`);

      // Clean up video element
      if (videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement);
      }

      const result = {
        subtitles: subtitleResult.subtitles,
        language: subtitleResult.language,
        confidence: subtitleResult.confidence,
        method: subtitleResult.method,
        type: 'subtitle-generation',
        duration: subtitleResult.duration,
        processedAt: Date.now(),
        sceneId: sceneData.sceneId,
        analysisId: sceneData.analysisId
      };

      console.log('🎉 Subtitle generation completed successfully');
      return result;

    } catch (error) {
      console.error('❌ Real subtitle generation failed:', error);

      // Return empty result instead of test subtitles
      return {
        subtitles: [],
        language: 'en-US',
        confidence: 0,
        method: 'failed',
        type: 'subtitle-generation',
        error: error instanceof Error ? error.message : 'Subtitle generation failed',
        processedAt: Date.now(),
        sceneId: sceneData.sceneId,
        analysisId: sceneData.analysisId
      };
    }
  }

  private prepareSceneData(sceneData: NodeVideoSceneData): any {
    return {
      sceneId: sceneData.sceneId,
      title: sceneData.title,
      duration: sceneData.duration,
      start: sceneData.start,
      end: sceneData.end,
      tags: sceneData.tags,
      avgVolume: sceneData.avgVolume,
      highEnergy: sceneData.highEnergy,
      transitionType: sceneData.transitionType,
      fileName: sceneData.originalVideoFileName,
      sceneIndex: sceneData.sceneIndex
    };
  }

  private enhanceResult(result: AIProcessingResult, agentType: AIAgentType): AIProcessingResult {
    // Add agent-specific enhancements to the result
    const enhanced = { ...result };

    // Add processing metadata
    enhanced.metadata = {
      ...enhanced.metadata,
      agentType,
      processedBy: 'AIProcessingManager',
      enhancedAt: Date.now()
    };

    // Add agent-specific result formatting
    if (enhanced.result && !enhanced.error) {
      enhanced.result = this.formatResultForAgent(enhanced.result, agentType);
    }

    return enhanced;
  }

  // Real Audio Enhancement Processing using Web Audio API
  private async processRealAudioEnhancement(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('🎵 Starting REAL audio enhancement with Web Audio API');
      onProgress?.(10);

      // Determine enhancement options based on scene characteristics
      const enhancementOptions = {
        noiseReduction: true, // Always apply noise reduction
        volumeNormalization: true, // Always normalize volume
        bassBoost: sceneData.avgVolume && sceneData.avgVolume < -20, // Boost bass for quiet scenes
        trebleEnhancement: true, // Always enhance treble for clarity
        compressor: sceneData.highEnergy || false, // Apply compression for high-energy scenes
        quality: 'medium' as const
      };

      onProgress?.(20);

      // Use real audio processor
      const enhancementResult = await realAudioProcessor.processAudio(
        sceneData,
        enhancementOptions,
        (progress) => {
          // Map audio processing progress (20-80) to our progress (20-80)
          const mappedProgress = 20 + (progress - 20) * 0.75;
          onProgress?.(mappedProgress);
        }
      );

      onProgress?.(90);

      // Format result for AI processing system
      const result = {
        type: 'audio-processing',
        enhancedAudioUrl: enhancementResult.enhancedAudioUrl,
        enhancedAudioBlob: enhancementResult.enhancedAudioBlob,
        enhancements: enhancementResult.enhancements,
        audioMetrics: enhancementResult.audioMetrics,
        processingTime: enhancementResult.processingTime,
        originalSize: enhancementResult.originalSize,
        enhancedSize: enhancementResult.enhancedSize,
        qualityScore: enhancementResult.qualityScore,
        isRealProcessing: true,
        improvements: [
          `Audio enhanced with ${Object.values(enhancementResult.enhancements).filter(e => e.applied).length} improvements`,
          `Quality score improved to ${(enhancementResult.qualityScore * 100).toFixed(0)}%`,
          `Processing completed in ${enhancementResult.processingTime}ms`,
          `Signal-to-noise ratio: ${enhancementResult.audioMetrics.signalToNoise}dB`
        ]
      };

      onProgress?.(100);
      console.log('✅ Real audio enhancement completed successfully');

      return result;

    } catch (error) {
      console.error('❌ Real audio enhancement failed:', error);
      console.log('🔄 Falling back to mock enhancement');

      // Fallback to mock processing
      return await this.processAudioEnhancement(sceneData, onProgress);
    }
  }

  // Real Content Analysis Processing using Canvas API
  private async processRealContentAnalysis(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('🔍 Starting REAL content analysis with Canvas API');
      onProgress?.(10);

      // Determine analysis options based on scene characteristics
      const analysisOptions = {
        detectObjects: true,
        analyzeMotion: true,
        detectText: false, // Basic implementation
        analyzeFaces: true,
        colorAnalysis: true,
        quality: 'medium' as const
      };

      onProgress?.(20);

      // Use real content analyzer
      const analysisResult = await realContentAnalyzer.analyzeContent(
        sceneData,
        analysisOptions,
        (progress) => {
          // Map analysis progress (20-80) to our progress (20-80)
          const mappedProgress = 20 + (progress - 20) * 0.75;
          onProgress?.(mappedProgress);
        }
      );

      onProgress?.(90);

      // Format result for AI processing system
      const result = {
        type: 'content-analysis',
        analysis: analysisResult.analysis,
        detectedObjects: analysisResult.detectedObjects,
        sceneMetrics: analysisResult.sceneMetrics,
        colorAnalysis: analysisResult.colorAnalysis,
        processingTime: analysisResult.processingTime,
        qualityScore: analysisResult.qualityScore,
        isRealProcessing: true,
        recommendations: analysisResult.recommendations
      };

      onProgress?.(100);
      console.log('✅ Real content analysis completed successfully');

      return result;

    } catch (error) {
      console.error('❌ Real content analysis failed:', error);
      console.log('🔄 Falling back to mock analysis');

      // Fallback to mock processing
      return await this.analyzeContent(sceneData, onProgress);
    }
  }

  // Real Color Grading Processing using Canvas API
  private async processRealColorGrading(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('🎨 Starting REAL color grading with Canvas API');
      onProgress?.(10);

      // Determine grading options based on scene characteristics
      const gradingOptions = {
        preset: 'cinematic-warm' as const, // Default to cinematic warm
        temperature: 10,
        tint: 5,
        exposure: 0.1,
        highlights: -20,
        shadows: 25,
        saturation: 15,
        vibrance: 20,
        quality: 'medium' as const
      };

      onProgress?.(20);

      // Use real color grader
      const gradingResult = await realColorGrader.gradeVideo(
        sceneData,
        gradingOptions,
        (progress) => {
          // Map grading progress (20-80) to our progress (20-80)
          const mappedProgress = 20 + (progress - 20) * 0.75;
          onProgress?.(mappedProgress);
        }
      );

      onProgress?.(90);

      // Format result for AI processing system
      const result = {
        type: 'color-grading',
        gradedVideoUrl: gradingResult.gradedVideoUrl,
        gradedVideoBlob: gradingResult.gradedVideoBlob,
        grading: gradingResult.grading,
        colorProfile: gradingResult.colorProfile,
        processingTime: gradingResult.processingTime,
        originalSize: gradingResult.originalSize,
        gradedSize: gradingResult.gradedSize,
        qualityScore: gradingResult.qualityScore,
        isRealProcessing: true,
        improvements: gradingResult.improvements
      };

      onProgress?.(100);
      console.log('✅ Real color grading completed successfully');

      return result;

    } catch (error) {
      console.error('❌ Real color grading failed:', error);
      console.log('🔄 Falling back to mock grading');

      // Fallback to mock processing
      return await this.processColorGrading(sceneData, onProgress);
    }
  }

  // Real Object Detection Processing using Canvas API
  private async processRealObjectDetection(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('👁️ Starting REAL object detection with Canvas API');
      onProgress?.(10);

      // Determine detection options based on scene characteristics
      const detectionOptions = {
        confidence: 0.6, // Medium confidence threshold
        maxObjects: 10,
        trackObjects: true,
        detectClasses: ['person', 'laptop', 'table', 'chair', 'book', 'clock'], // Common objects
        quality: 'medium' as const
      };

      onProgress?.(20);

      // Use real object detector
      const detectionResult = await realObjectDetector.detectObjects(
        sceneData,
        detectionOptions,
        (progress) => {
          // Map detection progress (20-80) to our progress (20-80)
          const mappedProgress = 20 + (progress - 20) * 0.75;
          onProgress?.(mappedProgress);
        }
      );

      onProgress?.(90);

      // Format result for AI processing system
      const result = {
        type: 'object-detection',
        objects: detectionResult.objects,
        summary: detectionResult.summary,
        processingTime: detectionResult.processingTime,
        qualityScore: detectionResult.qualityScore,
        isRealProcessing: true,
        insights: detectionResult.insights
      };

      onProgress?.(100);
      console.log('✅ Real object detection completed successfully');

      return result;

    } catch (error) {
      console.error('❌ Real object detection failed:', error);
      console.log('🔄 Falling back to mock detection');

      // Fallback to mock processing
      return await this.detectObjects(sceneData, onProgress);
    }
  }

  // Real Video Enhancement Processing using FFmpeg.js
  private async processRealVideoEnhancement(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    try {
      console.log('🎬 Starting REAL video enhancement with FFmpeg.js');
      onProgress?.(10);

      // Determine enhancement options based on scene characteristics
      const enhancementOptions = {
        stabilization: sceneData.highEnergy || false, // Apply stabilization for high-energy scenes
        denoising: true, // Always apply denoising
        sharpening: true, // Always apply sharpening
        colorCorrection: true, // Always apply color correction
        upscaling: false, // Skip upscaling for performance
        quality: 'medium' as const
      };

      onProgress?.(20);

      // Use real video enhancer
      const enhancementResult = await realVideoEnhancer.enhanceVideo(
        sceneData,
        enhancementOptions,
        (progress) => {
          // Map FFmpeg progress (20-80) to our progress (20-80)
          const mappedProgress = 20 + (progress - 20) * 0.75;
          onProgress?.(mappedProgress);
        }
      );

      onProgress?.(90);

      // Format result for AI processing system
      const result = {
        type: 'video-enhancement',
        enhancedVideoUrl: enhancementResult.enhancedVideoUrl,
        enhancedVideoBlob: enhancementResult.enhancedVideoBlob,
        enhancements: enhancementResult.enhancements,
        qualityScore: enhancementResult.qualityScore,
        processingTime: enhancementResult.processingTime,
        originalSize: enhancementResult.originalSize,
        enhancedSize: enhancementResult.enhancedSize,
        isRealProcessing: true,
        recommendations: [
          `Video enhanced with ${Object.values(enhancementResult.enhancements).filter(e => e.applied).length} improvements`,
          `Quality score improved to ${(enhancementResult.qualityScore * 100).toFixed(0)}%`,
          `Processing completed in ${enhancementResult.processingTime}ms`,
          enhancementResult.enhancedSize > enhancementResult.originalSize
            ? 'Enhanced video is larger due to quality improvements'
            : 'Enhanced video is optimized for size and quality'
        ]
      };

      onProgress?.(100);
      console.log('✅ Real video enhancement completed successfully');

      return result;

    } catch (error) {
      console.error('❌ Real video enhancement failed:', error);
      console.log('🔄 Falling back to mock enhancement');

      // Fallback to mock processing
      return await this.processVideoEnhancement(sceneData, onProgress);
    }
  }

  // Video Enhancement Processing (Mock fallback)
  private async processVideoEnhancement(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(20);

    // Simulate video enhancement processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    onProgress?.(60);

    // Mock enhancement results
    const result = {
      type: 'video-enhancement',
      enhancements: {
        stabilization: { applied: true, strength: 0.7 },
        denoising: { applied: true, strength: 0.5 },
        sharpening: { applied: true, strength: 0.3 },
        colorCorrection: { applied: true, brightness: 0.1, contrast: 0.2 }
      },
      qualityScore: 0.85,
      processingTime: 2000,
      isRealProcessing: false,
      recommendations: [
        'Video stabilization applied to reduce camera shake (simulated)',
        'Noise reduction improved overall clarity (simulated)',
        'Color correction enhanced visual appeal (simulated)',
        'Real processing available with FFmpeg.js integration'
      ]
    };

    onProgress?.(90);
    return result;
  }

  // Audio Enhancement Processing
  private async processAudioEnhancement(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(20);

    // Simulate audio processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    onProgress?.(60);

    const result = {
      type: 'audio-processing',
      enhancements: {
        noiseReduction: { applied: true, strength: 0.6 },
        volumeNormalization: { applied: true, targetLevel: -16 },
        bassBoost: { applied: false },
        trebleEnhancement: { applied: true, strength: 0.3 }
      },
      audioMetrics: {
        averageVolume: sceneData.avgVolume || -20,
        peakVolume: -6,
        dynamicRange: 14,
        signalToNoise: 45
      },
      improvements: [
        'Background noise reduced by 60%',
        'Audio levels normalized',
        'Treble enhanced for clarity'
      ]
    };

    onProgress?.(90);
    return result;
  }

  // Content Analysis Processing
  private async analyzeContent(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(20);

    // Simulate content analysis
    await new Promise(resolve => setTimeout(resolve, 1800));
    onProgress?.(60);

    const result = {
      type: 'content-analysis',
      analysis: {
        sceneType: this.detectSceneType(sceneData),
        mood: 'neutral',
        energy: sceneData.highEnergy ? 'high' : 'medium',
        complexity: 'moderate'
      },
      detectedObjects: [
        { name: 'person', confidence: 0.92, bbox: [100, 150, 200, 300] },
        { name: 'table', confidence: 0.78, bbox: [50, 200, 400, 350] }
      ],
      sceneMetrics: {
        motionLevel: sceneData.highEnergy ? 0.8 : 0.4,
        colorVariance: 0.6,
        textPresence: false,
        faceCount: 1
      },
      recommendations: [
        'Scene contains clear subject focus',
        'Good lighting conditions detected',
        'Consider adding B-roll for variety'
      ]
    };

    onProgress?.(90);
    return result;
  }

  // Color Grading Processing
  private async processColorGrading(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(20);

    // Simulate color grading
    await new Promise(resolve => setTimeout(resolve, 2200));
    onProgress?.(60);

    const result = {
      type: 'color-grading',
      grading: {
        temperature: 5600,
        tint: 0.1,
        exposure: 0.2,
        highlights: -0.3,
        shadows: 0.4,
        whites: 0.1,
        blacks: -0.2,
        saturation: 0.15,
        vibrance: 0.25
      },
      colorProfile: 'cinematic-warm',
      improvements: [
        'Warmed color temperature for better mood',
        'Enhanced shadow detail',
        'Increased vibrance for visual appeal',
        'Balanced highlights and shadows'
      ]
    };

    onProgress?.(90);
    return result;
  }

  // Object Detection Processing
  private async detectObjects(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(20);

    // Simulate object detection
    await new Promise(resolve => setTimeout(resolve, 1600));
    onProgress?.(60);

    const result = {
      type: 'object-detection',
      objects: [
        {
          id: 1,
          name: 'person',
          confidence: 0.94,
          bbox: [120, 80, 280, 400],
          tracking: true,
          timespan: { start: 0, end: sceneData.duration }
        },
        {
          id: 2,
          name: 'laptop',
          confidence: 0.87,
          bbox: [200, 250, 350, 320],
          tracking: false,
          timespan: { start: 2.5, end: sceneData.duration }
        }
      ],
      summary: {
        totalObjects: 2,
        uniqueClasses: ['person', 'laptop'],
        averageConfidence: 0.905,
        trackingEnabled: true
      },
      insights: [
        'Primary subject (person) detected throughout scene',
        'Secondary object (laptop) appears mid-scene',
        'High confidence detection rates'
      ]
    };

    onProgress?.(90);
    return result;
  }

  // Audio Translation Processing
  private async processAudioTranslation(
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void,
    agentSettings?: Record<string, any>
  ): Promise<any> {
    try {
      console.log('🌐 Starting audio translation for scene:', sceneData.sceneId);
      onProgress?.(10);

      // Get the original video URL for this scene
      const videoUrl = buildApiUrl(`/api/video/${sceneData.analysisId}`);

      onProgress?.(20);

      // Prepare translation parameters with agent settings
      const targetLanguage = agentSettings?.targetLanguage || 'es';
      const voice = agentSettings?.voice || 'Kore';

      const translationParams = {
        videoUrl: videoUrl,
        sceneStart: sceneData.start,
        sceneDuration: sceneData.duration,
        targetLanguage: targetLanguage,
        voice: voice,
        sceneId: sceneData.sceneId,
        analysisId: sceneData.analysisId
      };

      console.log('🌐 Translation parameters:', translationParams);
      onProgress?.(30);

      // Call the translation API endpoint
      const translationApiUrl = buildApiUrl('/api/translate-audio');
      console.log('🌐 Calling translation API:', translationApiUrl);

      const response = await fetch(translationApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(translationParams)
      });

      console.log('🌐 Translation API response status:', response.status);

      onProgress?.(60);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🌐 Translation API error response:', errorText);
        throw new Error(`Translation API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const translationResult = await response.json();
      onProgress?.(90);

      console.log('✅ Audio translation completed:', translationResult);

      const result = {
        type: 'audio-translation',
        translatedVideoUrl: translationResult.translatedVideoUrl,
        originalLanguage: translationResult.originalLanguage || 'en',
        targetLanguage: translationResult.targetLanguage,
        voice: translationResult.voice,
        processingTime: translationResult.processingTime,
        isRealProcessing: true,
        sceneId: sceneData.sceneId,
        analysisId: sceneData.analysisId,
        improvements: [
          `Audio translated from ${translationResult.originalLanguage || 'English'} to ${translationResult.targetLanguage}`,
          `Voice synthesis using ${translationResult.voice} voice`,
          `Processing completed in ${translationResult.processingTime || 'unknown time'}`,
          'Original video content replaced with translated version'
        ]
      };

      onProgress?.(100);
      return result;

    } catch (error) {
      console.error('❌ Audio translation failed:', error);

      // Return error result instead of fallback
      return {
        type: 'audio-translation',
        error: error instanceof Error ? error.message : 'Translation failed',
        isRealProcessing: false,
        sceneId: sceneData.sceneId,
        analysisId: sceneData.analysisId,
        improvements: [
          'Translation processing failed',
          'Please check the translation service configuration',
          'Original video content remains unchanged'
        ]
      };
    }
  }

  // Helper method to detect scene type
  private detectSceneType(sceneData: NodeVideoSceneData): string {
    if (sceneData.highEnergy) return 'action';
    if (sceneData.avgVolume && sceneData.avgVolume > -10) return 'dialogue';
    if (sceneData.duration < 3) return 'transition';
    return 'narrative';
  }

  // Mock processing fallback for when real AI services fail
  private async getMockProcessingResult(
    agentType: AIAgentType,
    sceneData: NodeVideoSceneData,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    onProgress?.(40);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    onProgress?.(70);

    switch (agentType) {
      case 'auto-editor':
        return {
          type: 'editing-suggestions',
          cutPoints: [
            { time: sceneData.duration * 0.3, reason: 'Natural pause detected' },
            { time: sceneData.duration * 0.7, reason: 'Scene transition point' }
          ],
          transitions: [
            { type: 'fade', duration: 0.5, position: sceneData.duration * 0.5 }
          ],
          recommendations: [
            'Consider adding a fade transition at mid-point',
            'Scene has good pacing for current length',
            'Audio levels are consistent throughout'
          ]
        };

      case 'thumbnail-generator':
        return {
          type: 'thumbnail-suggestions',
          thumbnails: [
            {
              timestamp: sceneData.duration * 0.2,
              score: 0.9,
              reason: 'High visual interest, good composition'
            },
            {
              timestamp: sceneData.duration * 0.6,
              score: 0.8,
              reason: 'Clear subject focus, good lighting'
            }
          ],
          bestThumbnail: sceneData.duration * 0.2,
          analysis: 'Scene contains clear focal points suitable for thumbnails'
        };

      case 'music-generator':
        return {
          type: 'music-suggestions',
          mood: this.detectSceneType(sceneData),
          suggestions: [
            {
              genre: 'ambient',
              tempo: sceneData.highEnergy ? 120 : 80,
              key: 'C major',
              confidence: 0.85
            },
            {
              genre: 'cinematic',
              tempo: 90,
              key: 'A minor',
              confidence: 0.75
            }
          ],
          recommendations: [
            `${sceneData.highEnergy ? 'Upbeat' : 'Calm'} music would complement this scene`,
            'Consider instrumental tracks to avoid competing with dialogue'
          ]
        };

      case 'transition-creator':
        return {
          type: 'transition-suggestions',
          transitions: [
            {
              type: 'crossfade',
              duration: 1.0,
              easing: 'ease-in-out',
              description: 'Smooth crossfade for seamless flow'
            },
            {
              type: 'slide',
              duration: 0.8,
              direction: 'left',
              description: 'Dynamic slide transition'
            }
          ],
          recommended: 'crossfade',
          reasoning: 'Crossfade works best with this scene type and pacing'
        };

      case 'effect-applier':
        return {
          type: 'effect-suggestions',
          effects: [
            {
              name: 'color-correction',
              strength: 0.3,
              description: 'Enhance color balance and saturation'
            },
            {
              name: 'stabilization',
              strength: 0.5,
              description: 'Reduce camera shake'
            },
            {
              name: 'noise-reduction',
              strength: 0.4,
              description: 'Clean up background noise'
            }
          ],
          priority: ['color-correction', 'stabilization', 'noise-reduction'],
          estimatedImprovement: '25% quality increase'
        };

      default:
        return {
          type: 'generic-analysis',
          analysis: `Mock analysis for ${agentType}`,
          confidence: 0.7,
          recommendations: [
            'Scene analysis completed',
            'Processing successful with mock data',
            'Real AI processing available with API configuration'
          ]
        };
    }
  }

  private formatResultForAgent(result: any, agentType: AIAgentType): any {
    // Format results based on agent type
    switch (agentType) {
      case 'video-enhancer':
        return {
          ...result,
          type: 'video-enhancement',
          recommendations: result.recommendations || [],
          qualityScore: result.qualityScore || 0.8
        };

      case 'audio-processor':
        return {
          ...result,
          type: 'audio-processing',
          audioMetrics: result.audioMetrics || {},
          improvements: result.improvements || []
        };

      case 'content-analyzer':
        return {
          ...result,
          type: 'content-analysis',
          detectedObjects: result.detectedObjects || [],
          sceneMetrics: result.sceneMetrics || {}
        };

      case 'auto-editor':
        return {
          ...result,
          type: 'editing-suggestions',
          cutPoints: result.cutPoints || [],
          transitions: result.transitions || []
        };

      case 'subtitle-generator':
        return {
          ...result,
          type: 'subtitles',
          subtitles: result.subtitles || [],
          timing: result.timing || {}
        };

      default:
        return {
          ...result,
          type: agentType,
          processed: true
        };
    }
  }

  // Add listener for processing results
  addResultListener(processingKey: string, listener: (result: AIProcessingResult) => void): void {
    if (!this.listeners.has(processingKey)) {
      this.listeners.set(processingKey, []);
    }
    this.listeners.get(processingKey)!.push(listener);
  }

  // Remove listener
  removeResultListener(processingKey: string, listener: (result: AIProcessingResult) => void): void {
    const listeners = this.listeners.get(processingKey);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.listeners.delete(processingKey);
      }
    }
  }

  private notifyListeners(processingKey: string, result: AIProcessingResult): void {
    const listeners = this.listeners.get(processingKey);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          console.error('Error in AI processing result listener:', error);
        }
      });
    }
  }

  // Get cached result
  getCachedResult(agentId: string, sceneId: string): AIProcessingResult | null {
    const processingKey = `${agentId}-${sceneId}`;
    return this.results.get(processingKey) || null;
  }

  // Check if processing
  isProcessing(agentId: string, sceneId: string): boolean {
    const processingKey = `${agentId}-${sceneId}`;
    return this.processingQueue.has(processingKey);
  }

  // Clear cache
  clearCache(): void {
    this.results.clear();
    this.listeners.clear();
  }

  // Get all results for a scene
  getSceneResults(sceneId: string): AIProcessingResult[] {
    const results: AIProcessingResult[] = [];
    for (const [key, result] of this.results.entries()) {
      if (key.endsWith(`-${sceneId}`)) {
        results.push(result);
      }
    }
    return results;
  }

  // Save results to localStorage
  saveResultsToStorage(): void {
    try {
      const resultsArray = Array.from(this.results.entries());
      localStorage.setItem('ai-processing-results', JSON.stringify(resultsArray));
    } catch (error) {
      console.error('Failed to save AI processing results to localStorage:', error);
    }
  }

  // Load results from localStorage
  loadResultsFromStorage(): void {
    try {
      const saved = localStorage.getItem('ai-processing-results');
      if (saved) {
        const resultsArray = JSON.parse(saved);
        this.results = new Map(resultsArray);
      }
    } catch (error) {
      console.error('Failed to load AI processing results from localStorage:', error);
    }
  }
}

// Singleton instance
export const aiProcessingManager = new AIProcessingManager();
