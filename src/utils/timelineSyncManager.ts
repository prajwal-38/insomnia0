// src/utils/timelineSyncManager.ts
// Robust Timeline Synchronization Manager

import type { SyncEvent, TimelineDataPayload } from './timelineDataManager';
import { loadTimelineData, getTimelineStorageKey } from './timelineDataManager';

export interface SyncConflict {
  sceneId: string;
  localData: TimelineDataPayload;
  remoteData: TimelineDataPayload;
  conflictType: 'timestamp' | 'version' | 'checksum';
  timestamp: number;
}

export interface SyncState {
  isOnline: boolean;
  lastSync: number;
  pendingConflicts: SyncConflict[];
  syncInProgress: Set<string>;
}

export type ConflictResolution = 'local' | 'remote' | 'merge' | 'manual';

export interface SyncManagerOptions {
  enableDebugLogging?: boolean;
  conflictResolutionStrategy?: ConflictResolution;
  syncTimeout?: number;
  maxRetries?: number;
}

class TimelineSyncManager {
  private syncState: SyncState = {
    isOnline: true,
    lastSync: Date.now(),
    pendingConflicts: [],
    syncInProgress: new Set()
  };

  private options: Required<SyncManagerOptions>;
  private eventListeners: Map<string, Set<(event: SyncEvent) => void>> = new Map();
  private conflictResolvers: Map<string, (conflict: SyncConflict) => Promise<ConflictResolution>> = new Map();

  constructor(options: SyncManagerOptions = {}) {
    this.options = {
      enableDebugLogging: options.enableDebugLogging ?? true,
      conflictResolutionStrategy: options.conflictResolutionStrategy ?? 'local',
      syncTimeout: options.syncTimeout ?? 5000,
      maxRetries: options.maxRetries ?? 3
    };

    this.initializeEventListeners();
    this.monitorOnlineStatus();
  }

  private initializeEventListeners(): void {
    // Listen for timeline sync events
    window.addEventListener('timelineSync', this.handleSyncEvent.bind(this));
    
    // Listen for storage events from other tabs
    window.addEventListener('storage', this.handleStorageEvent.bind(this));
    
    // Listen for legacy events for backward compatibility
    window.addEventListener('localStorageChange', this.handleLegacyEvent.bind(this));

    if (this.options.enableDebugLogging) {
      console.log('🔄 TimelineSyncManager initialized');
    }
  }

  private monitorOnlineStatus(): void {
    window.addEventListener('online', () => {
      this.syncState.isOnline = true;
      this.log('📶 Connection restored, resuming sync operations');
      this.processPendingConflicts();
    });

    window.addEventListener('offline', () => {
      this.syncState.isOnline = false;
      this.log('📵 Connection lost, sync operations will be queued');
    });
  }

  private log(message: string, data?: any): void {
    if (this.options.enableDebugLogging) {
      console.log(`[TimelineSync] ${message}`, data || '');
    }
  }

  private async handleSyncEvent(event: CustomEvent<SyncEvent>): Promise<void> {
    const syncEvent = event.detail;
    this.log(`Received sync event: ${syncEvent.type} for scene ${syncEvent.sceneId}`);

    // Notify listeners
    const listeners = this.eventListeners.get(syncEvent.type) || new Set();
    listeners.forEach(listener => {
      try {
        listener(syncEvent);
      } catch (error) {
        console.error('Error in sync event listener:', error);
      }
    });

    // Handle conflict detection for save events
    if (syncEvent.type === 'save' && syncEvent.source !== 'System') {
      await this.detectAndHandleConflicts(syncEvent.sceneId);
    }
  }

  private async handleStorageEvent(event: StorageEvent): Promise<void> {
    if (!event.key || !event.key.startsWith('storyboard_timeline_')) {
      return;
    }

    const sceneId = event.key.replace('storyboard_timeline_', '');
    this.log(`Storage change detected for scene ${sceneId}`);

    // Create synthetic sync event
    const syncEvent: SyncEvent = {
      type: 'save',
      sceneId,
      timestamp: Date.now(),
      source: 'System' // Assume external change
    };

    await this.handleSyncEvent(new CustomEvent('timelineSync', { detail: syncEvent }));
  }

  private async handleLegacyEvent(event: CustomEvent): Promise<void> {
    if (!event.detail?.key?.startsWith('timeline-')) {
      return;
    }

    const sceneId = event.detail.key.replace('timeline-', '');
    this.log(`Legacy sync event for scene ${sceneId}`);

    // Convert to modern sync event
    const syncEvent: SyncEvent = {
      type: 'save',
      sceneId,
      timestamp: Date.now(),
      source: 'NodeTimeline'
    };

    await this.handleSyncEvent(new CustomEvent('timelineSync', { detail: syncEvent }));
  }

  private async detectAndHandleConflicts(sceneId: string): Promise<void> {
    if (this.syncState.syncInProgress.has(sceneId)) {
      this.log(`Sync already in progress for scene ${sceneId}, skipping conflict detection`);
      return;
    }

    this.syncState.syncInProgress.add(sceneId);

    try {
      // Load current data
      const currentResult = await loadTimelineData(sceneId);
      if (!currentResult.success || !currentResult.data) {
        return;
      }

      const currentData = currentResult.data;

      // Check for potential conflicts
      const conflict = await this.checkForConflicts(sceneId, currentData);
      if (conflict) {
        this.log(`Conflict detected for scene ${sceneId}:`, conflict.conflictType);
        await this.resolveConflict(conflict);
      }

    } catch (error) {
      console.error(`Error detecting conflicts for scene ${sceneId}:`, error);
    } finally {
      this.syncState.syncInProgress.delete(sceneId);
    }
  }

  private async checkForConflicts(sceneId: string, localData: TimelineDataPayload): Promise<SyncConflict | null> {
    // For now, we'll implement basic conflict detection
    // In a real multi-user environment, this would check against server data
    
    // Check if there are multiple recent saves (potential concurrent editing)
    const recentSaveThreshold = 5000; // 5 seconds
    const now = Date.now();
    
    if (localData.metadata.lastSaved && (now - localData.metadata.lastSaved) < recentSaveThreshold) {
      // Check for rapid successive saves which might indicate conflicts
      if (localData.metadata.saveCount > 1) {
        // This is a simplified conflict detection - in production you'd compare with server data
        return null; // No conflicts detected in this simple implementation
      }
    }

    return null;
  }

  private async resolveConflict(conflict: SyncConflict): Promise<void> {
    this.syncState.pendingConflicts.push(conflict);

    // Check if we have a custom resolver for this scene
    const customResolver = this.conflictResolvers.get(conflict.sceneId);
    let resolution: ConflictResolution;

    if (customResolver) {
      resolution = await customResolver(conflict);
    } else {
      resolution = this.options.conflictResolutionStrategy;
    }

    await this.applyConflictResolution(conflict, resolution);
  }

  private async applyConflictResolution(conflict: SyncConflict, resolution: ConflictResolution): Promise<void> {
    this.log(`Applying conflict resolution: ${resolution} for scene ${conflict.sceneId}`);

    switch (resolution) {
      case 'local':
        // Keep local data, no action needed
        this.log('Keeping local data');
        break;

      case 'remote':
        // Use remote data
        const storageKey = getTimelineStorageKey(conflict.sceneId);
        localStorage.setItem(storageKey, JSON.stringify(conflict.remoteData));
        this.log('Applied remote data');
        break;

      case 'merge':
        // Attempt to merge data
        const mergedData = await this.mergeTimelineData(conflict.localData, conflict.remoteData);
        const mergedStorageKey = getTimelineStorageKey(conflict.sceneId);
        localStorage.setItem(mergedStorageKey, JSON.stringify(mergedData));
        this.log('Applied merged data');
        break;

      case 'manual':
        // Leave conflict for manual resolution
        this.log('Conflict marked for manual resolution');
        return; // Don't remove from pending conflicts
    }

    // Remove resolved conflict
    this.syncState.pendingConflicts = this.syncState.pendingConflicts.filter(c => c !== conflict);

    // Dispatch resolution event
    const resolutionEvent: SyncEvent = {
      type: 'save',
      sceneId: conflict.sceneId,
      timestamp: Date.now(),
      source: 'System',
      data: { resolution, conflictType: conflict.conflictType }
    };

    window.dispatchEvent(new CustomEvent('timelineSync', { detail: resolutionEvent }));
  }

  private async mergeTimelineData(local: TimelineDataPayload, remote: TimelineDataPayload): Promise<TimelineDataPayload> {
    // Simple merge strategy: use most recent data for each field
    const merged: TimelineDataPayload = {
      version: local.version, // Keep local version
      sceneId: local.sceneId,
      sceneIndex: local.sceneIndex,
      originalDuration: local.originalDuration,
      clips: local.metadata.lastModified > remote.metadata.lastModified ? local.clips : remote.clips,
      playhead: local.metadata.lastModified > remote.metadata.lastModified ? local.playhead : remote.playhead,
      edits: { ...remote.edits, ...local.edits }, // Merge edits, local takes precedence
      metadata: {
        lastSaved: Date.now(),
        lastModified: Math.max(local.metadata.lastModified, remote.metadata.lastModified),
        saveCount: Math.max(local.metadata.saveCount, remote.metadata.saveCount) + 1,
        checksum: '' // Will be recalculated
      }
    };

    // Recalculate checksum
    const { generateChecksum } = await import('./timelineDataManager');
    merged.metadata.checksum = generateChecksum({
      clips: merged.clips,
      playhead: merged.playhead,
      edits: merged.edits
    });

    return merged;
  }

  private async processPendingConflicts(): Promise<void> {
    if (!this.syncState.isOnline || this.syncState.pendingConflicts.length === 0) {
      return;
    }

    this.log(`Processing ${this.syncState.pendingConflicts.length} pending conflicts`);

    const conflicts = [...this.syncState.pendingConflicts];
    for (const conflict of conflicts) {
      try {
        await this.resolveConflict(conflict);
      } catch (error) {
        console.error(`Failed to resolve conflict for scene ${conflict.sceneId}:`, error);
      }
    }
  }

  // Public API methods

  public addEventListener(eventType: string, listener: (event: SyncEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  public removeEventListener(eventType: string, listener: (event: SyncEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  public setConflictResolver(sceneId: string, resolver: (conflict: SyncConflict) => Promise<ConflictResolution>): void {
    this.conflictResolvers.set(sceneId, resolver);
  }

  public removeConflictResolver(sceneId: string): void {
    this.conflictResolvers.delete(sceneId);
  }

  public getSyncState(): Readonly<SyncState> {
    return { ...this.syncState };
  }

  public async forceSyncScene(sceneId: string): Promise<void> {
    this.log(`Force syncing scene ${sceneId}`);
    await this.detectAndHandleConflicts(sceneId);
  }

  public clearPendingConflicts(): void {
    this.syncState.pendingConflicts = [];
    this.log('Cleared all pending conflicts');
  }

  public destroy(): void {
    window.removeEventListener('timelineSync', this.handleSyncEvent.bind(this));
    window.removeEventListener('storage', this.handleStorageEvent.bind(this));
    window.removeEventListener('localStorageChange', this.handleLegacyEvent.bind(this));
    
    this.eventListeners.clear();
    this.conflictResolvers.clear();
    this.syncState.pendingConflicts = [];
    
    this.log('TimelineSyncManager destroyed');
  }
}

// Global sync manager instance
let globalSyncManager: TimelineSyncManager | null = null;

export function getSyncManager(options?: SyncManagerOptions): TimelineSyncManager {
  if (!globalSyncManager) {
    globalSyncManager = new TimelineSyncManager(options);
  }
  return globalSyncManager;
}

export function destroySyncManager(): void {
  if (globalSyncManager) {
    globalSyncManager.destroy();
    globalSyncManager = null;
  }
}
