// src/services/storageIntegrationLayer.ts
// Integration layer that bridges new storage system with existing components

import type { 
  OptimizedSceneData, 
  EnhancedSceneData, 
  OptimizedProjectData,
  AIProcessingResult,
  StorageLocation,
  StorageStrategy,
  ProcessingStrategy
} from '../types';
import { storageOrchestrator } from './storageOrchestrator';
import { cloudStorageManager } from './cloudStorageManager';
import { hybridProcessingEngine } from './hybridProcessingEngine';
import { projectDataManager } from '../utils/projectDataManager';

// Migration and compatibility utilities
export class StorageIntegrationLayer {
  private migrationInProgress = false;
  private compatibilityMode = true;

  // Initialize the integration layer
  async initialize(): Promise<void> {
    console.log('🔗 Initializing Storage Integration Layer...');
    
    // Initialize core storage systems
    await storageOrchestrator.initialize();
    
    // Initialize cloud storage if configured
    if (cloudStorageManager) {
      await cloudStorageManager.initialize();
    }
    
    // Check if migration is needed
    await this.checkMigrationNeeds();
    
    console.log('✅ Storage Integration Layer initialized');
  }

  // Check if data migration is needed
  private async checkMigrationNeeds(): Promise<void> {
    const hasLegacyData = this.hasLegacyStorageData();
    const hasOptimizedData = await this.hasOptimizedStorageData();
    
    if (hasLegacyData && !hasOptimizedData) {
      console.log('📦 Legacy data detected, migration recommended');
      // Don't auto-migrate, let user decide
    }
  }

  // Check for legacy storage data
  private hasLegacyStorageData(): boolean {
    const legacyKeys = [
      'storyboard-project-nodes',
      'storyboard-project-edges',
      'storyboard-current-analysis'
    ];
    
    return legacyKeys.some(key => localStorage.getItem(key) !== null);
  }

  // Check for optimized storage data
  private async hasOptimizedStorageData(): Promise<boolean> {
    return localStorage.getItem('storyboard-project-v2') !== null;
  }

  // Convert OptimizedSceneData to EnhancedSceneData
  async enhanceSceneData(sceneData: OptimizedSceneData): Promise<EnhancedSceneData> {
    // Create storage location for original video
    const originalVideoLocation: StorageLocation = {
      type: 'url',
      key: sceneData.sceneId,
      url: sceneData.originalVideoFileName, // This might be a URL or file path
      size: 0, // Would need to be calculated
      lastAccessed: Date.now()
    };

    // Enhanced scene data with storage metadata
    const enhancedData: EnhancedSceneData = {
      ...sceneData,
      videoSources: {
        original: originalVideoLocation,
        activeSource: 'original'
      },
      aiResults: this.convertAIResults(sceneData.aiResults || {}),
      storageMetadata: {
        totalSize: 0, // Would be calculated
        lastOptimized: Date.now(),
        storageStrategy: 'localStorage' as StorageStrategy
      }
    };

    return enhancedData;
  }

  // Convert legacy AI results to enhanced format
  private convertAIResults(legacyResults: Record<string, any>): Record<string, any> {
    const enhancedResults: Record<string, any> = {};
    
    for (const [key, result] of Object.entries(legacyResults)) {
      enhancedResults[key] = {
        result: result.result,
        storage: {
          type: 'localStorage',
          key: `ai-result-${key}`,
          size: JSON.stringify(result.result).length
        } as StorageLocation,
        processedAt: result.processedAt || Date.now(),
        agentId: result.agentId || key,
        status: result.status || 'completed',
        processingStrategy: 'client' as ProcessingStrategy
      };
    }
    
    return enhancedResults;
  }

  // Save scene data with intelligent storage routing
  async saveSceneData(sceneData: OptimizedSceneData | EnhancedSceneData): Promise<void> {
    // Determine if this is enhanced data or needs enhancement
    const enhancedData = 'videoSources' in sceneData 
      ? sceneData as EnhancedSceneData
      : await this.enhanceSceneData(sceneData);

    // Use storage orchestrator for intelligent saving
    await storageOrchestrator.saveEnhancedSceneData(enhancedData);
    
    // Also maintain compatibility with existing system
    if (this.compatibilityMode) {
      await this.saveToLegacyFormat(sceneData);
    }
  }

  // Save to legacy format for compatibility
  private async saveToLegacyFormat(sceneData: OptimizedSceneData): Promise<void> {
    // Update the existing project data manager
    const currentProject = projectDataManager.getCurrentProject();
    if (currentProject) {
      const updatedScenes = currentProject.scenes.map(scene => 
        scene.sceneId === sceneData.sceneId ? sceneData : scene
      );
      
      const updatedProject: OptimizedProjectData = {
        ...currentProject,
        scenes: updatedScenes,
        metadata: {
          ...currentProject.metadata,
          lastModified: Date.now()
        }
      };
      
      await projectDataManager.saveProject(updatedProject);
    }
  }

  // Process scene with AI agent using hybrid engine
  async processSceneWithAI(
    agentType: string,
    sceneData: OptimizedSceneData,
    userPreference?: ProcessingStrategy,
    onProgress?: (progress: number) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<AIProcessingResult> {
    
    // Use hybrid processing engine for intelligent routing
    return await hybridProcessingEngine.processScene(
      agentType as any, // Type assertion for now
      sceneData,
      userPreference,
      onProgress,
      onStatusUpdate
    );
  }

  // Get scene data with automatic enhancement
  async getSceneData(sceneId: string): Promise<EnhancedSceneData | null> {
    // Try to get from current project first
    const currentProject = projectDataManager.getCurrentProject();
    if (currentProject) {
      const sceneData = currentProject.scenes.find(scene => scene.sceneId === sceneId);
      if (sceneData) {
        return await this.enhanceSceneData(sceneData);
      }
    }
    
    // Try to get from enhanced storage
    try {
      const enhancedData = localStorage.getItem(`enhanced-scene-${sceneId}`);
      if (enhancedData) {
        return JSON.parse(enhancedData) as EnhancedSceneData;
      }
    } catch (error) {
      console.warn(`Failed to load enhanced scene data for ${sceneId}:`, error);
    }
    
    return null;
  }

  // Upload video to cloud storage
  async uploadVideoToCloud(
    file: File,
    sceneId?: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    
    if (!cloudStorageManager) {
      throw new Error('Cloud storage not configured');
    }

    // Get signed URL for upload
    const { uploadUrl, fileUrl } = await cloudStorageManager.getSignedUploadUrl(
      file.name,
      file.type,
      'original-uploads'
    );

    // Upload file
    await cloudStorageManager.uploadFile(file, uploadUrl, onProgress);

    // Update scene data if sceneId provided
    if (sceneId) {
      const sceneData = await this.getSceneData(sceneId);
      if (sceneData) {
        sceneData.videoSources.original = {
          type: 'gcs',
          key: file.name,
          url: fileUrl,
          size: file.size,
          lastAccessed: Date.now()
        };
        await this.saveSceneData(sceneData);
      }
    }

    return fileUrl;
  }

  // Get storage usage statistics
  async getStorageUsage(): Promise<{
    localStorage: { used: number; available: number };
    indexedDB: { used: number; available: number };
    cloud: { used: number; available: number };
    total: { used: number; available: number };
  }> {
    
    // Calculate localStorage usage
    let localStorageUsed = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          localStorageUsed += key.length + value.length;
        }
      }
    }

    // Estimate IndexedDB usage (simplified)
    let indexedDBUsed = 0;
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        indexedDBUsed = estimate.usage || 0;
      }
    } catch (error) {
      console.warn('Could not estimate IndexedDB usage:', error);
    }

    // Cloud usage would need to be fetched from backend
    const cloudUsed = 0; // Placeholder

    const localStorageMax = 5 * 1024 * 1024; // 5MB typical limit
    const indexedDBMax = 50 * 1024 * 1024; // 50MB typical limit
    const cloudMax = 1024 * 1024 * 1024; // 1GB placeholder

    return {
      localStorage: {
        used: localStorageUsed,
        available: localStorageMax - localStorageUsed
      },
      indexedDB: {
        used: indexedDBUsed,
        available: indexedDBMax - indexedDBUsed
      },
      cloud: {
        used: cloudUsed,
        available: cloudMax - cloudUsed
      },
      total: {
        used: localStorageUsed + indexedDBUsed + cloudUsed,
        available: (localStorageMax - localStorageUsed) + 
                  (indexedDBMax - indexedDBUsed) + 
                  (cloudMax - cloudUsed)
      }
    };
  }

  // Cleanup old data
  async cleanupOldData(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    
    // Clean up old localStorage entries
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('enhanced-scene-')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (data.storageMetadata?.lastOptimized && 
              (now - data.storageMetadata.lastOptimized) > maxAge) {
            keysToRemove.push(key);
          }
        } catch (error) {
          // Invalid data, mark for removal
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
      console.log(`🧹 Cleaned up ${keysToRemove.length} old storage entries`);
    }
  }

  // Enable/disable compatibility mode
  setCompatibilityMode(enabled: boolean): void {
    this.compatibilityMode = enabled;
    console.log(`🔄 Compatibility mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get system status
  getSystemStatus(): {
    storageOrchestrator: boolean;
    cloudStorage: boolean;
    hybridProcessing: boolean;
    compatibilityMode: boolean;
  } {
    return {
      storageOrchestrator: true, // Always available
      cloudStorage: !!cloudStorageManager,
      hybridProcessing: true, // Always available
      compatibilityMode: this.compatibilityMode
    };
  }
}

// Singleton instance
export const storageIntegrationLayer = new StorageIntegrationLayer();
