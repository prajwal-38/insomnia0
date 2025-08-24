// src/features/editor/store/timeline-sync-store.ts

import { create } from 'zustand';
import { eventBus, SYNC_EVENTS } from '../../../services/eventBus';
import type { TimelineSequence } from '../../../services/storyTimelineSync';
import { projectDataManager } from '../../../utils/projectDataManager';
import StateManager from '@designcombo/state';

// Timeline sync state
export interface TimelineSyncState {
  // Current state
  storySequence: string[];
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncTime: number | null;
  // Prevent duplicate loading
  isLoading: boolean;
  // Track loaded scenes to prevent duplicates
  loadedScenes: Set<string>;

  // Actions
  updateFromStorySequence: (sequence: TimelineSequence) => Promise<void>;
  clearTimelineCompletely: () => Promise<void>;
  loadScenesDirectly: (sceneIds: string[]) => Promise<void>;
  clearTimeline: () => void;

  // State management
  setSyncStatus: (status: TimelineSyncState['syncStatus']) => void;
  getTimelineState: () => { sceneSequence: string[]; sceneCount: number };
  debugCurrentState: () => TimelineSyncState;
}

export const useTimelineSyncStore = create<TimelineSyncState>((set, get) => ({
  // Initial state
  storySequence: [],
  syncStatus: 'idle',
  lastSyncTime: null,
  isLoading: false,
  loadedScenes: new Set<string>(),

  // EXACT COPY: Use the same method as the working sync button
  updateFromStorySequence: async (sequence: TimelineSequence) => {
    console.log('🎬 EXACT SYNC: Updating timeline from story sequence');
    console.log('📋 Scene IDs to load:', sequence.sceneIds);

    // 🚫 PREVENT DUPLICATES: Check if already loading
    const currentState = get();
    if (currentState.isLoading) {
      console.log('⚠️ DUPLICATE PREVENTION: Already loading, skipping duplicate call');
      return;
    }

    set({ syncStatus: 'syncing', isLoading: true });

    try {
      // SELECTIVE CLEARING: Clear only scene items, preserve subtitles and AI content
      console.log('🧹 SELECTIVE SYNC: Clearing scene items before sync (preserving subtitles)...');
      console.log('🔧 SELECTIVE SYNC: About to call clearTimelineCompletely');
      await get().clearTimelineCompletely();
      console.log('🔧 SELECTIVE SYNC: Scene clearing completed');

      // Additional delay to ensure clearing is fully processed
      console.log('🔧 SELECTIVE SYNC: Waiting 300ms for clearing to be fully processed...');
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('🔧 SELECTIVE SYNC: Wait complete, proceeding with loading...');

      // Step 2: Load only the connected scenes
      if (sequence.sceneIds.length > 0) {
        await get().loadScenesDirectly(sequence.sceneIds);
      }

      // Step 3: Update state and track loaded scenes
      set({
        storySequence: sequence.sceneIds,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        isLoading: false,
        loadedScenes: new Set(sequence.sceneIds) // Track which scenes are now loaded
      });

      console.log('✅ EXACT SYNC: Timeline sync completed successfully');

    } catch (error) {
      console.error('❌ EXACT SYNC: Timeline sync failed:', error);
      set({ syncStatus: 'error', isLoading: false });
    }
  },

  // SELECTIVE CLEARING: Only clear scene-related items, preserve subtitles and AI content
  clearTimelineCompletely: async () => {
    try {
      console.log('🔧 SELECTIVE: clearSceneItems called (preserving subtitles & AI content)');

      // Get timeline store state
      const useTimelineStore = await import('../store/use-store');
      const timelineStore = useTimelineStore.default.getState();
      const { trackItemIds, trackItemsMap, activeIds } = timelineStore;

      console.log('🔧 SELECTIVE: trackItemIds:', trackItemIds);
      console.log('🔧 SELECTIVE: trackItemsMap keys:', Object.keys(trackItemsMap || {}));

      // CRITICAL: Get StateManager from global window
      const stateManager: StateManager = (window as any).stateManager;
      if (!stateManager) {
        console.error('❌ SELECTIVE: StateManager not found on window - timeline may not be initialized yet');
        return;
      }

      // Get state from StateManager
      const currentState = stateManager.getState();
      console.log('🔧 SELECTIVE: StateManager state:', {
        trackItemIds: currentState.trackItemIds,
        trackItemsMapKeys: Object.keys(currentState.trackItemsMap || {}),
        activeIds: currentState.activeIds
      });

      // Get all timeline items from multiple sources
      let allTrackItemIds = trackItemIds || [];

      if (allTrackItemIds.length === 0 && currentState.trackItemIds) {
        allTrackItemIds = currentState.trackItemIds;
        console.log('🔧 SELECTIVE: Using StateManager trackItemIds:', allTrackItemIds);
      }

      if (allTrackItemIds.length === 0 && trackItemsMap) {
        allTrackItemIds = Object.keys(trackItemsMap);
        console.log('🔧 SELECTIVE: Using trackItemsMap keys as fallback:', allTrackItemIds);
      }

      if (allTrackItemIds.length === 0 && currentState.trackItemsMap) {
        allTrackItemIds = Object.keys(currentState.trackItemsMap);
        console.log('🔧 SELECTIVE: Using StateManager trackItemsMap keys:', allTrackItemIds);
      }

      if (allTrackItemIds.length === 0) {
        console.log('✅ SELECTIVE: Timeline is already empty (no items found in any source)');
        return;
      }

      // 🎯 SELECTIVE FILTERING: Only select scene-related items for deletion
      const itemsToPreserve = new Set<string>();
      const itemsToDelete: string[] = [];

      // Use the most complete trackItemsMap available
      const completeTrackItemsMap = currentState.trackItemsMap || trackItemsMap || {};

      allTrackItemIds.forEach(itemId => {
        const item = completeTrackItemsMap[itemId];

        if (!item) {
          console.log(`⚠️ SELECTIVE: Item ${itemId} not found in trackItemsMap, will delete as fallback`);
          itemsToDelete.push(itemId);
          return;
        }

        // 🛡️ PRESERVE: Subtitle blocks and text items
        if (item.type === 'text' || item.type === 'subtitle') {
          itemsToPreserve.add(itemId);
          console.log(`🛡️ PRESERVE: ${item.type} item ${itemId}`);
          return;
        }

        // 🛡️ PRESERVE: AI-generated content
        if (item.metadata?.aiGenerated || item.metadata?.sourceUrl === 'ai-generated') {
          itemsToPreserve.add(itemId);
          console.log(`🤖 PRESERVE: AI-generated ${item.type} item ${itemId}`);
          return;
        }

        // 🛡️ PRESERVE: Items with subtitle-related metadata
        if (item.metadata?.isSubtitle || item.metadata?.subtitleBlock) {
          itemsToPreserve.add(itemId);
          console.log(`📝 PRESERVE: Subtitle-related ${item.type} item ${itemId}`);
          return;
        }

        // 🗑️ DELETE: Scene-related video/audio items (mezzanine segments)
        if (item.type === 'video' || item.type === 'audio') {
          // Check if it's a mezzanine segment or scene-related
          if (item.metadata?.isMezzanineSegment ||
              item.metadata?.sceneId ||
              item.metadata?.segmentOrder !== undefined ||
              item.details?.src?.includes('mezzanine') ||
              item.details?.src?.includes('scene_')) {
            itemsToDelete.push(itemId);
            console.log(`🗑️ DELETE: Scene-related ${item.type} item ${itemId} (${item.metadata?.sceneId || 'unknown scene'})`);
            return;
          }
        }

        // 🛡️ PRESERVE: Everything else by default (safer approach)
        itemsToPreserve.add(itemId);
        console.log(`🛡️ PRESERVE: Unknown ${item.type} item ${itemId} (preserving by default)`);
      });

      console.log(`📊 SELECTIVE: Analysis complete:`);
      console.log(`   Total items: ${allTrackItemIds.length}`);
      console.log(`   Items to preserve: ${itemsToPreserve.size}`);
      console.log(`   Items to delete: ${itemsToDelete.length}`);

      if (itemsToDelete.length === 0) {
        console.log('✅ SELECTIVE: No scene items to clear (all items are preserved content)');
        return;
      }

      console.log(`🎯 SELECTIVE: Selecting ${itemsToDelete.length} scene items for deletion`);
      console.log('🔧 SELECTIVE: Scene items to delete:', itemsToDelete);

      // Select only scene items for deletion
      stateManager.updateState({
        activeIds: [...itemsToDelete]
      });

      console.log('🔧 SELECTIVE: StateManager updateState called with scene activeIds');

      // Return a promise that resolves when clearing is complete
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          console.log('🔧 SELECTIVE: About to dispatch LAYER_DELETE for scene items only');
          import('@designcombo/events').then(({ dispatch }) => {
            import('@designcombo/state').then(({ LAYER_DELETE }) => {
              dispatch(LAYER_DELETE);
              console.log(`✅ SELECTIVE: Cleared ${itemsToDelete.length} scene items (preserved ${itemsToPreserve.size} subtitle/AI items)`);

              // Wait a bit more for the deletion to be processed
              setTimeout(() => {
                console.log('🔧 SELECTIVE: Scene clearing completed, ready for new content');
                resolve();
              }, 100);
            });
          });
        }, 50);
      });

    } catch (error) {
      console.error('❌ SELECTIVE: Error clearing scene items:', error);
      throw error;
    }
  },

  // Load scenes directly using mezzanine loader with duplicate prevention
  loadScenesDirectly: async (sceneIds: string[]) => {
    console.log('📽️ SELECTIVE LOAD: Loading scenes directly:', sceneIds);

    // Check current loaded scenes to prevent duplicates
    const currentState = get();
    const alreadyLoaded = sceneIds.filter(sceneId => currentState.loadedScenes.has(sceneId));
    const newScenesToLoad = sceneIds.filter(sceneId => !currentState.loadedScenes.has(sceneId));

    if (alreadyLoaded.length > 0) {
      console.log('⚠️ SELECTIVE LOAD: Some scenes already loaded:', alreadyLoaded);
    }

    if (newScenesToLoad.length === 0) {
      console.log('✅ SELECTIVE LOAD: All scenes already loaded, skipping');
      return;
    }

    console.log('📽️ SELECTIVE LOAD: New scenes to load:', newScenesToLoad);

    // 🚫 PREVENT DUPLICATES: Add unique identifier to prevent duplicate calls
    const loadId = `load_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    console.log(`🔒 LOAD ID: ${loadId}`);

    try {
      // Get analysis ID
      const project = projectDataManager.getCurrentProject();
      if (!project?.analysisId) {
        throw new Error('No analysis ID available');
      }

      console.log('✅ SIMPLE: Using analysis ID:', project.analysisId);

      // Import and use mezzanine loader
      const { loadMezzanineScenesToTimeline, createSeamlessTransitionConfig } =
        await import('../../../utils/mezzanineLoader');

      const seamlessConfig = createSeamlessTransitionConfig('frame-perfect', 30);

      const options = {
        analysisId: project.analysisId,
        baseUrl: '',
        ...seamlessConfig,
        forceReload: true,
        updateOnly: false,
        customSceneOrder: newScenesToLoad, // Only load new scenes
        clearTimelineFirst: false, // We already cleared it manually
        onProgress: (loaded: number, total: number) => {
          console.log(`📊 SIMPLE [${loadId}]: Loading progress: ${loaded}/${total} scenes`);
        },
        onError: (error: string, sceneId?: string) => {
          console.error(`❌ SIMPLE [${loadId}]: Loading error${sceneId ? ` (Scene: ${sceneId})` : ''}:`, error);
        },
        onComplete: (loadedCount: number) => {
          console.log(`🎉 SIMPLE [${loadId}]: Loading complete! Loaded ${loadedCount} scenes`);
        }
      };

      await loadMezzanineScenesToTimeline(options);
      console.log(`✅ SIMPLE [${loadId}]: Scenes loaded successfully`);

    } catch (error) {
      console.error(`❌ SIMPLE [${loadId}]: Scene loading failed:`, error);
      throw error;
    }
  },

  // Clear timeline
  clearTimeline: () => {
    console.log('🧹 SIMPLE: Clearing timeline');

    // Use the new simple clearing method
    get().clearTimelineCompletely();

    set({
      storySequence: [],
      syncStatus: 'idle',
      lastSyncTime: null,
      loadedScenes: new Set<string>() // Clear loaded scenes tracking
    });
  },

  // Set sync status
  setSyncStatus: (status: TimelineSyncState['syncStatus']) => {
    set({ syncStatus: status });
  },

  // Get current timeline state
  getTimelineState: () => {
    const { storySequence } = get();

    return {
      sceneSequence: storySequence,
      sceneCount: storySequence.length
    };
  },

  // Debug function to inspect current state
  debugCurrentState: () => {
    const state = get();
    console.log('🔍 TIMELINE SYNC DEBUG STATE:');
    console.log('  Story sequence:', state.storySequence);
    console.log('  Sync status:', state.syncStatus);
    console.log('  Loaded scenes:', Array.from(state.loadedScenes));
    console.log('  Is loading:', state.isLoading);
    console.log('  Last sync time:', state.lastSyncTime ? new Date(state.lastSyncTime).toLocaleTimeString() : 'never');
    return state;
  }
}));

// Setup event listeners for timeline sync
eventBus.on(SYNC_EVENTS.TIMELINE_SEQUENCE_CHANGED, (data: any) => {
  console.log('📡 Timeline sequence changed event received:', data);

  const store = useTimelineSyncStore.getState();
  store.updateFromStorySequence(data.sequence);
});

// Listen for individual scene removal events for immediate timeline updates
eventBus.on(SYNC_EVENTS.TIMELINE_SCENE_REMOVED, (data: any) => {
  console.log('📡 Timeline scene removed event received:', data);

  const store = useTimelineSyncStore.getState();
  const currentState = store.getTimelineState();

  // Remove the scene from current sequence and update timeline
  const updatedSceneIds = currentState.sceneSequence.filter(id => id !== data.sceneId);

  if (updatedSceneIds.length !== currentState.sceneSequence.length) {
    console.log(`🗑️ Removing scene ${data.sceneId} from timeline sequence`);

    // Create updated sequence and sync timeline
    const updatedSequence = {
      sceneIds: updatedSceneIds,
      analysisId: 'current', // Will be resolved in the sync function
      timestamp: Date.now()
    };

    store.updateFromStorySequence(updatedSequence);
  }
});

// Listen for scene addition events
eventBus.on(SYNC_EVENTS.TIMELINE_SCENE_ADDED, (data: any) => {
  console.log('📡 Timeline scene added event received:', data);
  // Scene additions will be handled by the full sequence sync
  // This is just for logging and potential future enhancements
});

// Export for external access
export { eventBus, SYNC_EVENTS };
