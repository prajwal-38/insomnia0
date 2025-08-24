// src/services/unifiedDataService.ts

import type { AIProcessingResult, NodeVideoSceneData, AIAgentType } from '../types';

// Unified data service for coordinating between different storage systems
export class UnifiedDataService {
  private static instance: UnifiedDataService;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  private constructor() {}

  static getInstance(): UnifiedDataService {
    if (!UnifiedDataService.instance) {
      UnifiedDataService.instance = new UnifiedDataService();
    }
    return UnifiedDataService.instance;
  }

  // Event system for cross-component communication
  addEventListener(event: string, listener: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  removeEventListener(event: string, listener: (data: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Public emit method for backward compatibility
  emitEvent(event: string, data: any): void {
    this.emit(event, data);
  }

  // Update scene with AI processing results
  async updateSceneAIResults(
    sceneId: string, 
    agentType: AIAgentType, 
    result: AIProcessingResult
  ): Promise<void> {
    try {
      console.log(`🔄 Updating scene ${sceneId} with ${agentType} results`);

      // Store in localStorage for persistence
      const storageKey = `ai-results-${sceneId}`;
      const existingResults = this.getStoredAIResults(sceneId);
      const updatedResults = {
        ...existingResults,
        [agentType]: {
          result: result.result,
          processedAt: result.metadata.processedAt,
          agentId: result.agentId,
          status: 'completed',
          metadata: result.metadata
        }
      };
      
      localStorage.setItem(storageKey, JSON.stringify(updatedResults));

      // Emit events for different components to update
      this.emit('ai-results-updated', {
        sceneId,
        agentType,
        result,
        allResults: updatedResults
      });

      this.emit('timeline-update-required', {
        sceneId,
        agentType,
        result
      });

      this.emit('scene-preview-update-required', {
        sceneId,
        agentType,
        result
      });

      console.log(`✅ Scene ${sceneId} updated with ${agentType} results`);
    } catch (error) {
      console.error(`❌ Failed to update scene ${sceneId} with AI results:`, error);
      throw error;
    }
  }

  // Get stored AI results for a scene
  getStoredAIResults(sceneId: string): Record<string, any> {
    try {
      const storageKey = `ai-results-${sceneId}`;
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error(`Error loading AI results for scene ${sceneId}:`, error);
      return {};
    }
  }

  // Get specific AI result for a scene and agent type
  getAIResult(sceneId: string, agentType: AIAgentType): any {
    const allResults = this.getStoredAIResults(sceneId);
    return allResults[agentType] || null;
  }

  // Store AI result for a scene (backward compatibility method)
  storeAIResult(sceneId: string, agentType: AIAgentType, result: any): void {
    try {
      const storageKey = `ai-results-${sceneId}`;
      const existingResults = this.getStoredAIResults(sceneId);

      existingResults[agentType] = {
        result,
        processedAt: Date.now(),
        agentId: `${agentType}-${Date.now()}`,
        status: 'completed'
      };

      localStorage.setItem(storageKey, JSON.stringify(existingResults));
      console.log(`💾 Stored AI result for ${agentType} on scene ${sceneId}`);

      // Emit event for real-time updates
      this.emit('ai-result-stored', { sceneId, agentType, result });
    } catch (error) {
      console.error(`Error storing AI result for scene ${sceneId}:`, error);
    }
  }

  // Check if scene has AI results
  hasAIResults(sceneId: string, agentType?: AIAgentType): boolean {
    const results = this.getStoredAIResults(sceneId);
    if (agentType) {
      return !!results[agentType];
    }
    return Object.keys(results).length > 0;
  }

  // Clear AI results for a scene
  clearAIResults(sceneId: string, agentType?: AIAgentType): void {
    try {
      const storageKey = `ai-results-${sceneId}`;
      
      if (agentType) {
        // Clear specific agent type
        const results = this.getStoredAIResults(sceneId);
        delete results[agentType];
        localStorage.setItem(storageKey, JSON.stringify(results));
      } else {
        // Clear all results
        localStorage.removeItem(storageKey);
      }

      this.emit('ai-results-cleared', { sceneId, agentType });
    } catch (error) {
      console.error(`Error clearing AI results for scene ${sceneId}:`, error);
    }
  }

  // Sync timeline with AI results
  async syncTimelineWithAIResults(sceneId: string): Promise<void> {
    try {
      const aiResults = this.getStoredAIResults(sceneId);
      
      // Emit timeline sync event with all AI results
      this.emit('timeline-sync-ai-results', {
        sceneId,
        aiResults
      });

      console.log(`🔄 Timeline synced with AI results for scene ${sceneId}`);
    } catch (error) {
      console.error(`Error syncing timeline for scene ${sceneId}:`, error);
    }
  }

  // Update scene preview with AI results
  async updateScenePreview(sceneId: string): Promise<void> {
    try {
      const aiResults = this.getStoredAIResults(sceneId);
      
      // Emit preview update event
      this.emit('scene-preview-update', {
        sceneId,
        aiResults
      });

      console.log(`🔄 Scene preview updated for scene ${sceneId}`);
    } catch (error) {
      console.error(`Error updating scene preview for scene ${sceneId}:`, error);
    }
  }

  // Get all scenes with AI results
  getAllScenesWithAIResults(): Record<string, Record<string, any>> {
    const allScenes: Record<string, Record<string, any>> = {};
    
    // Scan localStorage for AI results
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ai-results-')) {
        const sceneId = key.replace('ai-results-', '');
        allScenes[sceneId] = this.getStoredAIResults(sceneId);
      }
    }
    
    return allScenes;
  }

  // Cleanup old AI results
  cleanupOldAIResults(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    try {
      const now = Date.now();
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ai-results-')) {
          const results = this.getStoredAIResults(key.replace('ai-results-', ''));
          
          // Check if all results are older than maxAge
          const allOld = Object.values(results).every((result: any) => {
            return result.processedAt && (now - result.processedAt) > maxAge;
          });
          
          if (allOld) {
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      if (keysToRemove.length > 0) {
        console.log(`🧹 Cleaned up ${keysToRemove.length} old AI result entries`);
      }
    } catch (error) {
      console.error('Error cleaning up old AI results:', error);
    }
  }

  // Initialize the service
  initialize(): void {
    console.log('🚀 UnifiedDataService initialized');
    
    // Cleanup old results on initialization
    this.cleanupOldAIResults();
    
    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupOldAIResults();
    }, 60 * 60 * 1000); // Every hour
  }
}

// Export singleton instance
export const unifiedDataService = UnifiedDataService.getInstance();
