// src/services/globalTimelineSync.ts
// Global service to expose timeline sync functionality to the entire app

import { storyTimelineSync } from './storyTimelineSync';
import { projectDataManager } from '../utils/projectDataManager';
import { 
  loadMezzanineScenesToTimeline, 
  createSeamlessTransitionConfig 
} from '../utils/mezzanineLoader';

export class GlobalTimelineSync {
  private static instance: GlobalTimelineSync;

  private constructor() {}

  static getInstance(): GlobalTimelineSync {
    if (!GlobalTimelineSync.instance) {
      GlobalTimelineSync.instance = new GlobalTimelineSync();
    }
    return GlobalTimelineSync.instance;
  }

  // Get current analysis ID from various sources
  private getCurrentAnalysisId(): string | null {
    // Try to get from global window object (set by App component)
    const globalAnalysisId = (window as any).currentAnalysisId;
    if (globalAnalysisId) {
      return globalAnalysisId;
    }

    // Try to get from project data manager (most reliable after refresh)
    try {
      const project = projectDataManager.getCurrentProject();
      if (project?.analysisId) {
        console.log('🎯 Found analysis ID from project data:', project.analysisId);
        // Set it globally for future use
        (window as any).currentAnalysisId = project.analysisId;
        return project.analysisId;
      }
    } catch (error) {
      console.warn('Failed to get analysis ID from project data:', error);
    }

    // Fallback: try to get from localStorage
    const storedAnalysisData = localStorage.getItem('currentAnalysisData');
    if (storedAnalysisData) {
      try {
        const analysisData = JSON.parse(storedAnalysisData);
        if (analysisData.analysisId) {
          // Set it globally for future use
          (window as any).currentAnalysisId = analysisData.analysisId;
          return analysisData.analysisId;
        }
      } catch (error) {
        console.warn('Failed to parse stored analysis data:', error);
      }
    }

    // Last resort: try to get from URL if we're on the editor page
    const currentUrl = window.location.href;
    if (currentUrl.includes('/editor')) {
      const urlMatch = currentUrl.match(/analysis\/([a-f0-9-]+)/);
      if (urlMatch) {
        console.log('🎯 Found analysis ID from URL:', urlMatch[1]);
        (window as any).currentAnalysisId = urlMatch[1];
        return urlMatch[1];
      }
    }

    return null;
  }

  // Get scene IDs from the story node graph via story timeline sync
  private getStorySceneIds(): string[] {
    try {
      // PRIORITY 1: Get from story timeline sync service (most accurate)
      const storyState = storyTimelineSync.getCurrentStoryState();
      console.log('🔍 DEBUG: Story timeline sync state:', {
        hasState: !!storyState,
        sceneCount: storyState?.sceneIds?.length || 0,
        sceneIds: storyState?.sceneIds || [],
        analysisId: storyState?.analysisId
      });

      if (storyState && storyState.sceneIds.length > 0) {
        console.log('📊 Scene IDs from story timeline sync (PRIORITY):', storyState.sceneIds);
        return storyState.sceneIds;
      } else {
        console.log('⚠️ Story timeline sync has no scenes, falling back to project data');
      }

      // SKIP PROJECT DATA MANAGER - it may have stale data during sync
      console.log('⚠️ Story timeline sync has no scenes - this means no scenes are in the story graph');
      console.log('🚫 Skipping project data manager fallback to avoid loading deleted scenes');

      // Return empty array if story timeline sync has no scenes
      // This means the story graph is empty and timeline should be empty too
      return [];

    } catch (error) {
      console.error('❌ Failed to get story scene IDs:', error);
      return [];
    }
  }

  // Clear timeline items (preserving AI-generated content)
  private clearAllTimelineItems(): void {
    try {
      console.log('🧹 GlobalTimelineSync: Clearing timeline items...');
      
      // This is a simplified version - in a real implementation, you'd need
      // access to the StateManager to properly clear timeline items
      // For now, we'll rely on the mezzanineLoader's force reload to handle this
      
      console.log('✅ GlobalTimelineSync: Timeline clearing initiated');
    } catch (error) {
      console.error('❌ Error clearing timeline items:', error);
    }
  }

  // Main sync function - use the existing story timeline sync service
  async syncTimeline(forceReload: boolean = false): Promise<void> {
    console.log('🔧 GlobalTimelineSync: Triggering timeline sync via storyTimelineSync service');

    try {
      // Check if story timeline sync has a current state
      const currentState = storyTimelineSync.getCurrentStoryState();
      console.log('🔍 GlobalTimelineSync: Current story state:', {
        hasState: !!currentState,
        sceneCount: currentState?.sceneIds?.length || 0,
        sceneIds: currentState?.sceneIds || [],
        analysisId: currentState?.analysisId
      });

      if (!currentState || !currentState.sceneIds || currentState.sceneIds.length === 0) {
        console.warn('⚠️ GlobalTimelineSync: No story state available for sync');
        throw new Error('No scenes found in story graph - nothing to sync');
      }

      // Use the existing story timeline sync service which handles all the complexity
      storyTimelineSync.forceSyncTimeline();

      // The story timeline sync service will emit events that the timeline will listen to
      // This is the same mechanism used by the original timeline header sync
      console.log('✅ GlobalTimelineSync: Timeline sync triggered successfully');

    } catch (error) {
      console.error('❌ GlobalTimelineSync: Sync failed:', error);
      throw error;
    }
  }

  // Force sync using the story timeline sync service
  forceSyncTimeline(): void {
    console.log('🔄 GlobalTimelineSync: Force syncing timeline via storyTimelineSync...');
    storyTimelineSync.forceSyncTimeline();
  }
}

// Create and export singleton instance
export const globalTimelineSync = GlobalTimelineSync.getInstance();

// Export default instance
export default globalTimelineSync;
