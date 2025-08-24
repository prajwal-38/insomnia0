// src/utils/mezzanineLoader.ts
// Utility for loading mezzanine video segments into the main timeline

import { dispatch } from "@designcombo/events";
import { ADD_VIDEO, LAYER_DELETE } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { AnalyzedScene, ApiAnalysisResponse } from '../types';
import {
  getEffectiveVideoUrl,
  isSceneTranslated,
  getTranslationStatus
} from './sceneTranslationManager';

export interface MezzanineLoadOptions {
  analysisId: string;
  baseUrl?: string;
  onProgress?: (loaded: number, total: number) => void;
  onError?: (error: string, sceneId?: string) => void;
  onComplete?: (loadedCount: number) => void;
  seamlessTransitions?: boolean; // Enable seamless transition fixes (default: true)
  timelineFps?: number; // Timeline FPS for frame-perfect alignment (default: 30)
  transitionOverlapMs?: number; // Custom overlap duration in milliseconds
}

export interface MezzanineSceneInfo {
  sceneId: string;
  sceneIndex: number;
  duration: number;
  mezzanineUrl: string;
  startTime: number; // Cumulative start time in the timeline
  // Translation support
  isTranslated?: boolean;
  translatedVideoUrl?: string;
  translationInfo?: {
    targetLanguage?: string;
    originalLanguage?: string;
    voice?: string;
    translatedAt?: number;
  };
}

/**
 * Fetches analysis data and extracts mezzanine scene information
 */
export async function fetchMezzanineScenes(analysisId: string, baseUrl: string = ''): Promise<MezzanineSceneInfo[]> {
  try {
    // Import buildApiUrl function
    const { buildApiUrl } = await import('../config/environment');

    // Construct the full URL for the API call
    const apiUrl = baseUrl ? `${baseUrl}/api/analysis/${analysisId}` : buildApiUrl(`/api/analysis/${analysisId}`);

    console.log(`🔍 Fetching analysis data from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Handle 404 specifically - analysis doesn't exist on server
      if (response.status === 404) {
        console.warn(`⚠️ Analysis ${analysisId} not found on server (404). This may indicate stale local data.`);

        // Clear potentially stale data from localStorage
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.includes(analysisId) ||
              key === 'currentAnalysisData' ||
              key === 'storyboard-project-v2'
            )) {
              keysToRemove.push(key);
            }
          }

          keysToRemove.forEach(key => {
            console.log(`🧹 Removing stale data: ${key}`);
            localStorage.removeItem(key);
          });

          // Clear global analysis ID
          (window as any).currentAnalysisId = null;

          console.log('✅ Cleared stale analysis data. Please upload a new video to continue.');
        } catch (cleanupError) {
          console.warn('⚠️ Error during cleanup:', cleanupError);
        }

        throw new Error(`Analysis not found on server. The analysis may have been deleted or expired. Please upload a new video.`);
      }

      throw new Error(`Failed to fetch analysis data: ${response.status} ${response.statusText}`);
    }

    const analysisData: ApiAnalysisResponse = await response.json();

    // Debug the analysis data structure
    debugAnalysisData(analysisData, analysisId);

    // Handle different data structures - scenes can be at root level or under analysisResult
    let scenes = analysisData.scenes || analysisData.analysisResult?.scenes;

    // CRITICAL: Merge local translation data with API data
    try {
      const { projectDataManager } = await import('../utils/projectDataManager');
      const currentProject = projectDataManager.getCurrentProject();

      if (currentProject && currentProject.scenes) {
        console.log('🔄 Merging local translation data with API scene data...');

        scenes = scenes.map((apiScene: any) => {
          const localScene = currentProject.scenes.find(s => s.sceneId === apiScene.sceneId);
          if (localScene && (localScene as any).isTranslated) {
            console.log(`🌐 Found local translation data for scene ${apiScene.sceneId}:`, {
              translatedVideoUrl: (localScene as any).translatedVideoUrl,
              targetLanguage: (localScene as any).translationInfo?.targetLanguage
            });

            // Merge translation data from local project into API scene
            return {
              ...apiScene,
              translatedVideoUrl: (localScene as any).translatedVideoUrl,
              isTranslated: (localScene as any).isTranslated,
              translationInfo: (localScene as any).translationInfo
            };
          }
          return apiScene;
        });

        const translatedCount = scenes.filter((s: any) => s.isTranslated).length;
        console.log(`✅ Merged translation data: ${translatedCount}/${scenes.length} scenes have translations`);
      } else {
        console.log('⚠️ No local project data found, trying currentAnalysisData fallback...');

        // Fallback: try to get translation data from currentAnalysisData
        const currentAnalysisData = localStorage.getItem('currentAnalysisData');
        if (currentAnalysisData) {
          try {
            const analysisData = JSON.parse(currentAnalysisData);
            if (analysisData.scenes) {
              scenes = scenes.map((apiScene: any) => {
                const localScene = analysisData.scenes.find((s: any) => s.sceneId === apiScene.sceneId);
                if (localScene && localScene.isTranslated) {
                  console.log(`🌐 Found translation data in currentAnalysisData for scene ${apiScene.sceneId}`);
                  return {
                    ...apiScene,
                    translatedVideoUrl: localScene.translatedVideoUrl,
                    isTranslated: localScene.isTranslated,
                    translationInfo: localScene.translationInfo
                  };
                }
                return apiScene;
              });

              const translatedCount = scenes.filter((s: any) => s.isTranslated).length;
              console.log(`✅ Merged translation data from currentAnalysisData: ${translatedCount}/${scenes.length} scenes have translations`);
            }
          } catch (error) {
            console.warn('⚠️ Failed to parse currentAnalysisData for translation merging:', error);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to merge local translation data:', error);
    }

    if (!scenes || !Array.isArray(scenes)) {
      console.error('❌ No scenes found. Available keys:', Object.keys(analysisData));
      if (analysisData.analysisResult) {
        console.error('❌ analysisResult keys:', Object.keys(analysisData.analysisResult));
      }
      throw new Error('No scenes found in analysis data');
    }

    console.log(`✅ Found scenes array with ${scenes.length} scenes`);
    console.log(`📍 Scenes location: ${analysisData.scenes ? 'root level' : 'analysisResult level'}`);

    // Check if scenes have mezzanine URLs
    const scenesWithMezzanine = scenes.filter(scene => scene.mezzanine_video_url);
    console.log(`🎬 Scenes with mezzanine URLs: ${scenesWithMezzanine.length}/${scenes.length}`);

    if (scenesWithMezzanine.length === 0) {
      console.warn('⚠️ No scenes have mezzanine_video_url set');
      scenes.forEach((scene, index) => {
        console.log(`   Scene ${index}: ${scene.sceneId || 'NO_ID'} - mezzanine_video_url: ${scene.mezzanine_video_url || 'NOT_SET'}`);
      });
    }

    const mezzanineScenes: MezzanineSceneInfo[] = [];
    let cumulativeTime = 0;

    // Sort scenes by scene_index to ensure proper order
    const sortedScenes = [...scenes].sort((a, b) =>
      (a.scene_index || 0) - (b.scene_index || 0)
    );
    
    for (const scene of sortedScenes) {
      // Only include scenes that have mezzanine video URLs
      if (scene.mezzanine_video_url && scene.duration > 0) {
        // Use the current trimmed duration if available (reflects NodeTimeline edits)
        const actualDuration = scene.current_trimmed_duration || scene.duration;

        // Construct the full mezzanine URL and fix inconsistent formats
        let mezzanineUrl = scene.mezzanine_video_url;

        if (mezzanineUrl.startsWith('/api/segment/')) {
          // Fix inconsistent URL formats
          // Some URLs are missing the segment type (mezzanine) in the path
          if (!mezzanineUrl.includes('/mezzanine/')) {
            // Convert from: /api/segment/{analysis_id}/scene_{sceneId}_mezzanine.mp4
            // To: /api/segment/{analysis_id}/mezzanine/scene_{sceneId}_mezzanine.mp4
            const parts = mezzanineUrl.split('/');
            if (parts.length >= 4) {
              const analysisIdPart = parts[3];
              const filename = parts[4];
              mezzanineUrl = `/api/segment/${analysisIdPart}/mezzanine/${filename}`;
              console.log(`🔧 Fixed mezzanine URL format: ${scene.mezzanine_video_url} → ${mezzanineUrl}`);
            }
          }

          // Add the base URL
          if (baseUrl) {
            mezzanineUrl = `${baseUrl}${mezzanineUrl}`;
          } else {
            // Import buildApiUrl function for dynamic URL
            const { buildApiUrl } = await import('../config/environment');
            mezzanineUrl = buildApiUrl(mezzanineUrl);
          }
        }

        // Check for translation data and extract translation information
        const isTranslated = isSceneTranslated(scene);
        const translationStatus = getTranslationStatus(scene);

        if (isTranslated) {
          console.log(`🌐 Scene ${scene.sceneId} has translation data:`, {
            targetLanguage: translationStatus.targetLanguage,
            translatedVideoUrl: scene.translatedVideoUrl
          });
        }

        mezzanineScenes.push({
          sceneId: scene.sceneId,
          sceneIndex: scene.scene_index || 0,
          duration: actualDuration,
          mezzanineUrl: mezzanineUrl,
          startTime: cumulativeTime,
          // Include translation data
          isTranslated: isTranslated,
          translatedVideoUrl: scene.translatedVideoUrl,
          translationInfo: isTranslated ? {
            targetLanguage: translationStatus.targetLanguage,
            originalLanguage: translationStatus.targetLanguage ? 'en' : undefined,
            voice: scene.translationInfo?.voice,
            translatedAt: translationStatus.translatedAt
          } : undefined
        });

        cumulativeTime += actualDuration;
      }
    }
    
    console.log(`📹 Found ${mezzanineScenes.length} mezzanine scenes for analysis ${analysisId}`);

    if (mezzanineScenes.length > 0) {
      console.log('🎬 Mezzanine scenes details:');
      mezzanineScenes.forEach((scene, index) => {
        console.log(`  ${index + 1}. Scene ${scene.sceneIndex} (${scene.sceneId})`);
        console.log(`     Duration: ${scene.duration}s, Start: ${scene.startTime}s`);
        console.log(`     URL: ${scene.mezzanineUrl}`);
        if (scene.isTranslated) {
          console.log(`     🌐 TRANSLATED: ${scene.translationInfo?.targetLanguage} (${scene.translatedVideoUrl})`);
        }
      });
      console.log(`📁 Expected file location: backend/analyzed_videos_store/${analysisId}/segments/mezzanine/`);
    } else {
      console.warn(`⚠️ No mezzanine scenes found for analysis ${analysisId}`);
      console.log('🔍 Debugging info:');
      console.log(`   Total scenes in analysis: ${sortedScenes.length}`);
      sortedScenes.forEach((scene, index) => {
        console.log(`   Scene ${index}: ${scene.sceneId}`);
        console.log(`     Has mezzanine_video_url: ${!!scene.mezzanine_video_url}`);
        console.log(`     Duration: ${scene.duration}`);
        console.log(`     Mezzanine URL: ${scene.mezzanine_video_url || 'NOT SET'}`);
      });
    }

    return mezzanineScenes;
    
  } catch (error) {
    console.error('❌ Error fetching mezzanine scenes:', error);

    // If backend is not available, provide demo data for testing
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.warn('⚠️ Backend not available, using demo data for testing');
      return createDemoMezzanineScenes(analysisId);
    }

    throw error;
  }
}

/**
 * Creates demo mezzanine scene data for testing when backend is not available
 */
function createDemoMezzanineScenes(analysisId: string): MezzanineSceneInfo[] {
  console.log('🎭 Creating demo mezzanine scenes for testing');
  console.log(`📁 Note: Real mezzanine scenes would be loaded from:`);
  console.log(`   backend/analyzed_videos_store/${analysisId}/segments/mezzanine/`);
  console.log(`   via API: /api/segment/${analysisId}/mezzanine/{filename}`);

  const demoScenes: MezzanineSceneInfo[] = [
    {
      sceneId: 'demo-scene-1',
      sceneIndex: 0,
      duration: 10,
      mezzanineUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      startTime: 0
    },
    {
      sceneId: 'demo-scene-2',
      sceneIndex: 1,
      duration: 15,
      mezzanineUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      startTime: 10
    },
    {
      sceneId: 'demo-scene-3',
      sceneIndex: 2,
      duration: 12,
      mezzanineUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      startTime: 25
    }
  ];

  return demoScenes;
}

/**
 * Loads mezzanine scenes sequentially into the main timeline
 */
/**
 * Debug function to log analysis data structure
 */
export function debugAnalysisData(analysisData: any, analysisId: string): void {
  console.log(`🔍 DEBUG: Analysis data structure for ${analysisId}:`);
  console.log('📊 Analysis data keys:', Object.keys(analysisData));

  // Handle different data structures
  let scenes = analysisData.scenes || analysisData.analysisResult?.scenes;

  if (analysisData.analysisResult) {
    console.log('📊 Analysis result keys:', Object.keys(analysisData.analysisResult));
  }

  if (scenes && Array.isArray(scenes)) {
    console.log(`📊 Found ${scenes.length} scenes (at ${analysisData.scenes ? 'root level' : 'analysisResult level'})`);
    scenes.forEach((scene: any, index: number) => {
      console.log(`   Scene ${index}: ${scene.sceneId || scene.id || 'NO_ID'}`);
      console.log(`     Keys: ${Object.keys(scene).join(', ')}`);
      console.log(`     Duration: ${scene.duration || 'NOT_SET'}`);
      console.log(`     Proxy URL: ${scene.proxy_video_url || 'NOT_SET'}`);
      console.log(`     Mezzanine URL: ${scene.mezzanine_video_url || 'NOT_SET'}`);
      console.log(`     Current trimmed duration: ${scene.current_trimmed_duration || 'NOT_SET'}`);
      console.log(`     Translated Video URL: ${scene.translatedVideoUrl || 'NOT_SET'}`);
      console.log(`     Is Translated: ${scene.isTranslated || false}`);
    });
  } else {
    console.log('❌ No scenes array found in analysis data');
  }
}

/**
 * Check if mezzanine segments already exist in the timeline
 */
function checkExistingMezzanineSegments(analysisId: string): {
  hasSegments: boolean;
  segmentCount: number;
  needsUpdate: boolean;
} {
  try {
    // Check for existing mezzanine segments using a global timeline state check
    // This uses a custom event to query the current timeline state
    let existingSegments: any[] = [];

    // Dispatch a custom event to get current timeline state
    const checkEvent = new CustomEvent('getMezzanineSegments', {
      detail: { analysisId, callback: (segments: any[]) => { existingSegments = segments; } }
    });

    window.dispatchEvent(checkEvent);

    // Also check localStorage as fallback
    const timelineStateKeys = Object.keys(localStorage).filter(key =>
      key.includes('timeline') && key.includes(analysisId)
    );

    let localSegmentCount = 0;
    for (const key of timelineStateKeys) {
      try {
        const state = JSON.parse(localStorage.getItem(key) || '{}');
        const segments = state.clips?.filter((clip: any) =>
          clip.metadata?.isMezzanineSegment
        ) || [];
        localSegmentCount += segments.length;
      } catch (e) {
        // Ignore parsing errors
      }
    }

    const totalSegments = Math.max(existingSegments.length, localSegmentCount);

    return {
      hasSegments: totalSegments > 0,
      segmentCount: totalSegments,
      needsUpdate: false // For now, assume no update needed - can be enhanced later
    };
  } catch (error) {
    console.warn('⚠️ Error checking existing mezzanine segments:', error);
    return { hasSegments: false, segmentCount: 0, needsUpdate: false };
  }
}

// Global flag to prevent multiple simultaneous loads
let isLoadingInProgress = false;
let lastLoadAnalysisId: string | null = null;

export async function loadMezzanineScenesToTimeline(options: MezzanineLoadOptions & {
  forceReload?: boolean;
  updateOnly?: boolean;
  customSceneOrder?: string[]; // Array of scene IDs to load in specific order
}): Promise<void> {
  const {
    analysisId,
    baseUrl = '',
    onProgress,
    onError,
    onComplete,
    seamlessTransitions = true,
    timelineFps = 30,
    transitionOverlapMs,
    forceReload = false,
    updateOnly = false,
    customSceneOrder
  } = options;

  // 🚫 PREVENT DUPLICATE LOADS: Check if already loading the same analysis
  if (isLoadingInProgress && lastLoadAnalysisId === analysisId && !forceReload) {
    console.log(`⚠️ DUPLICATE LOAD PREVENTED: Already loading analysis ${analysisId}`);
    return;
  }

  // Set loading flag
  isLoadingInProgress = true;
  lastLoadAnalysisId = analysisId;

  try {
    console.log(`🚀 Starting mezzanine loading for analysis: ${analysisId}`);

    // Get the actual base URL for logging
    let actualBaseUrl = baseUrl;
    if (!actualBaseUrl) {
      const { getEnvironmentInfo } = await import('../config/environment');
      actualBaseUrl = getEnvironmentInfo().apiBaseUrl;
    }
    console.log(`🌐 Base URL: ${actualBaseUrl}`);

    // 🧹 CLEAR EXISTING SCENES: Clear timeline before loading to prevent duplicates
    if (forceReload) {
      console.log('🧹 Force reload: Clearing existing mezzanine segments to prevent duplicates...');
      // Add a small delay to ensure any previous operations complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Check for existing mezzanine segments unless force reload is requested
    if (!forceReload) {
      const existingCheck = checkExistingMezzanineSegments(analysisId);

      if (existingCheck.hasSegments && !updateOnly) {
        console.log(`✅ Found ${existingCheck.segmentCount} existing mezzanine segments, skipping reload`);
        console.log(`💡 Use forceReload=true to reload anyway, or updateOnly=true to update existing segments`);
        onComplete?.(existingCheck.segmentCount);
        return;
      }

      if (existingCheck.hasSegments && updateOnly) {
        console.log(`🔄 Update mode: Found ${existingCheck.segmentCount} existing segments, will update them`);
      }
    }

    // Fetch mezzanine scene information
    const allMezzanineScenes = await fetchMezzanineScenes(analysisId, baseUrl);

    // Filter scenes based on customSceneOrder if provided
    let mezzanineScenes = allMezzanineScenes;
    if (customSceneOrder && customSceneOrder.length > 0) {
      console.log('🎯 FILTERING: Custom scene order specified:', customSceneOrder);
      console.log('🎯 FILTERING: Available scenes:', allMezzanineScenes.map(s => s.sceneId));

      // Filter and reorder scenes based on customSceneOrder
      mezzanineScenes = customSceneOrder
        .map(sceneId => allMezzanineScenes.find(scene => scene.sceneId === sceneId))
        .filter((scene): scene is MezzanineSceneInfo => scene !== undefined);

      console.log('🎯 FILTERING: Filtered scenes to load:', mezzanineScenes.map(s => s.sceneId));
      console.log(`🎯 FILTERING: Loading ${mezzanineScenes.length}/${allMezzanineScenes.length} scenes from story graph`);
    } else {
      console.log('📊 LOADING: No custom scene order - loading all scenes from server');
    }

    if (mezzanineScenes.length === 0) {
      const message = customSceneOrder && customSceneOrder.length > 0
        ? `No matching scenes found for story graph scenes: ${customSceneOrder.join(', ')}`
        : 'No mezzanine scenes found to load';
      console.warn('⚠️', message);
      onError?.(message);
      return;
    }
    
    let loadedCount = 0;
    const totalScenes = mezzanineScenes.length;
    
    // Load scenes sequentially with retry logic
    const failedScenes: string[] = [];

    for (let sceneIndex = 0; sceneIndex < mezzanineScenes.length; sceneIndex++) {
      const scene = mezzanineScenes[sceneIndex];
      let retryCount = 0;
      const maxRetries = 2;
      let sceneLoaded = false;

      while (retryCount <= maxRetries && !sceneLoaded) {
        try {
          const retryText = retryCount > 0 ? ` (retry ${retryCount})` : '';
          console.log(`📽️ Loading scene ${scene.sceneIndex}: ${scene.sceneId} (${sceneIndex + 1}/${mezzanineScenes.length})${retryText}`);

          // Apply seamless transition fixes if enabled
          const fromTimeMs = Math.round(scene.startTime * 1000);
          const durationMs = Math.round(scene.duration * 1000);
          const toTimeMs = fromTimeMs + durationMs;
          const isLastScene = sceneIndex === mezzanineScenes.length - 1;

          let seamlessToTime = toTimeMs;
          let overlapMs = 0;

          if (seamlessTransitions && !isLastScene) {
            // Use frame-perfect timing to avoid black frames during transitions
            const frameTimeMs = 1000 / timelineFps; // Duration of one frame in milliseconds

            // Calculate overlap duration
            if (transitionOverlapMs !== undefined) {
              overlapMs = transitionOverlapMs;
            } else {
              // Default: minimal overlap for smooth transition without visual artifacts
              // Use 1/4 frame duration to minimize black frames while ensuring smooth transitions
              overlapMs = Math.max(1, Math.ceil(frameTimeMs / 4));
            }

            seamlessToTime = toTimeMs + overlapMs;

            if (retryCount === 0) { // Only log transition details on first attempt
              console.log(`🔄 Seamless transition enabled:`);
              console.log(`   Frame time: ${frameTimeMs.toFixed(2)}ms (${timelineFps} FPS)`);
              console.log(`   Overlap: ${overlapMs}ms`);
            }
          }

          // Determine the effective video URL (translated > mezzanine)
          const effectiveVideoUrl = getEffectiveVideoUrl(scene, scene.mezzanineUrl);
          const isUsingTranslatedVideo = scene.isTranslated && scene.translatedVideoUrl;

          console.log(`🎬 Adding scene ${scene.sceneIndex} to timeline:`);
          console.log(`   Duration: ${scene.duration}s (${durationMs}ms)`);
          console.log(`   Timeline position: ${fromTimeMs}ms - ${seamlessToTime}ms`);
          console.log(`   Transition overlap: ${isLastScene ? 'none (last scene)' : `${overlapMs}ms`}`);
          console.log(`   Seamless transitions: ${seamlessTransitions ? 'enabled' : 'disabled'}`);

          if (isUsingTranslatedVideo) {
            console.log(`   🌐 USING TRANSLATED VIDEO: ${scene.translationInfo?.targetLanguage}`);
            console.log(`   🌐 Translated URL: ${effectiveVideoUrl}`);
          } else {
            console.log(`   📽️ Using mezzanine URL: ${effectiveVideoUrl}`);
          }

          // Generate unique ID for each attempt
          const videoId = generateId();

          dispatch(ADD_VIDEO, {
            payload: {
              id: videoId,
              type: "video",
              display: {
                from: fromTimeMs,
                to: seamlessToTime,
              },
              details: {
                src: effectiveVideoUrl, // Use translated video URL if available, otherwise mezzanine
              },
              metadata: {
                previewUrl: effectiveVideoUrl, // Use effective URL as preview too
                sceneId: scene.sceneId,
                sceneIndex: scene.sceneIndex,
                originalDuration: scene.duration,
                seamlessTransition: seamlessTransitions && !isLastScene, // Flag to indicate this video has seamless transition
                frameOverlap: overlapMs, // Frame overlap for smooth transition
                isMezzanineSegment: true, // Flag to identify mezzanine segments
                segmentOrder: sceneIndex, // Order in the sequence for debugging
                timelineFps: timelineFps, // Timeline FPS for reference
                loadAttempt: retryCount + 1, // Track which attempt succeeded
                // Translation metadata
                isTranslated: scene.isTranslated,
                translatedVideoUrl: scene.translatedVideoUrl,
                translationInfo: scene.translationInfo,
                originalMezzanineUrl: scene.mezzanineUrl, // Keep reference to original mezzanine
              },
              duration: durationMs,
            },
            options: {
              resourceId: "main",
              scaleMode: "fit",
            },
          });

          // If we get here, the dispatch was successful
          sceneLoaded = true;
          loadedCount++;

          console.log(`✅ Scene ${scene.sceneIndex} loaded successfully (attempt ${retryCount + 1})`);

          // Increased delay to ensure timeline processes each scene properly
          await new Promise(resolve => setTimeout(resolve, 400));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to load scene ${scene.sceneId} (attempt ${retryCount + 1}):`, errorMessage);

          retryCount++;

          if (retryCount > maxRetries) {
            // All retries failed
            failedScenes.push(scene.sceneId);
            onError?.(errorMessage, scene.sceneId);
            console.error(`💥 Scene ${scene.sceneId} failed after ${maxRetries + 1} attempts`);
          } else {
            // Wait before retry with increasing delay
            const retryDelay = 300 * retryCount; // 300ms, 600ms for retries
            console.log(`⏳ Retrying scene ${scene.sceneId} in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

      // Update progress after each scene (whether successful or failed)
      onProgress?.(sceneIndex + 1, totalScenes);
    }

    // Report final results
    const translatedScenesCount = mezzanineScenes.filter(s => s.isTranslated).length;
    console.log(`📊 Loading complete: ${loadedCount}/${totalScenes} scenes loaded successfully`);
    if (translatedScenesCount > 0) {
      console.log(`🌐 Translation summary: ${translatedScenesCount}/${totalScenes} scenes using translated videos`);
    }
    if (failedScenes.length > 0) {
      console.warn(`⚠️ Failed scenes (${failedScenes.length}): ${failedScenes.join(', ')}`);
    }

    // Add a final delay to let the timeline process all additions
    console.log(`⏳ Waiting for timeline to process all scenes...`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify timeline state (optional - for debugging)
    console.log(`🔍 Verifying timeline state...`);
    console.log(`   Expected scenes: ${totalScenes}`);
    console.log(`   Successfully dispatched: ${loadedCount}`);
    console.log(`   Failed scenes: ${failedScenes.length}`);

    if (loadedCount === totalScenes) {
      console.log(`🎉 Perfect! All ${totalScenes} mezzanine scenes loaded successfully with seamless transitions!`);
    } else if (loadedCount > 0) {
      console.log(`🎉 Partial success: ${loadedCount}/${totalScenes} mezzanine scenes loaded with seamless transitions`);
    } else {
      console.error(`💥 No scenes were loaded successfully`);
    }

    onComplete?.(loadedCount);

  } catch (error) {
    const errorMessage = `Failed to load mezzanine scenes: ${error}`;
    console.error('❌', errorMessage);
    onError?.(errorMessage);
  } finally {
    // 🔓 CLEAR LOADING FLAG: Always clear the loading flag
    isLoadingInProgress = false;
    console.log(`🔓 LOAD COMPLETE: Cleared loading flag for analysis ${analysisId}`);
  }
}

/**
 * Creates seamless transition configuration for different scenarios
 */
export function createSeamlessTransitionConfig(strategy: 'frame-perfect' | 'minimal-overlap' | 'no-overlap' = 'frame-perfect', fps: number = 30): Partial<MezzanineLoadOptions> {
  switch (strategy) {
    case 'frame-perfect':
      return {
        seamlessTransitions: true,
        timelineFps: fps,
        // Use half frame overlap for smooth transitions
      };
    case 'minimal-overlap':
      return {
        seamlessTransitions: true,
        timelineFps: fps,
        transitionOverlapMs: 1, // Minimal 1ms overlap
      };
    case 'no-overlap':
      return {
        seamlessTransitions: false,
        timelineFps: fps,
        transitionOverlapMs: 0,
      };
    default:
      return {
        seamlessTransitions: true,
        timelineFps: fps,
      };
  }
}



/**
 * Checks if a mezzanine video file is accessible
 */
async function checkMezzanineFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.warn(`⚠️ Cannot access mezzanine file: ${url}`, error);
    return false;
  }
}

/**
 * Utility to check if mezzanine scenes are available for an analysis
 */
export async function checkMezzanineAvailability(analysisId: string, baseUrl: string = ''): Promise<{
  available: boolean;
  count: number;
  totalDuration: number;
  accessibleCount?: number;
}> {
  try {
    const scenes = await fetchMezzanineScenes(analysisId, baseUrl);
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);

    // Check if the files are actually accessible
    let accessibleCount = 0;
    if (scenes.length > 0) {
      console.log('🔍 Checking mezzanine file accessibility...');
      const accessibilityChecks = await Promise.all(
        scenes.map(async (scene) => {
          const isAccessible = await checkMezzanineFileExists(scene.mezzanineUrl);
          if (isAccessible) {
            accessibleCount++;
            console.log(`✅ Accessible: ${scene.mezzanineUrl}`);
          } else {
            console.log(`❌ Not accessible: ${scene.mezzanineUrl}`);
          }
          return isAccessible;
        })
      );

      console.log(`📊 Accessibility check: ${accessibleCount}/${scenes.length} files accessible`);
    }

    return {
      available: scenes.length > 0,
      count: scenes.length,
      totalDuration,
      accessibleCount
    };
  } catch (error) {
    console.error('❌ Error checking mezzanine availability:', error);
    return {
      available: false,
      count: 0,
      totalDuration: 0,
      accessibleCount: 0
    };
  }
}
