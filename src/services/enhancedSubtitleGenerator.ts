// Enhanced subtitle generator with optimized retrieval and caching
import type { SubtitleCue, SubtitleGenerationOptions, SubtitleGenerationResult } from './subtitleGenerator';
import { subtitleGenerator } from './subtitleGenerator';
import { buildApiUrl } from '../config/environment';
import { unifiedDataService } from './unifiedDataService';

interface CachedSubtitleData {
  subtitles: SubtitleCue[];
  retrievedAt: number;
  source: 'database' | 'api' | 'cache';
  sceneId: string;
  analysisId: string;
}

interface OptimizedRetrievalOptions {
  sceneId?: string;
  analysisId?: string;
  sceneStart?: number;
  sceneEnd?: number;
  useCache?: boolean;
  fallbackToLegacy?: boolean;
}

export class EnhancedSubtitleGenerator {
  private memoryCache = new Map<string, CachedSubtitleData>();
  private maxCacheSize = 50; // Maximum number of cached scenes
  private cacheExpiryMs = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Enhanced subtitle generation with optimized retrieval
   */
  async generateSubtitles(
    videoElement: HTMLVideoElement,
    options: SubtitleGenerationOptions & OptimizedRetrievalOptions = {}
  ): Promise<SubtitleGenerationResult> {
    const startTime = Date.now();
    
    try {
      // Try optimized retrieval first
      if (options.analysisId && options.sceneStart !== undefined && options.sceneEnd !== undefined) {
        console.log('🚀 Attempting optimized subtitle retrieval...');
        
        const optimizedResult = await this.tryOptimizedRetrieval(
          options.analysisId,
          options.sceneStart,
          options.sceneEnd,
          options.sceneId
        );
        
        if (optimizedResult && optimizedResult.length > 0) {
          const retrievalTime = Date.now() - startTime;
          console.log(`⚡ Optimized retrieval completed in ${retrievalTime}ms with ${optimizedResult.length} subtitles`);

          return this.formatAsLegacyResult(optimizedResult, retrievalTime, 'optimized');
        } else {
          console.log('📝 No subtitles found in optimized system, will use fallback');
          // Return null to trigger fallback in compatibility layer
          return null;
        }
      }
      
      // Fallback to legacy system
      if (options.fallbackToLegacy !== false) {
        console.log('🔄 Falling back to legacy subtitle generation...');
        const legacyResult = await subtitleGenerator.generateSubtitles(videoElement, options);
        
        // Store result for future optimization
        if (options.analysisId && options.sceneId) {
          this.cacheSubtitleResult(options.analysisId, options.sceneId, legacyResult.subtitles, 'api');
        }
        
        return legacyResult;
      }
      
      throw new Error('No subtitle generation method available');
      
    } catch (error) {
      console.error('❌ Enhanced subtitle generation failed:', error);
      
      // Final fallback to legacy system if not already tried
      if (options.fallbackToLegacy !== false) {
        return await subtitleGenerator.generateSubtitles(videoElement, options);
      }
      
      throw error;
    }
  }

  /**
   * Try optimized retrieval from backend database
   */
  private async tryOptimizedRetrieval(
    analysisId: string,
    sceneStart: number,
    sceneEnd: number,
    sceneId?: string
  ): Promise<SubtitleCue[] | null> {
    
    // Check memory cache first
    if (sceneId) {
      const cached = this.getFromMemoryCache(sceneId);
      if (cached) {
        console.log(`💾 Retrieved from memory cache: ${sceneId}`);
        return cached.subtitles;
      }
    }
    
    try {
      // Query backend for scene subtitles
      const url = buildApiUrl('/api/transcript/' + analysisId + '/scene');
      const params = new URLSearchParams({
        scene_start: sceneStart.toString(),
        scene_end: sceneEnd.toString(),
      });
      
      if (sceneId) {
        params.append('scene_id', sceneId);
      }
      
      console.log(`🔍 Querying backend: ${url}?${params.toString()}`);
      
      const response = await fetch(`${url}?${params.toString()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('📝 No transcript found in database, will use legacy method');
          return null;
        }
        throw new Error(`Backend query failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      const subtitles = data.subtitles || [];
      
      console.log(`✅ Retrieved ${subtitles.length} subtitles from backend`);
      
      // Cache the result
      if (sceneId) {
        this.cacheSubtitleResult(analysisId, sceneId, subtitles, 'database');
      }
      
      return subtitles;
      
    } catch (error) {
      console.warn('⚠️ Backend retrieval failed:', error);
      return null;
    }
  }

  /**
   * Cache subtitle result in memory
   */
  private cacheSubtitleResult(
    analysisId: string,
    sceneId: string,
    subtitles: SubtitleCue[],
    source: 'database' | 'api' | 'cache'
  ): void {
    
    // Implement LRU cache behavior
    if (this.memoryCache.size >= this.maxCacheSize) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }
    
    const cacheData: CachedSubtitleData = {
      subtitles,
      retrievedAt: Date.now(),
      source,
      sceneId,
      analysisId
    };
    
    this.memoryCache.set(sceneId, cacheData);
    console.log(`💾 Cached ${subtitles.length} subtitles for scene ${sceneId} (source: ${source})`);
  }

  /**
   * Get subtitles from memory cache
   */
  private getFromMemoryCache(sceneId: string): CachedSubtitleData | null {
    const cached = this.memoryCache.get(sceneId);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    const isExpired = Date.now() - cached.retrievedAt > this.cacheExpiryMs;
    if (isExpired) {
      this.memoryCache.delete(sceneId);
      return null;
    }
    
    return cached;
  }

  /**
   * Format optimized result as legacy SubtitleGenerationResult
   */
  private formatAsLegacyResult(
    subtitles: SubtitleCue[],
    retrievalTime: number,
    source: string
  ): SubtitleGenerationResult {
    
    return {
      subtitles,
      language: 'en-US',
      confidence: 0.9, // High confidence for database results
      method: 'assemblyai' as const,
      duration: subtitles.length > 0 ? 
        subtitles[subtitles.length - 1].endTime - subtitles[0].startTime : 0,
      metadata: {
        retrievalTime,
        source,
        optimized: true
      }
    };
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, data] of this.memoryCache.entries()) {
      if (now - data.retrievedAt > this.cacheExpiryMs) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.memoryCache.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`🧹 Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Preload subtitles for a scene (background loading)
   */
  async preloadSceneSubtitles(
    analysisId: string,
    sceneId: string,
    sceneStart: number,
    sceneEnd: number
  ): Promise<void> {
    
    // Check if already cached
    if (this.getFromMemoryCache(sceneId)) {
      return;
    }
    
    try {
      console.log(`🔄 Preloading subtitles for scene ${sceneId}...`);
      
      const subtitles = await this.tryOptimizedRetrieval(
        analysisId,
        sceneStart,
        sceneEnd,
        sceneId
      );
      
      if (subtitles) {
        console.log(`✅ Preloaded ${subtitles.length} subtitles for scene ${sceneId}`);
      }
      
    } catch (error) {
      console.warn(`⚠️ Failed to preload subtitles for scene ${sceneId}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{sceneId: string; source: string; age: number}>;
  } {
    
    const now = Date.now();
    const entries = Array.from(this.memoryCache.entries()).map(([sceneId, data]) => ({
      sceneId,
      source: data.source,
      age: now - data.retrievedAt
    }));
    
    return {
      size: this.memoryCache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // TODO: Implement hit rate tracking
      entries
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.memoryCache.clear();
    console.log('🧹 Cleared all cached subtitle data');
  }
}

// Export singleton instance
export const enhancedSubtitleGenerator = new EnhancedSubtitleGenerator();
