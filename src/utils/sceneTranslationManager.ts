/**
 * Scene Translation Manager
 * Handles translation-related operations for scene data
 */

import type { AnalyzedScene, NodeVideoSceneData } from '../types';

export interface TranslationUpdateData {
  translatedVideoUrl: string;
  targetLanguage: string;
  originalLanguage?: string;
  voice?: string;
  processingTime?: string;
  agentId?: string;
}

/**
 * Updates scene data with translation information
 */
export function updateSceneWithTranslation(
  scene: AnalyzedScene | NodeVideoSceneData,
  translationData: TranslationUpdateData
): AnalyzedScene | NodeVideoSceneData {
  const updatedScene = {
    ...scene,
    translatedVideoUrl: translationData.translatedVideoUrl,
    isTranslated: true,
    translationInfo: {
      targetLanguage: translationData.targetLanguage,
      originalLanguage: translationData.originalLanguage || 'en',
      voice: translationData.voice,
      translatedAt: Date.now(),
      agentId: translationData.agentId,
      processingTime: translationData.processingTime,
    }
  };

  console.log('🌐 Scene updated with translation data:', {
    sceneId: scene.sceneId,
    translatedVideoUrl: translationData.translatedVideoUrl,
    targetLanguage: translationData.targetLanguage,
    voice: translationData.voice
  });

  return updatedScene;
}

/**
 * Checks if a scene has been translated
 */
export function isSceneTranslated(scene: AnalyzedScene | NodeVideoSceneData): boolean {
  return !!(scene as any).isTranslated && !!(scene as any).translatedVideoUrl;
}

/**
 * Gets the effective video URL for a scene (translated > proxy > original)
 */
export function getEffectiveVideoUrl(
  scene: AnalyzedScene | NodeVideoSceneData,
  originalVideoUrl?: string
): string | null {
  const translatedUrl = (scene as any).translatedVideoUrl;
  const proxyUrl = (scene as any).proxy_video_url;
  
  if (translatedUrl) {
    return resolveVideoUrl(translatedUrl);
  }
  
  if (proxyUrl) {
    return resolveVideoUrl(proxyUrl);
  }
  
  if (originalVideoUrl) {
    return resolveVideoUrl(originalVideoUrl);
  }
  
  return null;
}

/**
 * Resolves a video URL to absolute format
 */
export function resolveVideoUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // If already absolute URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // If relative URL, convert to absolute
  if (url.startsWith('/')) {
    // For translated videos, use the backend server URL
    if (url.startsWith('/api/translated-video/')) {
      return `http://localhost:8080${url}`;
    }

    // For other API endpoints, use the backend server URL
    if (url.startsWith('/api/')) {
      return `http://localhost:8080${url}`;
    }

    // For other relative URLs, use the current origin
    const baseUrl = window.location.origin;
    return `${baseUrl}${url}`;
  }

  return url;
}

/**
 * Gets translation status information for display
 */
export function getTranslationStatus(scene: AnalyzedScene | NodeVideoSceneData): {
  isTranslated: boolean;
  targetLanguage?: string;
  voice?: string;
  translatedAt?: number;
} {
  const translationInfo = (scene as any).translationInfo;
  
  return {
    isTranslated: isSceneTranslated(scene),
    targetLanguage: translationInfo?.targetLanguage,
    voice: translationInfo?.voice,
    translatedAt: translationInfo?.translatedAt,
  };
}

/**
 * Clears translation data from a scene
 */
export function clearSceneTranslation(
  scene: AnalyzedScene | NodeVideoSceneData
): AnalyzedScene | NodeVideoSceneData {
  const updatedScene = { ...scene };
  
  // Remove translation-specific properties
  delete (updatedScene as any).translatedVideoUrl;
  delete (updatedScene as any).isTranslated;
  delete (updatedScene as any).translationInfo;
  
  console.log('🌐 Translation data cleared from scene:', scene.sceneId);
  
  return updatedScene;
}

/**
 * Validates translation data before applying to scene
 */
export function validateTranslationData(translationData: TranslationUpdateData): boolean {
  if (!translationData.translatedVideoUrl) {
    console.error('❌ Translation validation failed: missing translatedVideoUrl');
    return false;
  }
  
  if (!translationData.targetLanguage) {
    console.error('❌ Translation validation failed: missing targetLanguage');
    return false;
  }
  
  // Validate URL format
  const resolvedUrl = resolveVideoUrl(translationData.translatedVideoUrl);
  if (!resolvedUrl) {
    console.error('❌ Translation validation failed: invalid video URL format');
    return false;
  }
  
  return true;
}

/**
 * Creates a translation event for broadcasting
 */
export function createTranslationEvent(
  sceneId: string,
  translationData: TranslationUpdateData
): CustomEvent {
  const eventDetail = {
    sceneId,
    translatedVideoUrl: resolveVideoUrl(translationData.translatedVideoUrl),
    translationInfo: {
      targetLanguage: translationData.targetLanguage,
      originalLanguage: translationData.originalLanguage || 'en',
      voice: translationData.voice,
      translatedAt: Date.now(),
      agentId: translationData.agentId,
      processingTime: translationData.processingTime,
    }
  };
  
  return new CustomEvent('video-translation-completed', {
    detail: eventDetail
  });
}
