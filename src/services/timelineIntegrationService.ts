// src/services/timelineIntegrationService.ts

import type { AIProcessingResult, AIAgentType } from '../types';
import { unifiedDataService } from './unifiedDataService';
import { dispatch } from '@designcombo/events';
import { ADD_ITEMS } from '@designcombo/state';
import { generateId } from '@designcombo/timeline';

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'subtitle' | 'effect' | 'overlay';
  name: string;
  items: TimelineItem[];
  visible: boolean;
  locked: boolean;
}

export interface TimelineItem {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  data: any;
  type: string;
  source?: string;
}

export interface SubtitleTrackItem extends TimelineItem {
  text: string;
  style?: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    position?: 'bottom' | 'top' | 'center';
  };
}

export interface EffectTrackItem extends TimelineItem {
  effectType: string;
  parameters: Record<string, any>;
  intensity: number;
}

// Timeline Integration Service for AI Results
export class TimelineIntegrationService {
  private static instance: TimelineIntegrationService;
  private timelineTracks: Map<string, TimelineTrack[]> = new Map();

  private constructor() {
    // Listen for AI results updates
    unifiedDataService.addEventListener('ai-results-updated', this.handleAIResultsUpdate.bind(this));
  }

  static getInstance(): TimelineIntegrationService {
    if (!TimelineIntegrationService.instance) {
      TimelineIntegrationService.instance = new TimelineIntegrationService();
    }
    return TimelineIntegrationService.instance;
  }

  // Handle AI results updates and integrate with timeline
  private async handleAIResultsUpdate(data: any): Promise<void> {
    const { sceneId, agentType, result } = data;
    
    try {
      console.log(`🎬 Integrating ${agentType} results into timeline for scene ${sceneId}`);
      
      switch (agentType) {
        case 'subtitle-generator':
          await this.integrateSubtitles(sceneId, result);
          break;
        
        case 'video-enhancer':
          await this.integrateVideoEnhancements(sceneId, result);
          break;
        
        case 'audio-processor':
          await this.integrateAudioEnhancements(sceneId, result);
          break;
        
        case 'color-grader':
          await this.integrateColorGrading(sceneId, result);
          break;
        
        case 'object-detector':
          await this.integrateObjectDetection(sceneId, result);
          break;
        
        case 'auto-editor':
          await this.integrateEditingSuggestions(sceneId, result);
          break;

        case 'audio-translator':
          await this.integrateAudioTranslation(sceneId, result);
          break;

        default:
          console.log(`📝 No specific timeline integration for ${agentType}`);
          break;
      }
      
      // Save updated timeline tracks
      this.saveTimelineTracks(sceneId);
      
    } catch (error) {
      console.error(`❌ Failed to integrate ${agentType} results into timeline:`, error);
    }
  }

  // Global flag to prevent subtitle integration cascade
  private static subtitleIntegrationInProgress = new Set<string>();

  // Integrate subtitle results into timeline
  private async integrateSubtitles(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.subtitles || !Array.isArray(result.result.subtitles) || result.result.subtitles.length === 0) {
      console.log('⚠️ No subtitles found in result, skipping timeline integration');
      return;
    }

    // 🚫 PREVENT SUBTITLE CASCADE: Check if subtitle integration is already in progress for this scene
    if (TimelineIntegrationService.subtitleIntegrationInProgress.has(sceneId)) {
      console.log(`⚠️ SUBTITLE CASCADE PREVENTED: Integration already in progress for scene ${sceneId}`);
      return;
    }

    // Set integration flag
    TimelineIntegrationService.subtitleIntegrationInProgress.add(sceneId);

    try {
      const subtitles = result.result.subtitles;

      // ENHANCED: Check multiple possible duplicate sources
      const existingSubtitleKey = `timeline-subtitles-${sceneId}`;
      const existingSubtitles = localStorage.getItem(existingSubtitleKey);

      // Also check if there are already subtitle items in the timeline for this scene
      const timelineState = localStorage.getItem('timeline-state');
      let hasExistingSubtitles = false;

    if (timelineState) {
      try {
        const parsed = JSON.parse(timelineState);
        // Check if there are already caption items with this sceneId
        if (parsed.tracks) {
          for (const track of parsed.tracks) {
            if (track.items) {
              const existingCaptions = track.items.filter((item: any) =>
                item.type === 'caption' &&
                item.metadata?.sceneId === sceneId
              );
              if (existingCaptions.length > 0) {
                hasExistingSubtitles = true;
                console.log(`⚠️ Found ${existingCaptions.length} existing caption items for scene ${sceneId}`);
                break;
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse timeline state for duplicate check:', error);
      }
    }

    if (existingSubtitles || hasExistingSubtitles) {
      console.log(`⚠️ Subtitles already exist for scene ${sceneId}, skipping to prevent duplicates`);
      console.log(`  - localStorage key exists: ${!!existingSubtitles}`);
      console.log(`  - timeline items exist: ${hasExistingSubtitles}`);
      return;
    }

    // Get scene timing information to align subtitles with video scene position
    const sceneTimingOffset = await this.getSceneTimelineOffset(sceneId);
    console.log(`🎬 Scene ${sceneId} timeline offset: ${sceneTimingOffset}ms`);

    // Create caption items for the main timeline using @designcombo/timeline format
    const captionItems = subtitles.map((subtitle: any) => ({
      id: generateId(),
      type: 'caption',
      name: 'AI Subtitle',
      display: {
        // Position subtitles relative to scene position on timeline
        from: sceneTimingOffset + (subtitle.startTime * 1000), // Scene offset + subtitle start
        to: sceneTimingOffset + (subtitle.endTime * 1000),     // Scene offset + subtitle end
      },
      details: {
        text: subtitle.text,
        fontSize: 28, // Optimized font size for video preview
        color: '#ffffff',
        textAlign: 'center',
        // Position relative to composition size (1920x1080 default)
        top: 920, // Bottom area of video (1080 - 160 = 920)
        left: 160, // Center with margins (1920/2 - 800/2 = 160)
        width: 1600, // Centered width with margins
        height: 120, // Sufficient height for multi-line text
        fontFamily: 'Arial, sans-serif',
        fontUrl: '',
        opacity: 100,
        borderWidth: 3, // Thicker outline for better visibility
        borderColor: '#000000',
        appearedColor: '#ffffff',
        activeColor: '#ffffff',
        activeFillColor: '#ffffff',
        fontWeight: 'bold',
        textDecoration: 'none',
        lineHeight: '1.2', // Better line spacing
        letterSpacing: '0.5px', // Slight letter spacing for readability
        wordSpacing: 'normal',
        wordWrap: 'break-word',
        wordBreak: 'normal',
        textTransform: 'none',
        // Enhanced shadow for better contrast
        boxShadow: {
          color: '#000000',
          x: 3,
          y: 3,
          blur: 6,
        }
      },
      metadata: {
        sourceUrl: 'ai-generated',
        aiGenerated: true,
        sceneId: sceneId,
        confidence: subtitle.confidence || 0.9,
        words: [] // Add words array for caption compatibility
      },
      animations: {
        in: null,
        out: null
      },
      trim: {
        from: 0,
        to: (subtitle.endTime - subtitle.startTime) * 1000
      }
    }));

    // Add caption items to the main timeline
    if (captionItems.length > 0) {
      console.log(`🎬 Adding ${captionItems.length} AI subtitles to main timeline`);
      console.log('Caption items structure:', captionItems[0]); // Debug first item

      try {
        dispatch(ADD_ITEMS, {
          payload: {
            trackItems: captionItems
          }
        });

        console.log(`✅ Added ${captionItems.length} AI subtitles to main timeline`);

        // Mark subtitles as added to prevent duplicates
        localStorage.setItem(existingSubtitleKey, JSON.stringify({
          sceneId,
          addedAt: Date.now(),
          subtitleCount: captionItems.length
        }));

        // Also clear any duplicate subtitle tracking keys that might exist
        this.clearDuplicateSubtitleKeys(sceneId);

      } catch (error) {
        console.error('❌ Failed to add caption items to timeline:', error);
        console.error('Caption items that failed:', captionItems);
      }
    }

    // Also store in our custom track system for reference
    const subtitleTrack: TimelineTrack = {
      id: `subtitle-track-${sceneId}`,
      type: 'subtitle',
      name: 'AI Generated Subtitles',
      visible: true,
      locked: false,
      items: subtitles.map((subtitle: any, index: number) => ({
        id: `subtitle-${sceneId}-${index}`,
        startTime: subtitle.startTime,
        endTime: subtitle.endTime,
        duration: subtitle.endTime - subtitle.startTime,
        text: subtitle.text,
        type: 'subtitle',
        data: subtitle,
        source: 'ai-generated'
      } as SubtitleTrackItem))
    };

      this.addOrUpdateTrack(sceneId, subtitleTrack);

    } finally {
      // 🔓 CLEAR SUBTITLE INTEGRATION FLAG: Always clear the flag
      TimelineIntegrationService.subtitleIntegrationInProgress.delete(sceneId);
      console.log(`🔓 SUBTITLE INTEGRATION COMPLETE: Cleared flag for scene ${sceneId}`);
    }
  }

  // Integrate video enhancement results
  private async integrateVideoEnhancements(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.enhancements) return;
    
    const enhancements = result.result.enhancements;
    const effectItems: EffectTrackItem[] = [];
    
    // Create effect items for each enhancement
    Object.entries(enhancements).forEach(([effectType, config]: [string, any]) => {
      if (config.applied) {
        effectItems.push({
          id: `effect-${sceneId}-${effectType}`,
          startTime: 0,
          endTime: 10, // Default duration, should be scene duration
          duration: 10,
          effectType,
          parameters: config,
          intensity: config.strength || 0.5,
          type: 'video-effect',
          data: config
        });
      }
    });
    
    if (effectItems.length > 0) {
      const effectTrack: TimelineTrack = {
        id: `video-effects-${sceneId}`,
        type: 'effect',
        name: 'Video Enhancements',
        visible: true,
        locked: false,
        items: effectItems
      };
      
      this.addOrUpdateTrack(sceneId, effectTrack);
      console.log(`✅ Added ${effectItems.length} video effects to timeline`);
    }
  }

  // Integrate audio enhancement results
  private async integrateAudioEnhancements(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.enhancements) return;
    
    const enhancements = result.result.enhancements;
    const audioEffects: EffectTrackItem[] = [];
    
    Object.entries(enhancements).forEach(([effectType, config]: [string, any]) => {
      if (config.applied) {
        audioEffects.push({
          id: `audio-effect-${sceneId}-${effectType}`,
          startTime: 0,
          endTime: 10,
          duration: 10,
          effectType,
          parameters: config,
          intensity: config.strength || 0.5,
          type: 'audio-effect',
          data: config
        });
      }
    });
    
    if (audioEffects.length > 0) {
      const audioTrack: TimelineTrack = {
        id: `audio-effects-${sceneId}`,
        type: 'effect',
        name: 'Audio Enhancements',
        visible: true,
        locked: false,
        items: audioEffects
      };
      
      this.addOrUpdateTrack(sceneId, audioTrack);
      console.log(`✅ Added ${audioEffects.length} audio effects to timeline`);
    }
  }

  // Integrate color grading results
  private async integrateColorGrading(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.grading) return;
    
    const grading = result.result.grading;
    const colorEffect: EffectTrackItem = {
      id: `color-grading-${sceneId}`,
      startTime: 0,
      endTime: 10,
      duration: 10,
      effectType: 'color-grading',
      parameters: grading,
      intensity: 1.0,
      type: 'color-effect',
      data: grading
    };
    
    const colorTrack: TimelineTrack = {
      id: `color-track-${sceneId}`,
      type: 'effect',
      name: 'Color Grading',
      visible: true,
      locked: false,
      items: [colorEffect]
    };
    
    this.addOrUpdateTrack(sceneId, colorTrack);
    console.log(`✅ Added color grading to timeline`);
  }

  // Integrate object detection results
  private async integrateObjectDetection(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.objects) return;
    
    const objects = result.result.objects;
    const overlayItems: TimelineItem[] = objects.map((obj: any, index: number) => ({
      id: `object-overlay-${sceneId}-${index}`,
      startTime: obj.timespan?.start || 0,
      endTime: obj.timespan?.end || 10,
      duration: (obj.timespan?.end || 10) - (obj.timespan?.start || 0),
      type: 'object-overlay',
      data: obj,
      source: 'ai-detected'
    }));
    
    const overlayTrack: TimelineTrack = {
      id: `object-overlays-${sceneId}`,
      type: 'overlay',
      name: 'Detected Objects',
      visible: true,
      locked: false,
      items: overlayItems
    };
    
    this.addOrUpdateTrack(sceneId, overlayTrack);
    console.log(`✅ Added ${objects.length} object overlays to timeline`);
  }

  // Integrate editing suggestions
  private async integrateEditingSuggestions(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.cutPoints && !result.result?.transitions) return;

    const suggestions: TimelineItem[] = [];

    // Add cut points as markers
    if (result.result.cutPoints) {
      result.result.cutPoints.forEach((cut: any, index: number) => {
        suggestions.push({
          id: `cut-point-${sceneId}-${index}`,
          startTime: cut.time,
          endTime: cut.time + 0.1, // Very short duration for markers
          duration: 0.1,
          type: 'cut-marker',
          data: cut,
          source: 'ai-suggested'
        });
      });
    }

    // Add transitions
    if (result.result.transitions) {
      result.result.transitions.forEach((transition: any, index: number) => {
        suggestions.push({
          id: `transition-${sceneId}-${index}`,
          startTime: transition.position,
          endTime: transition.position + transition.duration,
          duration: transition.duration,
          type: 'transition',
          data: transition,
          source: 'ai-suggested'
        });
      });
    }

    if (suggestions.length > 0) {
      const suggestionTrack: TimelineTrack = {
        id: `editing-suggestions-${sceneId}`,
        type: 'overlay',
        name: 'AI Editing Suggestions',
        visible: true,
        locked: false,
        items: suggestions
      };

      this.addOrUpdateTrack(sceneId, suggestionTrack);
      console.log(`✅ Added ${suggestions.length} editing suggestions to timeline`);
    }
  }

  // Integrate audio translation results
  private async integrateAudioTranslation(sceneId: string, result: AIProcessingResult): Promise<void> {
    if (!result.result?.translatedVideoUrl) {
      console.log('⚠️ No translated video URL found in result, skipping timeline integration');
      return;
    }

    console.log(`🌐 Integrating audio translation for scene ${sceneId}`);

    try {
      // Get scene timing information to update the correct video item
      const sceneTimingOffset = await this.getSceneTimelineOffset(sceneId);
      console.log(`🎬 Scene ${sceneId} timeline offset: ${sceneTimingOffset}ms`);

      // Update the video source in the timeline to use the translated video
      const translationInfo = {
        translatedVideoUrl: result.result.translatedVideoUrl,
        targetLanguage: result.result.targetLanguage,
        voice: result.result.voice,
        originalLanguage: result.result.originalLanguage || 'en',
        translatedAt: Date.now(),
        sceneId: sceneId
      };
                                  
      // Store translation info for timeline sync
      const translationKey = `translation-${sceneId}`;
      localStorage.setItem(translationKey, JSON.stringify(translationInfo));

      // The main App component will handle updating scene data and dispatching events
      // This service just logs the integration for now
      console.log(`🎬 Timeline integration service: Translation info stored for scene ${sceneId}`);

      console.log(`✅ Audio translation integrated for scene ${sceneId}`);
      console.log(`🎬 Translated video URL: ${result.result.translatedVideoUrl}`);

    } catch (error) {
      console.error(`❌ Failed to integrate audio translation for scene ${sceneId}:`, error);
    }
  }

  // Add or update a track for a scene
  private addOrUpdateTrack(sceneId: string, track: TimelineTrack): void {
    let tracks = this.timelineTracks.get(sceneId) || [];
    
    // Remove existing track of the same type
    tracks = tracks.filter(t => t.id !== track.id);
    
    // Add new track
    tracks.push(track);
    
    this.timelineTracks.set(sceneId, tracks);
  }

  // Save timeline tracks to localStorage
  private saveTimelineTracks(sceneId: string): void {
    const tracks = this.timelineTracks.get(sceneId);
    if (tracks) {
      localStorage.setItem(`timeline-tracks-${sceneId}`, JSON.stringify(tracks));
      console.log(`💾 Saved ${tracks.length} timeline tracks for scene ${sceneId}`);
    }
  }

  // Clear duplicate subtitle tracking keys
  private clearDuplicateSubtitleKeys(sceneId: string): void {
    // Clear any old subtitle tracking keys that might cause duplicates
    const keysToCheck = [
      `timeline-subtitles-${sceneId}`,
      `subtitles-added-${sceneId}`,
      `scene-subtitles-${sceneId}`
    ];

    keysToCheck.forEach(key => {
      if (localStorage.getItem(key)) {
        console.log(`🧹 Clearing duplicate subtitle key: ${key}`);
        localStorage.removeItem(key);
      }
    });
  }

  // Public method to clear all subtitle duplicates for debugging
  public clearAllSubtitleDuplicates(): void {
    console.log('🧹 Clearing all subtitle duplicate tracking keys...');

    // Get all localStorage keys
    const allKeys = Object.keys(localStorage);
    const subtitleKeys = allKeys.filter(key =>
      key.includes('timeline-subtitles-') ||
      key.includes('subtitles-added-') ||
      key.includes('scene-subtitles-')
    );

    subtitleKeys.forEach(key => {
      console.log(`🧹 Removing subtitle tracking key: ${key}`);
      localStorage.removeItem(key);
    });

    console.log(`🧹 Cleared ${subtitleKeys.length} subtitle tracking keys`);
  }

  // Get timeline tracks for a scene
  getTimelineTracks(sceneId: string): TimelineTrack[] {
    // Try to get from memory first
    let tracks = this.timelineTracks.get(sceneId);
    
    if (!tracks) {
      // Load from localStorage
      try {
        const stored = localStorage.getItem(`timeline-tracks-${sceneId}`);
        if (stored) {
          tracks = JSON.parse(stored);
          this.timelineTracks.set(sceneId, tracks!);
        }
      } catch (error) {
        console.error(`Error loading timeline tracks for scene ${sceneId}:`, error);
      }
    }
    
    return tracks || [];
  }

  // Clear timeline tracks for a scene
  clearTimelineTracks(sceneId: string): void {
    this.timelineTracks.delete(sceneId);
    localStorage.removeItem(`timeline-tracks-${sceneId}`);
    console.log(`🗑️ Cleared timeline tracks for scene ${sceneId}`);
  }

  // Get scene timeline offset to align subtitles with video scene position
  private async getSceneTimelineOffset(sceneId: string): Promise<number> {
    try {
      // Try to find the video item in the timeline that corresponds to this scene
      const stateManager = (window as any).timelineStateManager;
      if (stateManager) {
        const state = stateManager.getState();
        const trackItemsMap = state.trackItemsMap || {};

        // Find video item with matching sceneId in metadata
        for (const [itemId, item] of Object.entries(trackItemsMap)) {
          if (item && typeof item === 'object' && 'metadata' in item) {
            const metadata = (item as any).metadata;
            if (metadata?.sceneId === sceneId || metadata?.sceneIndex !== undefined) {
              const display = (item as any).display;
              if (display?.from !== undefined) {
                console.log(`🎯 Found scene ${sceneId} at timeline position: ${display.from}ms`);
                return display.from;
              }
            }
          }
        }
      }

      // Fallback: try to get scene order and calculate offset
      const { getVideoPlaybackOrder } = await import('../utils/compatibilityLayer');
      const scenes = getVideoPlaybackOrder();

      let cumulativeOffset = 0;
      for (const scene of scenes) {
        if (scene.sceneId === sceneId) {
          console.log(`🎯 Calculated scene ${sceneId} offset: ${cumulativeOffset}ms`);
          return cumulativeOffset;
        }
        // Add scene duration to cumulative offset
        cumulativeOffset += (scene.duration || 0) * 1000; // Convert to milliseconds
      }

      console.warn(`⚠️ Could not find timeline offset for scene ${sceneId}, using 0`);
      return 0;

    } catch (error) {
      console.error(`❌ Error getting scene timeline offset for ${sceneId}:`, error);
      return 0;
    }
  }

  // Update main timeline video source with translated video
  private async updateMainTimelineVideoSource(sceneId: string, translatedVideoUrl: string): Promise<void> {
    try {
      console.log(`🎬 Updating main timeline video source for scene ${sceneId}`);

      // Get the timeline state manager
      const stateManager = (window as any).timelineStateManager;
      if (!stateManager) {
        console.warn('⚠️ Timeline state manager not available');
        return;
      }

      const state = stateManager.getState();
      const trackItemsMap = state.trackItemsMap || {};

      // Find the video item that corresponds to this scene
      for (const [itemId, item] of Object.entries(trackItemsMap)) {
        if (item && typeof item === 'object' && 'metadata' in item) {
          const metadata = (item as any).metadata;
          if (metadata?.sceneId === sceneId) {
            console.log(`🎯 Found timeline video item for scene ${sceneId}: ${itemId}`);

            // Update the video source using the timeline's REPLACE_MEDIA action
            const { dispatch, REPLACE_MEDIA } = await import('@designcombo/state');

            dispatch(REPLACE_MEDIA, {
              payload: {
                [itemId]: {
                  details: {
                    src: translatedVideoUrl,
                  },
                  metadata: {
                    ...metadata,
                    translatedVideoUrl: translatedVideoUrl,
                    isTranslated: true
                  }
                },
              },
            });

            console.log(`✅ Updated main timeline video source for scene ${sceneId}`);
            return;
          }
        }
      }

      console.warn(`⚠️ Could not find timeline video item for scene ${sceneId}`);
    } catch (error) {
      console.error(`❌ Error updating main timeline video source for scene ${sceneId}:`, error);
    }
  }

  // Update scene data in project manager with translation info
  private async updateSceneDataWithTranslation(sceneId: string, translationInfo: any): Promise<void> {
    try {
      console.log(`📊 Updating scene data with translation info for scene ${sceneId}`);

      // Import project data manager
      const { projectDataManager } = await import('../utils/projectDataManager');

      const project = projectDataManager.getCurrentProject();
      if (!project) {
        console.warn('⚠️ No current project found');
        return;
      }

      // Find and update the scene
      const sceneIndex = project.scenes.findIndex(scene => scene.sceneId === sceneId);
      if (sceneIndex === -1) {
        console.warn(`⚠️ Scene ${sceneId} not found in project data`);
        return;
      }

      // Update the scene with translation info
      const updatedScene = {
        ...project.scenes[sceneIndex],
        translatedVideoUrl: translationInfo.translatedVideoUrl,
        isTranslated: true,
        translationInfo: translationInfo
      };

      // Update the project
      const updatedScenes = [...project.scenes];
      updatedScenes[sceneIndex] = updatedScene;

      const updatedProject = {
        ...project,
        scenes: updatedScenes
      };

      // Use saveProject instead of updateProject
      await projectDataManager.saveProject(updatedProject);

      console.log(`✅ Updated scene data with translation info for scene ${sceneId}`);
    } catch (error) {
      console.error(`❌ Error updating scene data for scene ${sceneId}:`, error);
    }
  }

  // Update analysis data in localStorage for compatibility
  private async updateAnalysisDataWithTranslation(sceneId: string, translationInfo: any): Promise<void> {
    try {
      console.log(`💾 Updating analysis data with translation info for scene ${sceneId}`);

      // Update currentAnalysisData in localStorage
      const storedAnalysisData = localStorage.getItem('currentAnalysisData');
      if (storedAnalysisData) {
        const analysisData = JSON.parse(storedAnalysisData);

        // Find and update the scene
        const sceneIndex = analysisData.scenes?.findIndex((scene: any) => scene.sceneId === sceneId);
        if (sceneIndex !== -1) {
          analysisData.scenes[sceneIndex] = {
            ...analysisData.scenes[sceneIndex],
            translatedVideoUrl: translationInfo.translatedVideoUrl,
            isTranslated: true,
            translationInfo: translationInfo
          };

          localStorage.setItem('currentAnalysisData', JSON.stringify(analysisData));
          console.log(`✅ Updated analysis data with translation info for scene ${sceneId}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error updating analysis data for scene ${sceneId}:`, error);
    }
  }

  // Initialize the service
  initialize(): void {
    console.log('🎬 TimelineIntegrationService initialized');
  }
}

// Export singleton instance
export const timelineIntegrationService = TimelineIntegrationService.getInstance();
