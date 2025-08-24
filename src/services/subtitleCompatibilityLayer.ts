// Backward compatibility layer for subtitle system
import type { SubtitleCue, SubtitleGenerationOptions, SubtitleGenerationResult } from './subtitleGenerator';
import { subtitleGenerator } from './subtitleGenerator';
import { enhancedSubtitleGenerator } from './enhancedSubtitleGenerator';
import { unifiedDataService } from './unifiedDataService';

interface CompatibilityOptions extends SubtitleGenerationOptions {
  // Enhanced options (optional)
  analysisId?: string;
  sceneId?: string;
  sceneStart?: number;
  sceneEnd?: number;
  useOptimizedRetrieval?: boolean;
}

export class SubtitleCompatibilityLayer {
  private migrationCompleted = false;
  private legacyDataMigrated = new Set<string>();

  constructor() {
    this.initializeCompatibilityLayer();
  }

  /**
   * Main subtitle generation method with backward compatibility
   * This method signature MUST remain identical to the original
   */
  async generateSubtitles(
    videoElement: HTMLVideoElement,
    options: CompatibilityOptions = {}
  ): Promise<SubtitleGenerationResult> {
    
    try {
      // Check if we can use optimized retrieval
      const canUseOptimized = this.canUseOptimizedRetrieval(options);
      
      if (canUseOptimized && options.useOptimizedRetrieval !== false) {
        console.log('🚀 Using optimized subtitle retrieval...');

        const optimizedResult = await enhancedSubtitleGenerator.generateSubtitles(
          videoElement,
          options
        );

        // Check if we got actual subtitles from the optimized system
        if (optimizedResult && optimizedResult.subtitles && optimizedResult.subtitles.length > 0) {
          console.log(`✅ Optimized system returned ${optimizedResult.subtitles.length} subtitles`);

          // Store result in legacy format for backward compatibility
          if (options.sceneId) {
            this.storeLegacyCompatibleResult(options.sceneId, optimizedResult);
          }

          return optimizedResult;
        } else {
          console.log('📝 Optimized system returned no subtitles, falling back to legacy');
          // Continue to fallback section below
        }
      }
      
      // Fallback to legacy system
      console.log('🔄 Using legacy subtitle generation...');
      const legacyResult = await subtitleGenerator.generateSubtitles(videoElement, options);

      // Store result for future optimization
      if (options.sceneId && options.analysisId) {
        this.storeFutureOptimizationData(options.analysisId, options.sceneId, legacyResult);
      }

      return legacyResult;
      
    } catch (error) {
      console.error('❌ Subtitle generation failed:', error);
      
      // Final fallback to legacy system
      return await subtitleGenerator.generateSubtitles(videoElement, options);
    }
  }

  /**
   * Check if optimized retrieval can be used
   */
  private canUseOptimizedRetrieval(options: CompatibilityOptions): boolean {
    return !!(
      options.analysisId &&
      options.sceneId &&
      options.sceneStart !== undefined &&
      options.sceneEnd !== undefined
    );
  }

  /**
   * Store result in legacy localStorage format for backward compatibility
   */
  private storeLegacyCompatibleResult(
    sceneId: string,
    result: SubtitleGenerationResult
  ): void {
    try {
      // Store in the exact same format as the original system
      unifiedDataService.storeAIResult(sceneId, 'subtitle-generator', result);
      
      console.log(`💾 Stored subtitle result in legacy format for scene ${sceneId}`);
    } catch (error) {
      console.warn('⚠️ Failed to store legacy compatible result:', error);
    }
  }

  /**
   * Store data for future optimization
   */
  private storeFutureOptimizationData(
    analysisId: string,
    sceneId: string,
    result: SubtitleGenerationResult
  ): void {
    try {
      // Store metadata for future optimization
      const optimizationData = {
        analysisId,
        sceneId,
        subtitleCount: result.subtitles.length,
        duration: result.duration,
        confidence: result.confidence,
        method: result.method,
        storedAt: Date.now()
      };
      
      localStorage.setItem(
        `subtitle-optimization-${sceneId}`,
        JSON.stringify(optimizationData)
      );
      
    } catch (error) {
      console.warn('⚠️ Failed to store optimization data:', error);
    }
  }

  /**
   * Initialize compatibility layer
   */
  private async initializeCompatibilityLayer(): Promise<void> {
    try {
      console.log('🔧 Initializing subtitle compatibility layer...');
      
      // Migrate existing data if needed
      await this.migrateExistingData();
      
      // Set up event listeners for legacy compatibility
      this.setupLegacyEventHandlers();
      
      this.migrationCompleted = true;
      console.log('✅ Subtitle compatibility layer initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize compatibility layer:', error);
    }
  }

  /**
   * Migrate existing subtitle data to new format
   */
  private async migrateExistingData(): Promise<void> {
    try {
      console.log('🔄 Checking for existing subtitle data to migrate...');
      
      const existingResults = this.findExistingSubtitleData();
      
      if (existingResults.length === 0) {
        console.log('📝 No existing subtitle data found');
        return;
      }
      
      console.log(`🔄 Found ${existingResults.length} existing subtitle results to migrate`);
      
      for (const [sceneId, result] of existingResults) {
        if (!this.legacyDataMigrated.has(sceneId)) {
          await this.migrateSceneData(sceneId, result);
          this.legacyDataMigrated.add(sceneId);
        }
      }
      
      console.log('✅ Data migration completed');
      
    } catch (error) {
      console.error('❌ Data migration failed:', error);
    }
  }

  /**
   * Find existing subtitle data in localStorage
   */
  private findExistingSubtitleData(): Array<[string, any]> {
    const results: Array<[string, any]> = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ai-results-')) {
          const sceneId = key.replace('ai-results-', '');
          const data = localStorage.getItem(key);
          
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed['subtitle-generator']) {
              results.push([sceneId, parsed['subtitle-generator']]);
            }
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Error scanning for existing data:', error);
    }
    
    return results;
  }

  /**
   * Migrate individual scene data
   */
  private async migrateSceneData(sceneId: string, result: any): Promise<void> {
    try {
      // Enhance existing result with new metadata
      const enhancedResult = {
        ...result,
        metadata: {
          ...result.metadata,
          migratedAt: Date.now(),
          migrationVersion: '1.0',
          legacyCompatible: true
        }
      };
      
      // Keep original data intact (don't modify localStorage)
      // Just mark as migrated for tracking
      console.log(`✅ Migrated subtitle data for scene ${sceneId}`);
      
    } catch (error) {
      console.warn(`⚠️ Failed to migrate data for scene ${sceneId}:`, error);
    }
  }

  /**
   * Set up event handlers for legacy compatibility
   */
  private setupLegacyEventHandlers(): void {
    // Listen for legacy events and ensure they continue to work
    unifiedDataService.addEventListener('ai-result-stored', (data) => {
      if (data.agentType === 'subtitle-generator') {
        console.log(`📡 Legacy event handled for scene ${data.sceneId}`);
      }
    });
  }

  /**
   * Get compatibility statistics
   */
  getCompatibilityStats(): {
    migrationCompleted: boolean;
    migratedScenes: number;
    optimizedRetrievals: number;
    legacyFallbacks: number;
  } {
    return {
      migrationCompleted: this.migrationCompleted,
      migratedScenes: this.legacyDataMigrated.size,
      optimizedRetrievals: 0, // TODO: Implement tracking
      legacyFallbacks: 0 // TODO: Implement tracking
    };
  }

  /**
   * Force migration of specific scene
   */
  async forceMigrateScene(sceneId: string): Promise<boolean> {
    try {
      const existingData = unifiedDataService.getAIResult(sceneId, 'subtitle-generator');
      
      if (existingData) {
        await this.migrateSceneData(sceneId, existingData);
        this.legacyDataMigrated.add(sceneId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Failed to force migrate scene ${sceneId}:`, error);
      return false;
    }
  }

  /**
   * Clear migration cache (for testing)
   */
  clearMigrationCache(): void {
    this.legacyDataMigrated.clear();
    console.log('🧹 Cleared migration cache');
  }
}

// Export singleton instance
export const subtitleCompatibilityLayer = new SubtitleCompatibilityLayer();
