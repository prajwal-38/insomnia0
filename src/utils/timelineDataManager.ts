// src/utils/timelineDataManager.ts
// Comprehensive Timeline Data Management System

import type { AnalyzedScene } from '../types';

// Current schema version for timeline data
export const TIMELINE_DATA_VERSION = '1.0.0';

// Timeline data interfaces with versioning and validation
export interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  mediaStart: number;
  mediaEnd: number;
  type: 'video' | 'audio' | 'text';
  selected: boolean;
  // Additional metadata for validation
  originalDuration?: number;
  sourceSceneId?: string;
}

export interface SceneEdits {
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  textOverlays?: TextOverlay[];
  fadeIn?: number;
  fadeOut?: number;
  clips?: TimelineClip[];
  playhead?: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface TimelineDataPayload {
  version: string;
  sceneId: string;
  sceneIndex: number;
  originalDuration: number;
  clips: TimelineClip[];
  playhead: number;
  edits: SceneEdits;
  metadata: {
    lastSaved: number;
    lastModified: number;
    saveCount: number;
    checksum: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canRecover: boolean;
  recoveredData?: Partial<TimelineDataPayload>;
}

export interface SyncEvent {
  type: 'save' | 'load' | 'delete' | 'conflict';
  sceneId: string;
  timestamp: number;
  source: 'NodeTimeline' | 'ProfessionalTimeline' | 'System';
  data?: any;
  error?: string;
}

// Storage quota and cleanup thresholds
const MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB
const CLEANUP_THRESHOLD = 0.8; // Clean up when 80% full
const MAX_TIMELINE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate checksum for data integrity validation
 */
function generateChecksum(data: any): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Validate timeline clip data structure
 */
function validateClip(clip: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!clip.id || typeof clip.id !== 'string') {
    errors.push('Clip missing valid ID');
  }

  if (typeof clip.startTime !== 'number' || clip.startTime < 0) {
    errors.push('Clip has invalid startTime');
  }

  if (typeof clip.duration !== 'number' || clip.duration <= 0) {
    errors.push('Clip has invalid duration');
  }

  if (typeof clip.mediaStart !== 'number' || clip.mediaStart < 0) {
    errors.push('Clip has invalid mediaStart');
  }

  if (typeof clip.mediaEnd !== 'number' || clip.mediaEnd <= clip.mediaStart) {
    errors.push('Clip has invalid mediaEnd');
  }

  if (!['video', 'audio', 'text'].includes(clip.type)) {
    errors.push('Clip has invalid type');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate complete timeline data payload
 */
export function validateTimelineData(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let canRecover = true;
  let recoveredData: Partial<TimelineDataPayload> = {};

  try {
    // Check version compatibility
    if (!data.version) {
      warnings.push('Missing version information, assuming current version');
      recoveredData.version = TIMELINE_DATA_VERSION;
    } else if (data.version !== TIMELINE_DATA_VERSION) {
      warnings.push(`Version mismatch: expected ${TIMELINE_DATA_VERSION}, got ${data.version}`);
    }

    // Validate required fields
    if (!data.sceneId || typeof data.sceneId !== 'string') {
      errors.push('Missing or invalid sceneId');
      canRecover = false;
    }

    if (typeof data.sceneIndex !== 'number') {
      warnings.push('Missing or invalid sceneIndex');
      recoveredData.sceneIndex = 0;
    }

    if (typeof data.originalDuration !== 'number' || data.originalDuration <= 0) {
      warnings.push('Missing or invalid originalDuration');
      recoveredData.originalDuration = 10; // Default fallback
    }

    // Validate clips array
    if (!Array.isArray(data.clips)) {
      errors.push('Clips data is not an array');
      canRecover = false;
    } else {
      const validClips: TimelineClip[] = [];
      data.clips.forEach((clip: any, index: number) => {
        const clipValidation = validateClip(clip);
        if (clipValidation.isValid) {
          validClips.push(clip);
        } else {
          warnings.push(`Clip ${index} validation failed: ${clipValidation.errors.join(', ')}`);
        }
      });

      if (validClips.length === 0) {
        errors.push('No valid clips found');
        canRecover = false;
      } else {
        recoveredData.clips = validClips;
      }
    }

    // Validate playhead
    if (typeof data.playhead !== 'number' || data.playhead < 0) {
      warnings.push('Invalid playhead position');
      recoveredData.playhead = 0;
    }

    // Validate edits object
    if (data.edits && typeof data.edits !== 'object') {
      warnings.push('Invalid edits data structure');
      recoveredData.edits = {};
    }

    // Validate metadata
    if (!data.metadata || typeof data.metadata !== 'object') {
      warnings.push('Missing metadata, creating default');
      recoveredData.metadata = {
        lastSaved: Date.now(),
        lastModified: Date.now(),
        saveCount: 1,
        checksum: generateChecksum({ clips: data.clips, playhead: data.playhead, edits: data.edits })
      };
    } else {
      // Validate checksum if present
      if (data.metadata.checksum) {
        const expectedChecksum = generateChecksum({
          clips: data.clips,
          playhead: data.playhead,
          edits: data.edits
        });

        if (data.metadata.checksum !== expectedChecksum) {
          warnings.push('Data integrity check failed - possible corruption detected');
        }
      }
    }

  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    canRecover = false;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    canRecover,
    recoveredData: Object.keys(recoveredData).length > 0 ? recoveredData : undefined
  };
}

/**
 * Create storage key for timeline data
 */
export function getTimelineStorageKey(sceneId: string): string {
  return `storyboard_timeline_${sceneId}`;
}

/**
 * Create backup storage key
 */
export function getBackupStorageKey(sceneId: string): string {
  return `storyboard_timeline_backup_${sceneId}`;
}

/**
 * Get storage usage information
 */
export function getStorageInfo(): { used: number; available: number; percentage: number } {
  let used = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          used += key.length + value.length;
        }
      }
    }
  } catch (error) {
    console.warn('Could not calculate storage usage:', error);
  }

  const available = MAX_STORAGE_SIZE - used;
  const percentage = (used / MAX_STORAGE_SIZE) * 100;

  return { used, available, percentage };
}

/**
 * Check if storage cleanup is needed
 */
export function needsCleanup(): boolean {
  const { percentage } = getStorageInfo();
  return percentage > (CLEANUP_THRESHOLD * 100);
}

/**
 * Clean up old timeline data
 */
export function cleanupOldTimelineData(): { cleaned: number; errors: string[] } {
  const errors: string[] = [];
  let cleaned = 0;

  try {
    const now = Date.now();
    const keysToDelete: string[] = [];

    // Find old timeline data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('storyboard_timeline_') || key.startsWith('timeline-'))) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            const lastSaved = parsed.metadata?.lastSaved || parsed.lastSaved || 0;

            if (now - lastSaved > MAX_TIMELINE_AGE) {
              keysToDelete.push(key);
            }
          }
        } catch (error) {
          // If we can't parse it, it's probably corrupted - mark for deletion
          keysToDelete.push(key);
        }
      }
    }

    // Delete old data
    keysToDelete.forEach(key => {
      try {
        localStorage.removeItem(key);
        cleaned++;
      } catch (error) {
        errors.push(`Failed to delete ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

  } catch (error) {
    errors.push(`Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { cleaned, errors };
}

/**
 * Create initial timeline clips for a scene
 */
export function createInitialClips(scene: AnalyzedScene): TimelineClip[] {
  return [
    {
      id: `video-clip-${scene.sceneId}`,
      startTime: 0,
      duration: scene.duration,
      mediaStart: 0,
      mediaEnd: scene.duration,
      type: 'video',
      selected: false,
      originalDuration: scene.duration,
      sourceSceneId: scene.sceneId
    },
    {
      id: `audio-clip-${scene.sceneId}`,
      startTime: 0,
      duration: scene.duration,
      mediaStart: 0,
      mediaEnd: scene.duration,
      type: 'audio',
      selected: false,
      originalDuration: scene.duration,
      sourceSceneId: scene.sceneId
    }
  ];
}

/**
 * Save timeline data with comprehensive error handling and validation
 */
export async function saveTimelineData(
  scene: AnalyzedScene,
  clips: TimelineClip[],
  playhead: number,
  edits: SceneEdits
): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  try {
    // Check storage quota before saving
    if (needsCleanup()) {
      const cleanupResult = cleanupOldTimelineData();
      console.log(`🧹 Cleaned up ${cleanupResult.cleaned} old timeline entries`);

      if (cleanupResult.errors.length > 0) {
        console.warn('Cleanup warnings:', cleanupResult.errors);
      }
    }

    // Create timeline data payload
    const timelineData: TimelineDataPayload = {
      version: TIMELINE_DATA_VERSION,
      sceneId: scene.sceneId,
      sceneIndex: scene.scene_index,
      originalDuration: scene.duration,
      clips,
      playhead,
      edits,
      metadata: {
        lastSaved: Date.now(),
        lastModified: Date.now(),
        saveCount: 1,
        checksum: generateChecksum({ clips, playhead, edits })
      }
    };

    // Load existing data to increment save count
    const existingData = await loadTimelineData(scene.sceneId);
    if (existingData.success && existingData.data) {
      timelineData.metadata.saveCount = (existingData.data.metadata?.saveCount || 0) + 1;
    }

    // Validate data before saving
    const validation = validateTimelineData(timelineData);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    const storageKey = getTimelineStorageKey(scene.sceneId);
    const backupKey = getBackupStorageKey(scene.sceneId);

    // Create backup of existing data
    const existingDataStr = localStorage.getItem(storageKey);
    if (existingDataStr) {
      try {
        localStorage.setItem(backupKey, existingDataStr);
      } catch (backupError) {
        console.warn('Failed to create backup:', backupError);
      }
    }

    // Save new data
    const dataStr = JSON.stringify(timelineData);
    localStorage.setItem(storageKey, dataStr);

    // Dispatch sync event
    const syncEvent: SyncEvent = {
      type: 'save',
      sceneId: scene.sceneId,
      timestamp: Date.now(),
      source: 'NodeTimeline',
      data: { clips: clips.length, playhead, saveCount: timelineData.metadata.saveCount }
    };

    window.dispatchEvent(new CustomEvent('timelineSync', {
      detail: syncEvent
    }));

    // Also dispatch legacy event for backward compatibility
    window.dispatchEvent(new CustomEvent('localStorageChange', {
      detail: { key: storageKey, value: dataStr }
    }));

    console.log(`💾 Timeline data saved successfully for scene ${scene.sceneId}`, {
      clips: clips.length,
      playhead,
      saveCount: timelineData.metadata.saveCount,
      size: dataStr.length
    });

    return {
      success: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to save timeline data:', error);

    return {
      success: false,
      error: `Save failed: ${errorMessage}`
    };
  }
}

/**
 * Load timeline data with validation and recovery
 */
export async function loadTimelineData(
  sceneId: string
): Promise<{ success: boolean; data?: TimelineDataPayload; error?: string; warnings?: string[] }> {
  try {
    const storageKey = getTimelineStorageKey(sceneId);
    const backupKey = getBackupStorageKey(sceneId);
    const legacyKey = `timeline-${sceneId}`; // Old format

    let dataStr = localStorage.getItem(storageKey);
    let isFromBackup = false;
    let isFromLegacy = false;

    // If primary data is missing, try backup
    if (!dataStr) {
      dataStr = localStorage.getItem(backupKey);
      isFromBackup = true;
    }

    // If backup is also missing, try legacy format
    if (!dataStr) {
      dataStr = localStorage.getItem(legacyKey);
      isFromLegacy = true;
      console.log(`📂 Found legacy timeline data for scene ${sceneId}, will migrate to new format`);
    }

    if (!dataStr) {
      return {
        success: false,
        error: 'No timeline data found'
      };
    }

    // Parse data
    let rawData: any;
    try {
      rawData = JSON.parse(dataStr);
    } catch (parseError) {
      // Try backup if primary data is corrupted
      if (!isFromBackup) {
        const backupDataStr = localStorage.getItem(backupKey);
        if (backupDataStr) {
          try {
            rawData = JSON.parse(backupDataStr);
            isFromBackup = true;
            console.warn(`Primary timeline data corrupted for scene ${sceneId}, using backup`);
          } catch (backupParseError) {
            return {
              success: false,
              error: 'Both primary and backup data are corrupted'
            };
          }
        } else {
          return {
            success: false,
            error: 'Primary data corrupted and no backup available'
          };
        }
      } else {
        return {
          success: false,
          error: 'Backup data is also corrupted'
        };
      }
    }

    // Validate loaded data
    const validation = validateTimelineData(rawData);

    if (!validation.isValid && !validation.canRecover) {
      return {
        success: false,
        error: `Data validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Use recovered data if validation found issues but can recover
    let finalData = rawData;
    if (validation.recoveredData) {
      finalData = { ...rawData, ...validation.recoveredData };
      console.warn(`Timeline data recovered for scene ${sceneId}:`, validation.warnings);
    }

    // If data is from legacy format, migrate it to new format
    if (isFromLegacy) {
      try {
        // Convert legacy format to new format
        const migratedData: TimelineDataPayload = {
          version: TIMELINE_DATA_VERSION,
          sceneId: sceneId,
          sceneIndex: finalData.sceneIndex || 0,
          originalDuration: finalData.originalDuration || 10,
          clips: finalData.clips || [],
          playhead: finalData.playhead || 0,
          edits: finalData.edits || {},
          metadata: {
            lastSaved: Date.now(),
            lastModified: finalData.lastSaved || Date.now(),
            saveCount: 1,
            checksum: generateChecksum({
              clips: finalData.clips || [],
              playhead: finalData.playhead || 0,
              edits: finalData.edits || {}
            })
          }
        };

        // Save migrated data to new format
        localStorage.setItem(storageKey, JSON.stringify(migratedData));

        // Remove legacy data
        localStorage.removeItem(legacyKey);

        console.log(`🔄 Migrated legacy timeline data for scene ${sceneId} to new format`);
        finalData = migratedData;
      } catch (migrationError) {
        console.warn(`Failed to migrate legacy data for scene ${sceneId}:`, migrationError);
        // Continue with legacy data if migration fails
      }
    }

    console.log(`📂 Timeline data loaded for scene ${sceneId}`, {
      clips: finalData.clips?.length || 0,
      playhead: finalData.playhead,
      saveCount: finalData.metadata?.saveCount || 0,
      fromBackup: isFromBackup,
      fromLegacy: isFromLegacy,
      hasWarnings: validation.warnings.length > 0
    });

    return {
      success: true,
      data: finalData,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to load timeline data:', error);

    return {
      success: false,
      error: `Load failed: ${errorMessage}`
    };
  }
}

/**
 * Delete timeline data for a scene
 */
export async function deleteTimelineData(
  sceneId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const storageKey = getTimelineStorageKey(sceneId);
    const backupKey = getBackupStorageKey(sceneId);

    localStorage.removeItem(storageKey);
    localStorage.removeItem(backupKey);

    // Dispatch sync event
    const syncEvent: SyncEvent = {
      type: 'delete',
      sceneId,
      timestamp: Date.now(),
      source: 'System'
    };

    window.dispatchEvent(new CustomEvent('timelineSync', {
      detail: syncEvent
    }));

    console.log(`🗑️ Timeline data deleted for scene ${sceneId}`);

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to delete timeline data:', error);

    return {
      success: false,
      error: `Delete failed: ${errorMessage}`
    };
  }
}
