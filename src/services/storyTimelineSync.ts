// src/services/storyTimelineSync.ts
// Service for synchronizing story graph with timeline

import { eventBus, SYNC_EVENTS } from './eventBus';
import { projectDataManager } from '../utils/projectDataManager';
import type { AppNodeType } from '../App';

export interface TimelineSequence {
  sceneIds: string[];
  analysisId: string;
  timestamp: number;
}

export interface StoryGraphState {
  nodes: AppNodeType[];
  sceneNodes: AppNodeType[];
  sceneIds: string[];
  analysisId: string | null;
}

export class StoryTimelineSync {
  private static instance: StoryTimelineSync;
  private currentStoryState: StoryGraphState | null = null;
  private isInitialized = false;
  private lastSyncTimestamp: number = 0;
  private syncInProgress: boolean = false;

  private constructor() {}

  static getInstance(): StoryTimelineSync {
    if (!StoryTimelineSync.instance) {
      StoryTimelineSync.instance = new StoryTimelineSync();
    }
    return StoryTimelineSync.instance;
  }

  // Initialize the sync service
  initialize(): void {
    if (this.isInitialized) return;

    console.log('🔄 StoryTimelineSync: Initializing...');
    
    // Listen for project updates
    window.addEventListener('optimizedProjectUpdated', this.handleProjectUpdate.bind(this));
    window.addEventListener('projectDataUpdated', this.handleProjectUpdate.bind(this));

    // Listen for scene deletion events
    window.addEventListener('projectSceneDeleted', this.handleSceneDeletionEvent.bind(this));
    
    this.isInitialized = true;
    console.log('✅ StoryTimelineSync: Initialized');
  }

  // Update story state and sync with timeline
  updateStoryState(nodes: AppNodeType[], analysisId: string | null): void {
    const sceneNodes = nodes.filter(node => 
      node.data.type === 'scene' && 
      node.data.videoAnalysisData?.sceneId &&
      node.data.videoAnalysisData?.analysisId === analysisId
    );

    const sceneIds = sceneNodes
      .map(node => node.data.videoAnalysisData?.sceneId)
      .filter(Boolean) as string[];

    const newState: StoryGraphState = {
      nodes,
      sceneNodes,
      sceneIds,
      analysisId
    };

    // Check if state has changed
    const hasChanged = this.hasStoryStateChanged(newState);
    
    if (hasChanged) {
      console.log('🔄 StoryTimelineSync: Story state changed', {
        sceneCount: sceneIds.length,
        sceneIds,
        analysisId
      });

      this.currentStoryState = newState;
      this.syncTimelineWithStory();
    }
  }

  // Check if story state has changed
  private hasStoryStateChanged(newState: StoryGraphState): boolean {
    if (!this.currentStoryState) return true;
    
    const current = this.currentStoryState;
    
    // Check if analysis ID changed
    if (current.analysisId !== newState.analysisId) return true;
    
    // Check if scene IDs changed
    if (current.sceneIds.length !== newState.sceneIds.length) return true;
    
    // Check if scene order changed
    for (let i = 0; i < current.sceneIds.length; i++) {
      if (current.sceneIds[i] !== newState.sceneIds[i]) return true;
    }
    
    return false;
  }

  // Sync timeline with current story state
  private syncTimelineWithStory(): void {
    if (!this.currentStoryState || !this.currentStoryState.analysisId) {
      console.log('🔄 StoryTimelineSync: No valid story state to sync');
      return;
    }

    // 🚫 PREVENT DUPLICATE SYNCS: Check if sync is already in progress
    if (this.syncInProgress) {
      console.log('⚠️ StoryTimelineSync: Sync already in progress, skipping duplicate');
      return;
    }

    // 🚫 PREVENT RAPID SYNCS: Throttle sync calls to prevent spam
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTimestamp;
    const minSyncInterval = 500; // 500ms minimum between syncs

    if (timeSinceLastSync < minSyncInterval) {
      console.log(`⚠️ StoryTimelineSync: Too soon since last sync (${timeSinceLastSync}ms), throttling`);
      return;
    }

    this.syncInProgress = true;
    this.lastSyncTimestamp = now;

    const sequence: TimelineSequence = {
      sceneIds: this.currentStoryState.sceneIds,
      analysisId: this.currentStoryState.analysisId,
      timestamp: now
    };

    console.log('📡 StoryTimelineSync: Emitting timeline sequence change', sequence);

    // Emit event for timeline to listen to
    eventBus.emit(SYNC_EVENTS.TIMELINE_SEQUENCE_CHANGED, { sequence });

    // Clear sync flag after a delay
    setTimeout(() => {
      this.syncInProgress = false;
    }, 1000);
  }

  // Handle project updates
  private handleProjectUpdate(): void {
    console.log('🔄 StoryTimelineSync: Project updated, checking for changes...');

    // Get current project data
    const project = projectDataManager.getCurrentProject();
    if (!project) {
      console.log('🔄 StoryTimelineSync: No current project');
      return;
    }

    // Create synthetic story state from project data
    const sceneIds = project.scenes
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(scene => scene.sceneId);

    const syntheticState: StoryGraphState = {
      nodes: [], // We don't have access to actual nodes here
      sceneNodes: [],
      sceneIds,
      analysisId: project.analysisId
    };

    // Check if this represents a change
    const hasChanged = this.hasStoryStateChanged(syntheticState);

    if (hasChanged) {
      console.log('🔄 StoryTimelineSync: Project change detected, syncing timeline');
      this.currentStoryState = syntheticState;
      this.syncTimelineWithStory();
    }
  }

  // Handle scene deletion events from project data manager
  private handleSceneDeletionEvent(event: CustomEvent): void {
    const { sceneId, remainingScenes } = event.detail;
    console.log('🗑️ StoryTimelineSync: Received scene deletion event:', { sceneId, remainingScenes });

    // Update current state with remaining scenes
    if (this.currentStoryState) {
      this.currentStoryState = {
        ...this.currentStoryState,
        sceneIds: remainingScenes
      };
    }

    // Handle the scene deletion
    this.handleSceneDeletion(sceneId);
  }

  // Handle scene deletion
  handleSceneDeletion(sceneId: string): void {
    console.log('🗑️ StoryTimelineSync: Scene deleted:', sceneId);
    
    if (this.currentStoryState) {
      // Remove scene from current state
      const updatedSceneIds = this.currentStoryState.sceneIds.filter(id => id !== sceneId);
      
      this.currentStoryState = {
        ...this.currentStoryState,
        sceneIds: updatedSceneIds
      };

      // Emit scene removal event
      eventBus.emit(SYNC_EVENTS.TIMELINE_SCENE_REMOVED, { sceneId });
      
      // Sync timeline with updated state
      this.syncTimelineWithStory();
    }
  }

  // Handle scene addition
  handleSceneAddition(sceneId: string): void {
    console.log('➕ StoryTimelineSync: Scene added:', sceneId);
    
    // Emit scene addition event
    eventBus.emit(SYNC_EVENTS.TIMELINE_SCENE_ADDED, { sceneId });
    
    // Trigger full sync to ensure proper ordering
    this.handleProjectUpdate();
  }

  // Get current story state
  getCurrentStoryState(): StoryGraphState | null {
    return this.currentStoryState;
  }

  // Force sync timeline with current story
  forceSyncTimeline(): void {
    console.log('🔄 StoryTimelineSync: Force syncing timeline...');
    this.syncTimelineWithStory();
  }

  // Clear current state
  clearState(): void {
    console.log('🧹 StoryTimelineSync: Clearing state');
    this.currentStoryState = null;
    eventBus.emit(SYNC_EVENTS.TIMELINE_CLEARED, {});
  }

  // Destroy the service
  destroy(): void {
    window.removeEventListener('optimizedProjectUpdated', this.handleProjectUpdate.bind(this));
    window.removeEventListener('projectDataUpdated', this.handleProjectUpdate.bind(this));
    window.removeEventListener('projectSceneDeleted', this.handleSceneDeletionEvent.bind(this));
    this.currentStoryState = null;
    this.isInitialized = false;
    console.log('🗑️ StoryTimelineSync: Destroyed');
  }
}

// Create and export singleton instance
export const storyTimelineSync = StoryTimelineSync.getInstance();

// Export default instance
export default storyTimelineSync;
