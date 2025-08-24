import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { AnalyzedScene, NodeVideoSceneData } from '../types';
import SubtitleOverlay,{type SubtitleCue } from './SubtitleOverlay';
import './NodeTimeline.css';
import {
  saveTimelineData as saveTimelineDataRobust,
  loadTimelineData as loadTimelineDataRobust,
  createInitialClips as createInitialClipsRobust,
  validateTimelineData,
  type TimelineClip as TimelineClipRobust,
  type SceneEdits as SceneEditsRobust,
  type TimelineDataPayload
} from '../utils/timelineDataManager';
import { getSyncManager } from '../utils/timelineSyncManager';
import {
  getEffectiveVideoUrl,
  resolveVideoUrl,
  isSceneTranslated,
  getTranslationStatus,
  updateSceneWithTranslation,
  type TranslationUpdateData
} from '../utils/sceneTranslationManager';

// Node Timeline Types
interface NodeTimelineProps {
  scene: (AnalyzedScene & { aiProcessingResults?: NodeVideoSceneData['aiProcessingResults'] }) | null;
  videoUrl: string | null;
  analysisId: string | null;  // NEW: Add analysisId prop
  isOpen: boolean;
  onClose: () => void;
  onSave?: (edits: SceneEdits) => void;
}

interface SceneEdits {
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  textOverlays?: TextOverlay[];
  fadeIn?: number;
  fadeOut?: number;
  // Add timeline clip modifications
  clips?: Clip[];
  playhead?: number;
}

interface Clip {
  id: string;
  startTime: number;
  duration: number;
  mediaStart: number;
  mediaEnd: number;
  type: 'video' | 'audio' | 'text';
  selected: boolean;
}

interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

interface NodeTimelineState {
  playhead: number;
  isPlaying: boolean;
  zoomLevel: number;
  selectedClips: string[];
  edits: SceneEdits;
  currentTool: 'selection' | 'blade' | 'hand' | 'zoom';
  clips: Clip[];
  isDragging: boolean;
  dragType: 'move' | 'trim-start' | 'trim-end' | 'playhead' | null;
  dragStartX: number;
  dragStartTime: number;
  isPlayheadDragging: boolean;
}

interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  name: string;
  height: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

const NodeTimeline: React.FC<NodeTimelineProps> = ({
  scene,
  videoUrl,
  analysisId,  // NEW: Accept analysisId prop
  isOpen,
  onClose,
  onSave
}) => {
  // Early return if scene is null to prevent errors
  if (!scene) {
    return (
      <div className="node-timeline-error">
        <div className="error-message">
          <h3>Scene data not available</h3>
          <p>Unable to load timeline for this scene.</p>
        </div>
      </div>
    );
  }

  // Video ref for playback
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Component state
  const [state, setState] = useState<NodeTimelineState>({
    playhead: 0,
    isPlaying: false,
    zoomLevel: 1,
    selectedClips: [],
    edits: {},
    currentTool: 'selection',
    clips: [],
    isDragging: false,
    dragType: null,
    dragStartX: 0,
    dragStartTime: 0,
    isPlayheadDragging: false
  });

  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // Performance optimization state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [lastRenderTime, setLastRenderTime] = useState(0);
  const renderRequestRef = useRef<number | null>(null);
  const thumbnailCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const visibleClipsRef = useRef<Clip[]>([]);

  // Generate unique storage key for this scene's timeline data
  const getTimelineStorageKey = useCallback(() => {
    if (!scene) return null;
    return `timeline-${scene.sceneId || `scene-${scene.scene_index}`}`;
  }, [scene]);

  // Initialize sync manager
  const syncManager = useMemo(() => getSyncManager({ enableDebugLogging: true }), []);

  // Load subtitles from AI processing results
  useEffect(() => {
    if (scene?.aiProcessingResults?.['subtitle-generator']) {
      const subtitleResult = scene.aiProcessingResults['subtitle-generator'];

      // Check all possible subtitle locations in the result structure
      if (subtitleResult.result?.subtitles) {
        setSubtitles(subtitleResult.result.subtitles);
      } else if (Array.isArray(subtitleResult.result)) {
        setSubtitles(subtitleResult.result);
      } else if (subtitleResult.result?.result?.subtitles) {
        setSubtitles(subtitleResult.result.result.subtitles);
      }
    }
  }, [scene?.aiProcessingResults]);

  // Save timeline data using robust system
  const saveTimelineData = useCallback(async () => {
    if (!scene) return;

    try {
      const result = await saveTimelineDataRobust(
        scene,
        state.clips as TimelineClipRobust[],
        state.playhead,
        state.edits as SceneEditsRobust
      );

      if (result.success) {
        console.log('💾 Timeline data saved successfully');
        if (result.warnings && result.warnings.length > 0) {
          console.warn('Save warnings:', result.warnings);
        }
      } else {
        console.error('Failed to save timeline data:', result.error);
        // Could show user notification here
      }
    } catch (error) {
      console.error('Save operation failed:', error);
    }
  }, [scene, state.clips, state.playhead, state.edits]);

  // Load timeline data using robust system
  const loadTimelineData = useCallback(async () => {
    if (!scene) return null;

    try {
      const result = await loadTimelineDataRobust(scene.sceneId);

      if (result.success && result.data) {
        console.log('📂 Timeline data loaded successfully');
        if (result.warnings && result.warnings.length > 0) {
          console.warn('Load warnings:', result.warnings);
        }
        return result.data;
      } else {
        console.log('No timeline data found or load failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Load operation failed:', error);
      return null;
    }
  }, [scene]);

  // Viewport culling - only render visible clips for performance
  const getVisibleClips = useCallback((clips: Clip[], viewportStart: number, viewportEnd: number) => {
    return clips.filter(clip => {
      const clipEnd = clip.startTime + clip.duration;
      // Include clips that overlap with viewport (with small buffer for smooth scrolling)
      const buffer = 2; // 2 second buffer on each side
      return clipEnd >= (viewportStart - buffer) && clip.startTime <= (viewportEnd + buffer);
    });
  }, []);

  // Calculate viewport bounds based on zoom and scroll
  const getViewportBounds = useCallback(() => {
    if (!scene) return { start: 0, end: 0, width: 0 };

    const canvas = timelineCanvasRef.current;
    if (!canvas) return { start: 0, end: 0, width: 0 };

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);
    const scaledWidth = timelineWidth / zoomLevel;

    const viewportStart = (scrollOffset / timelineWidth) * scene.duration;
    const viewportDuration = (scaledWidth / timelineWidth) * scene.duration;
    const viewportEnd = viewportStart + viewportDuration;

    return {
      start: Math.max(0, viewportStart),
      end: Math.min(scene.duration, viewportEnd),
      width: scaledWidth
    };
  }, [scene, zoomLevel, scrollOffset]);

  // Frame rate limiting - cap at 60fps
  const scheduleRender = useCallback((renderFunction: () => void) => {
    const now = performance.now();
    const timeSinceLastRender = now - lastRenderTime;
    const targetFrameTime = 1000 / 60; // 60fps = ~16.67ms per frame

    if (renderRequestRef.current) {
      cancelAnimationFrame(renderRequestRef.current);
    }

    if (timeSinceLastRender >= targetFrameTime) {
      // Render immediately if enough time has passed
      renderFunction();
      setLastRenderTime(now);
    } else {
      // Schedule render for next frame
      const delay = targetFrameTime - timeSinceLastRender;
      renderRequestRef.current = requestAnimationFrame(() => {
        renderFunction();
        setLastRenderTime(performance.now());
      });
    }
  }, []); // Remove lastRenderTime from dependencies to prevent infinite loop

  // Thumbnail caching system for video clips
  const generateThumbnail = useCallback(async (clip: Clip, timeOffset: number = 0): Promise<HTMLCanvasElement | null> => {
    const cacheKey = `${clip.id}-${timeOffset.toFixed(2)}`;

    // Check cache first
    if (thumbnailCacheRef.current.has(cacheKey)) {
      return thumbnailCacheRef.current.get(cacheKey)!;
    }

    try {
      const videoElement = videoRef.current;
      if (!videoElement || !scene) return null;

      // Create thumbnail canvas
      const thumbnailCanvas = document.createElement('canvas');
      const thumbnailCtx = thumbnailCanvas.getContext('2d');
      if (!thumbnailCtx) return null;

      thumbnailCanvas.width = 60;
      thumbnailCanvas.height = 34;

      // Seek to thumbnail time
      const thumbnailTime = scene.start + clip.mediaStart + timeOffset;
      videoElement.currentTime = thumbnailTime;

      return new Promise((resolve) => {
        const handleSeeked = () => {
          try {
            // Draw video frame to thumbnail canvas
            thumbnailCtx.drawImage(videoElement, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

            // Cache the thumbnail
            thumbnailCacheRef.current.set(cacheKey, thumbnailCanvas);

            // Limit cache size to prevent memory issues
            if (thumbnailCacheRef.current.size > 100) {
              const firstKey = thumbnailCacheRef.current.keys().next().value;
              thumbnailCacheRef.current.delete(firstKey);
            }

            resolve(thumbnailCanvas);
          } catch (error) {
            console.warn('Failed to generate thumbnail:', error);
            resolve(null);
          } finally {
            videoElement.removeEventListener('seeked', handleSeeked);
          }
        };

        videoElement.addEventListener('seeked', handleSeeked, { once: true });

        // Fallback timeout
        setTimeout(() => {
          videoElement.removeEventListener('seeked', handleSeeked);
          resolve(null);
        }, 1000);
      });
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
      return null;
    }
  }, [scene]);

  // Preload thumbnails for visible clips
  const preloadThumbnails = useCallback(async (clips: Clip[]) => {
    const promises = clips.slice(0, 10).map(async (clip) => { // Limit to 10 clips at once
      if (clip.type === 'video') {
        await generateThumbnail(clip, 0);
        // Generate thumbnail at middle of clip too
        await generateThumbnail(clip, clip.duration / 2);
      }
    });

    await Promise.allSettled(promises);
  }, [generateThumbnail]);

  // Clip data virtualization - only keep visible clip data in memory
  const virtualizeClipData = useCallback((clips: Clip[]) => {
    const viewport = getViewportBounds();
    const visibleClips = getVisibleClips(clips, viewport.start, viewport.end);

    // Store visible clips for rendering
    visibleClipsRef.current = visibleClips;

    // Preload thumbnails for visible clips
    if (isVideoLoaded) {
      preloadThumbnails(visibleClips);
    }

    return visibleClips;
  }, [getViewportBounds, getVisibleClips, preloadThumbnails, isVideoLoaded]);

  // Compressed undo history using delta-based approach
  interface UndoHistoryEntry {
    timestamp: number;
    type: 'full' | 'delta';
    data: NodeTimelineState | Partial<NodeTimelineState>;
    compressed?: boolean;
  }

  const [compressedUndoHistory, setCompressedUndoHistory] = useState<UndoHistoryEntry[]>([]);
  const maxCompressedHistory = 50; // Increased limit due to compression

  // Create delta between two states
  const createStateDelta = useCallback((oldState: NodeTimelineState, newState: NodeTimelineState): Partial<NodeTimelineState> => {
    const delta: Partial<NodeTimelineState> = {};

    // Only include changed properties
    if (JSON.stringify(oldState.clips) !== JSON.stringify(newState.clips)) {
      delta.clips = newState.clips;
    }
    if (oldState.playhead !== newState.playhead) {
      delta.playhead = newState.playhead;
    }
    if (JSON.stringify(oldState.selectedClips) !== JSON.stringify(newState.selectedClips)) {
      delta.selectedClips = newState.selectedClips;
    }
    if (JSON.stringify(oldState.edits) !== JSON.stringify(newState.edits)) {
      delta.edits = newState.edits;
    }

    return delta;
  }, []);

  // Compress undo history by converting old full states to deltas
  const compressUndoHistory = useCallback((history: UndoHistoryEntry[]): UndoHistoryEntry[] => {
    if (history.length <= 10) return history; // Don't compress small histories

    const compressed: UndoHistoryEntry[] = [];
    let lastFullState: NodeTimelineState | null = null;

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];

      if (i === 0 || i % 10 === 0) {
        // Keep every 10th entry as full state
        compressed.push(entry);
        if (entry.type === 'full') {
          lastFullState = entry.data as NodeTimelineState;
        }
      } else if (entry.type === 'full' && lastFullState) {
        // Convert full state to delta
        const delta = createStateDelta(lastFullState, entry.data as NodeTimelineState);
        compressed.push({
          timestamp: entry.timestamp,
          type: 'delta',
          data: delta,
          compressed: true
        });
      } else {
        compressed.push(entry);
      }
    }

    return compressed;
  }, [createStateDelta]);

  // Auto-cleanup old localStorage data
  const cleanupOldTimelineData = useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      const timelineKeys = keys.filter(key => key.startsWith('timeline-'));
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago

      timelineKeys.forEach(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (data.lastSaved && data.lastSaved < cutoffTime) {
            localStorage.removeItem(key);
            console.log('🧹 Cleaned up old timeline data:', key);
          }
        } catch (error) {
          // Remove corrupted data
          localStorage.removeItem(key);
          console.log('🧹 Removed corrupted timeline data:', key);
        }
      });
    } catch (error) {
      console.warn('Failed to cleanup old timeline data:', error);
    }
  }, []);

  // Run cleanup on component mount and unmount
  useEffect(() => {
    cleanupOldTimelineData();

    // Cleanup on unmount
    return () => {
      // Cancel any pending render requests
      if (renderRequestRef.current) {
        cancelAnimationFrame(renderRequestRef.current);
      }

      // Clear thumbnail cache to free memory
      thumbnailCacheRef.current.clear();

      // Clear visible clips reference
      visibleClipsRef.current = [];

      console.log('🧹 NodeTimeline cleanup completed');
    };
  }, [cleanupOldTimelineData]);

  // Auto-save timeline data when clips change (optimized with debouncing)
  useEffect(() => {
    if (state.clips.length > 0 && isVideoLoaded && scene) {
      const timeoutId = setTimeout(() => {
        saveTimelineData().catch(error => {
          console.error('Auto-save failed:', error);
        });
      }, 2000); // Increased to 2 seconds for better performance
      return () => clearTimeout(timeoutId);
    }
  }, [state.clips, state.playhead, state.edits, isVideoLoaded, scene, saveTimelineData]);

  // Optimized track configuration - content only on V1 and A1, V2 and A2 available for future layers
  const tracks: Track[] = [
    { id: 'v2', type: 'video', name: 'V2', height: 35, muted: false, locked: false, visible: true },
    { id: 'v1', type: 'video', name: 'V1', height: 35, muted: false, locked: false, visible: true },
    { id: 'a2', type: 'audio', name: 'A2', height: 35, muted: false, locked: false, visible: true },
    { id: 'a1', type: 'audio', name: 'A1', height: 35, muted: false, locked: false, visible: true },
    { id: 't2', type: 'text', name: 'T2', height: 30, muted: false, locked: false, visible: true },
    { id: 't1', type: 'text', name: 'T1', height: 30, muted: false, locked: false, visible: true }
  ];

  // Enhanced video source determination using utility functions
  const determineVideoSource = useCallback(() => {
    if (!scene) return null;

    const effectiveUrl = getEffectiveVideoUrl(scene, videoUrl);
    const translationStatus = getTranslationStatus(scene);

    let sourceType: string = 'unknown';
    if (translationStatus.isTranslated) {
      sourceType = 'translated';
    } else if (scene.proxy_video_url) {
      sourceType = 'proxy';
    } else {
      sourceType = 'original';
    }

    console.log('NodeTimeline: Video source determination:', {
      sceneId: scene.sceneId,
      effectiveUrl,
      sourceType,
      isTranslated: translationStatus.isTranslated,
      targetLanguage: translationStatus.targetLanguage
    });

    return { url: effectiveUrl, type: sourceType };
  }, [scene, videoUrl]);

  // Initialize video when scene changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene) {
      console.log('NodeTimeline: Missing dependencies:', { videoElement: !!videoElement, scene: !!scene });
      return;
    }

    const videoSource = determineVideoSource();
    if (!videoSource?.url) {
      console.warn('NodeTimeline: No valid video source found for scene:', scene.sceneId);
      return;
    }

    const effectiveVideoUrl = videoSource.url;
    console.log(`NodeTimeline: Setting up video for scene ${scene.sceneId} using ${videoSource.type} source:`, effectiveVideoUrl);

    setIsVideoLoaded(false);
    setState(prev => ({ ...prev, playhead: 0, isPlaying: false }));

    // Set video source with error handling
    if (videoElement.src !== effectiveVideoUrl) {
      videoElement.src = effectiveVideoUrl;
    }

    const handleLoadedMetadata = () => {
      console.log('NodeTimeline: Video metadata loaded');
      setVideoDuration(scene.duration);
      setIsVideoLoaded(true);

      // Determine start time based on video source type
      // Translated videos and proxy videos start at 0 (already trimmed to scene)
      // Original videos start at scene.start
      const isTranslatedOrProxy = (scene as any).translatedVideoUrl || scene.proxy_video_url;
      const startTime = isTranslatedOrProxy ? 0 : scene.start;
      videoElement.currentTime = startTime;

      console.log('NodeTimeline: Video start time set to:', startTime,
                  isTranslatedOrProxy ? '(translated/proxy video)' : '(original video)');

      // Try to load saved timeline data first
      const loadAndInitialize = async () => {
        const savedData = await loadTimelineData();

        if (savedData && savedData.clips && savedData.clips.length > 0) {
          // Restore saved timeline state
          console.log('🔄 Restoring saved timeline data');
          setState(prev => ({
            ...prev,
            clips: savedData.clips as Clip[],
            playhead: savedData.playhead || 0,
            edits: savedData.edits || {}
          }));
        } else {
          // Initialize clips for the scene on V1 and A1 tracks (first time)
          console.log('🆕 Creating initial timeline clips');
          const initialClips = createInitialClipsRobust(scene) as Clip[];
          setState(prev => ({ ...prev, clips: initialClips }));
        }
      };

      loadAndInitialize().catch(error => {
        console.error('Failed to load timeline data, using defaults:', error);
        // Fallback to default clips
        const initialClips = createInitialClipsRobust(scene) as Clip[];
        setState(prev => ({ ...prev, clips: initialClips }));
      });
    };

    const handleTimeUpdate = () => {
      if (videoElement && scene) {
        const currentVideoTime = videoElement.currentTime;

        // Calculate timeline position based on video source type
        let timelinePosition;
        const isTranslatedOrProxy = (scene as any).translatedVideoUrl || scene.proxy_video_url;

        if (isTranslatedOrProxy) {
          // Translated/Proxy video: direct mapping (already trimmed to scene, starts at 0)
          timelinePosition = Math.max(0, Math.min(currentVideoTime, scene.duration));
        } else {
          // Original video: subtract scene start time
          const sceneRelativeTime = currentVideoTime - scene.start;
          timelinePosition = Math.max(0, Math.min(sceneRelativeTime, scene.duration));
        }

        // Check if we've reached the end of the scene
        if (timelinePosition >= scene.duration) {
          videoElement.pause();
          setState(prev => ({ ...prev, isPlaying: false, playhead: scene.duration }));
          console.log('End of scene reached, pausing');
          return;
        }

        // Update playhead to timeline position
        setState(prev => ({ ...prev, playhead: timelinePosition }));
      }
    };

    const handlePlay = () => setState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => setState(prev => ({ ...prev, isPlaying: false }));

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [scene, videoUrl, loadTimelineData, determineVideoSource]);

  // Enhanced volume controls with audio sync awareness
  const [currentVolume, setCurrentVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(100);
  const [isManuallyMuted, setIsManuallyMuted] = useState(false); // Track manual mute state
  const [isVideoInGap, setIsVideoInGap] = useState(false); // Track when video is in a gap (no video clip)
  const [preloadedVideos, setPreloadedVideos] = useState<Map<string, HTMLVideoElement>>(new Map()); // Preloaded video elements for smooth transitions
  const [initialVideoPreloaded, setInitialVideoPreloaded] = useState(false); // Track if initial video is preloaded

  // Audio synchronization system - respects timeline audio clip modifications
  const getActiveAudioClipAt = useCallback((timelineTime: number) => {
    const audioClips = state.clips.filter(clip => clip.type === 'audio');
    return audioClips.find(clip =>
      timelineTime >= clip.startTime &&
      timelineTime < clip.startTime + clip.duration
    );
  }, [state.clips]);

  const shouldAudioBePlaying = useCallback((timelineTime: number) => {
    const activeAudioClip = getActiveAudioClipAt(timelineTime);
    return !!activeAudioClip; // Returns true if there's an audio clip at this position
  }, [getActiveAudioClipAt]);

  // Enhanced video synchronization system with smart gap detection
  const getActiveVideoClipAt = useCallback((timelineTime: number) => {
    const timelineTimeMs = timelineTime * 1000; // Convert to milliseconds
    const videoClips = state.clips.filter(clip => clip.type === 'video');

    return videoClips.find(clip => {
      // For mezzanine segments, use display.from/to (in milliseconds)
      if (clip.display && clip.display.from !== undefined && clip.display.to !== undefined) {
        return timelineTimeMs >= clip.display.from && timelineTimeMs < clip.display.to;
      }
      // For regular clips, use startTime/duration (in seconds)
      return timelineTime >= clip.startTime && timelineTime < clip.startTime + clip.duration;
    });
  }, [state.clips]);

  // Calculate the effective content duration (last video clip end time)
  const getEffectiveContentDuration = useCallback(() => {
    const videoClips = state.clips.filter(clip => clip.type === 'video');
    if (videoClips.length === 0) return 0;

    const lastClipEnd = Math.max(...videoClips.map(clip => clip.startTime + clip.duration));
    return lastClipEnd;
  }, [state.clips]);

  // Smart gap detection - only detect gaps BETWEEN content, not at the end
  const isInContentGap = useCallback((timelineTime: number) => {
    const videoClips = state.clips.filter(clip => clip.type === 'video');
    if (videoClips.length === 0) return false;

    const effectiveContentDuration = getEffectiveContentDuration();

    // If we're beyond the last video content, it's not a gap - it's natural end
    if (timelineTime >= effectiveContentDuration) {
      return false;
    }

    // Check if there's a video clip at this position
    const activeVideoClip = getActiveVideoClipAt(timelineTime);

    // If no clip at this position AND we're within content duration, it's a true gap
    return !activeVideoClip;
  }, [state.clips, getEffectiveContentDuration, getActiveVideoClipAt]);

  const shouldVideoBePlaying = useCallback((timelineTime: number) => {
    const activeVideoClip = getActiveVideoClipAt(timelineTime);
    return !!activeVideoClip; // Returns true if there's a video clip at this position
  }, [getActiveVideoClipAt]);

  // Preload next mezzanine segment for seamless transitions
  const preloadNextMezzanineSegment = useCallback((currentTimelineTime: number) => {
    const timelineTimeMs = currentTimelineTime * 1000;
    const videoClips = state.clips.filter(clip =>
      clip.type === 'video' && clip.metadata?.isMezzanineSegment
    );

    // Sort clips by timeline position
    const sortedClips = videoClips.sort((a, b) => a.display.from - b.display.from);

    // Find current clip and next clip
    const currentClipIndex = sortedClips.findIndex(clip =>
      timelineTimeMs >= clip.display.from && timelineTimeMs < clip.display.to
    );

    if (currentClipIndex >= 0 && currentClipIndex < sortedClips.length - 1) {
      const nextClip = sortedClips[currentClipIndex + 1];
      const nextVideoSrc = nextClip.details.src;

      // Check if we're close to the end of current segment (within 2 seconds)
      const currentClip = sortedClips[currentClipIndex];
      const timeUntilNextSegment = (currentClip.display.to - timelineTimeMs) / 1000;

      if (timeUntilNextSegment <= 2 && !preloadedVideos.has(nextVideoSrc)) {
        console.log('🎬 PRELOAD: Loading next mezzanine segment:', nextVideoSrc);

        // Create and preload next video element
        const preloadVideo = document.createElement('video');
        preloadVideo.src = nextVideoSrc;
        preloadVideo.preload = 'auto';
        preloadVideo.muted = true; // Mute preload video

        // Add to preloaded videos map
        setPreloadedVideos(prev => new Map(prev.set(nextVideoSrc, preloadVideo)));

        // Clean up old preloaded videos (keep only 2 most recent)
        setPreloadedVideos(prev => {
          if (prev.size > 2) {
            const entries = Array.from(prev.entries());
            const oldestEntry = entries[0];
            oldestEntry[1].src = ''; // Clear source to free memory
            prev.delete(oldestEntry[0]);
          }
          return new Map(prev);
        });
      }
    }
  }, [state.clips, preloadedVideos]);

  // Preload initial mezzanine segment to prevent black frames on first play
  const preloadInitialMezzanineSegment = useCallback(() => {
    if (initialVideoPreloaded) return;

    const mezzanineClips = state.clips.filter(clip =>
      clip.type === 'video' && clip.metadata?.isMezzanineSegment
    );

    if (mezzanineClips.length === 0) return;

    // Sort by timeline position and get the first segment
    const sortedClips = mezzanineClips.sort((a, b) => a.display.from - b.display.from);
    const firstSegment = sortedClips[0];

    if (firstSegment) {
      console.log('🎬 PRELOAD: Loading initial mezzanine segment for smooth first play:', firstSegment.details.src);

      // Preload the first segment in the main video element
      const videoElement = videoRef.current;
      if (videoElement && videoElement.src !== firstSegment.details.src) {
        videoElement.src = firstSegment.details.src;
        videoElement.preload = 'auto';
        videoElement.currentTime = 0;

        const handleInitialLoad = () => {
          setInitialVideoPreloaded(true);
          console.log('🎬 PRELOAD: Initial mezzanine segment loaded successfully');
          videoElement.removeEventListener('loadedmetadata', handleInitialLoad);
        };

        videoElement.addEventListener('loadedmetadata', handleInitialLoad);
      }
    }
  }, [state.clips, initialVideoPreloaded]);

  // Audio control system - mutes/unmutes based on timeline audio clips
  const updateAudioPlayback = useCallback((timelineTime: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Don't override manual mute - user has manually muted the video
    if (isManuallyMuted) {
      console.log('🔇 Audio sync skipped - user has manually muted');
      return;
    }

    const shouldPlayAudio = shouldAudioBePlaying(timelineTime);
    const isCurrentlyMuted = videoElement.muted;

    if (shouldPlayAudio && isCurrentlyMuted) {
      // Unmute: there's an audio clip at current position
      videoElement.muted = false;
      // Audio unmuted - clip present
    } else if (!shouldPlayAudio && !isCurrentlyMuted) {
      // Mute: no audio clip at current position (gap/deleted segment)
      videoElement.muted = true;
    }

    // Removed excessive audio debug logging for performance
  }, [shouldAudioBePlaying, isManuallyMuted, getActiveAudioClipAt]);

  // Enhanced video control system with smart gap detection and seamless mezzanine transitions
  const updateVideoPlayback = useCallback((timelineTime: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const effectiveContentDuration = getEffectiveContentDuration();
    const isInGap = isInContentGap(timelineTime);
    const wasInGap = isVideoInGap;

    // Check if we've reached the natural end of content
    if (timelineTime >= effectiveContentDuration) {
      // Natural end of content - pause video but don't show gap overlay
      if (!videoElement.paused) {
        videoElement.pause();
        setState(prev => ({ ...prev, isPlaying: false }));
        console.log('🎬 VIDEO: Reached end of content at', timelineTime.toFixed(2), 's (content ends at', effectiveContentDuration.toFixed(2), 's)');
      }
      // Clear gap state if we were in one
      if (wasInGap) {
        setIsVideoInGap(false);
      }
      return;
    }

    // Handle mezzanine segment transitions for seamless playback
    const currentVideoClip = getActiveVideoClipAt(timelineTime);
    if (currentVideoClip && currentVideoClip.metadata?.isMezzanineSegment) {
      // Preload next segment for smooth transitions
      preloadNextMezzanineSegment(timelineTime);

      // Check if we need to switch to a different mezzanine segment
      const currentVideoSrc = videoElement.src;
      const expectedVideoSrc = currentVideoClip.details.src;

      if (currentVideoSrc !== expectedVideoSrc) {
        // We need to switch to a different mezzanine segment
        console.log('🎬 MEZZANINE TRANSITION: Switching from', currentVideoSrc, 'to', expectedVideoSrc);

        // Calculate the exact time within the new segment
        const segmentStartTime = currentVideoClip.display.from / 1000; // Convert to seconds
        const timeWithinSegment = Math.max(0, timelineTime - segmentStartTime);

        // Check if we have a preloaded video for this source
        const preloadedVideo = preloadedVideos.get(expectedVideoSrc);

        if (preloadedVideo && preloadedVideo.readyState >= 2) {
          // Use preloaded video for instant transition
          console.log('🎬 MEZZANINE TRANSITION: Using preloaded video for instant switch');

          // Copy properties from preloaded video
          videoElement.src = expectedVideoSrc;
          videoElement.currentTime = timeWithinSegment;

          // Resume playback immediately if it was playing
          if (state.isPlaying && !isInGap) {
            videoElement.play().catch(console.error);
          }

          // Remove used preloaded video
          setPreloadedVideos(prev => {
            const newMap = new Map(prev);
            newMap.delete(expectedVideoSrc);
            return newMap;
          });
        } else {
          // Fallback to regular loading with optimized timing
          const wasPlaying = state.isPlaying && !isInGap;

          // Pause current playback to prevent audio glitches during switch
          if (wasPlaying) {
            videoElement.pause();
          }

          videoElement.src = expectedVideoSrc;

          // Use loadeddata event for faster response than loadedmetadata
          const handleSegmentSwitch = () => {
            videoElement.currentTime = timeWithinSegment;

            // Resume playback if it was playing
            if (wasPlaying) {
              videoElement.play().catch(console.error);
            }

            videoElement.removeEventListener('loadeddata', handleSegmentSwitch);
          };

          videoElement.addEventListener('loadeddata', handleSegmentSwitch);
        }
        return; // Exit early to let the segment switch complete
      }
    }

    // Handle true content gaps (deleted segments in the middle)
    if (isInGap && !wasInGap) {
      // Entering a true gap - pause video and show gap state
      videoElement.pause();
      setIsVideoInGap(true);
      setState(prev => ({ ...prev, isPlaying: false }));
      console.log('🎬 VIDEO SYNC: Paused - content gap detected at timeline position:', timelineTime);
    } else if (!isInGap && wasInGap) {
      // Exiting a gap - resume video if it was playing before
      setIsVideoInGap(false);
      console.log('🎬 VIDEO SYNC: Resumed - exited content gap at timeline position:', timelineTime);
    }

  }, [shouldVideoBePlaying, isVideoInGap, getEffectiveContentDuration, isInContentGap, getActiveVideoClipAt, state.isPlaying, preloadNextMezzanineSegment, preloadedVideos]);

  // Simplified playback controls
  const togglePlayback = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene) return;

    if (state.isPlaying) {
      videoElement.pause();
    } else {
      // Calculate video time based on video source type
      let videoTime;
      const isTranslatedOrProxy = (scene as any).translatedVideoUrl || scene.proxy_video_url;

      if (isTranslatedOrProxy) {
        // Translated/Proxy video: direct mapping (starts at 0, already trimmed)
        videoTime = state.playhead;
      } else {
        // Original video: add scene start time
        videoTime = scene.start + state.playhead;
      }
      videoElement.currentTime = videoTime;

      // Apply audio and video synchronization when starting playback
      updateAudioPlayback(state.playhead);
      updateVideoPlayback(state.playhead);

      // Only start playing if there's a video clip at current position
      const shouldPlayVideo = shouldVideoBePlaying(state.playhead);
      if (shouldPlayVideo) {
        videoElement.play().catch(console.error);
      } else {
        // Cannot start playback - no video clip at timeline position
      }
    }
  }, [state.isPlaying, state.playhead, scene, updateAudioPlayback, updateVideoPlayback, shouldVideoBePlaying]);

  // Enhanced time update handler with audio synchronization
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene || !isVideoLoaded) return;

    const handleTimeUpdateWithAudio = () => {
      if (videoElement && scene) {
        const currentVideoTime = videoElement.currentTime;
        const sceneRelativeTime = currentVideoTime - scene.start;

        // Direct mapping: video time to timeline position
        const timelinePosition = Math.max(0, Math.min(sceneRelativeTime, scene.duration));

        // Check if we've reached the end of the scene OR the end of content
        const effectiveContentDuration = getEffectiveContentDuration();
        const effectiveEndTime = Math.min(scene.duration, effectiveContentDuration);

        if (sceneRelativeTime >= scene.duration) {
          videoElement.pause();
          setState(prev => ({ ...prev, isPlaying: false, playhead: scene.duration }));
          console.log('End of scene reached, pausing');
          return;
        }

        // Also check if we've reached the end of actual content
        if (sceneRelativeTime >= effectiveContentDuration && effectiveContentDuration < scene.duration) {
          videoElement.pause();
          setState(prev => ({ ...prev, isPlaying: false, playhead: effectiveContentDuration }));
          console.log('End of content reached at', effectiveContentDuration.toFixed(2), 's, pausing');
          return;
        }

        // Update audio and video playback based on timeline clips
        updateAudioPlayback(timelinePosition);
        updateVideoPlayback(timelinePosition);

        // Update playhead to timeline position
        setState(prev => ({ ...prev, playhead: timelinePosition }));
      }
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdateWithAudio);
    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdateWithAudio);
    };
  }, [scene, isVideoLoaded, updateAudioPlayback, updateVideoPlayback]);

  // Preload initial mezzanine segment when clips change
  useEffect(() => {
    const mezzanineClips = state.clips.filter(clip =>
      clip.type === 'video' && clip.metadata?.isMezzanineSegment
    );

    if (mezzanineClips.length > 0 && !initialVideoPreloaded) {
      // Small delay to ensure timeline is ready
      const timer = setTimeout(() => {
        preloadInitialMezzanineSegment();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [state.clips, initialVideoPreloaded, preloadInitialMezzanineSegment]);

  // Listen for mezzanine segment checks from the loader
  useEffect(() => {
    const handleMezzanineCheck = (event: CustomEvent) => {
      const { analysisId, callback } = event.detail;

      // Check if this is for our current analysis
      if (analysisId && analysisId === scene?.sceneId) {
        const mezzanineSegments = state.clips.filter(clip =>
          clip.type === 'video' && clip.metadata?.isMezzanineSegment
        );

        console.log(`🔍 Mezzanine check: Found ${mezzanineSegments.length} existing segments`);
        callback(mezzanineSegments);
      }
    };

    window.addEventListener('getMezzanineSegments', handleMezzanineCheck as EventListener);

    return () => {
      window.removeEventListener('getMezzanineSegments', handleMezzanineCheck as EventListener);
    };
  }, [state.clips, scene?.sceneId]);

  // Cleanup preloaded videos on unmount
  useEffect(() => {
    return () => {
      // Clean up all preloaded video elements
      preloadedVideos.forEach((video, src) => {
        video.src = ''; // Clear source to free memory
        console.log('🧹 Cleaned up preloaded video:', src);
      });
      setPreloadedVideos(new Map());
    };
  }, []); // Remove preloadedVideos from dependencies to prevent infinite loop

  // Enhanced translation event handling with better error handling and URL resolution
  useEffect(() => {
    console.log(`🎧 NodeTimeline: Setting up translation event listener for scene ${scene?.sceneId}`);

    const handleVideoTranslationCompleted = (event: CustomEvent) => {
      console.log(`🌐 NodeTimeline: Received video-translation-completed event:`, event.detail);
      const { sceneId, translatedVideoUrl, translationInfo } = event.detail;

      if (sceneId === scene?.sceneId) {
        console.log(`🎯 NodeTimeline: Event matches current scene ${sceneId}`);
        console.log(`🎬 Raw translated video URL: ${translatedVideoUrl}`);

        // Validate and resolve the translated video URL
        const resolvedTranslatedUrl = resolveVideoUrl(translatedVideoUrl);
        if (!resolvedTranslatedUrl) {
          console.error('❌ NodeTimeline: Failed to resolve translated video URL:', translatedVideoUrl);
          return;
        }

        console.log(`🎬 Resolved translated video URL: ${resolvedTranslatedUrl}`);

        // Update scene data using the translation manager utility
        if (scene && typeof scene === 'object') {
          const translationData: TranslationUpdateData = {
            translatedVideoUrl: resolvedTranslatedUrl,
            targetLanguage: translationInfo.targetLanguage,
            originalLanguage: translationInfo.originalLanguage,
            voice: translationInfo.voice,
            processingTime: translationInfo.processingTime,
            agentId: translationInfo.agentId
          };

          // Update the scene object in place
          Object.assign(scene, updateSceneWithTranslation(scene, translationData));
        }

        // Force video reload with new translated URL
        const videoElement = videoRef.current;
        if (videoElement) {
          console.log('🔄 NodeTimeline: Reloading video with translated version');
          setIsVideoLoaded(false);
          setState(prev => ({ ...prev, playhead: 0, isPlaying: false }));

          // Update video source to translated version
          videoElement.src = resolvedTranslatedUrl;
          videoElement.load(); // Force reload

          const handleTranslatedVideoLoad = () => {
            console.log('✅ NodeTimeline: Translated video loaded successfully');
            setIsVideoLoaded(true);
            videoElement.removeEventListener('loadedmetadata', handleTranslatedVideoLoad);

            // Trigger a re-render to update UI with translation status
            setState(prev => ({ ...prev, playhead: prev.playhead }));
          };

          const handleTranslatedVideoError = (error: Event) => {
            console.error('❌ NodeTimeline: Failed to load translated video:', error);
            videoElement.removeEventListener('error', handleTranslatedVideoError);
            videoElement.removeEventListener('loadedmetadata', handleTranslatedVideoLoad);

            // Fallback to original video source
            console.log('🔄 NodeTimeline: Falling back to original video source');
            const fallbackSource = determineVideoSource();
            if (fallbackSource?.url && fallbackSource.url !== resolvedTranslatedUrl) {
              videoElement.src = fallbackSource.url;
              videoElement.load();
            }
          };

          videoElement.addEventListener('loadedmetadata', handleTranslatedVideoLoad);
          videoElement.addEventListener('error', handleTranslatedVideoError);
        }
      } else {
        console.log(`⚠️ NodeTimeline: Event for scene ${sceneId} doesn't match current scene ${scene?.sceneId}`);
      }
    };

    window.addEventListener('video-translation-completed', handleVideoTranslationCompleted as EventListener);

    return () => {
      console.log(`🎧 NodeTimeline: Removing translation event listener for scene ${scene?.sceneId}`);
      window.removeEventListener('video-translation-completed', handleVideoTranslationCompleted as EventListener);
    };
  }, [scene?.sceneId, setState, determineVideoSource]);

  // Enhanced seeking with effective content duration awareness
  const seekToTime = useCallback((timelineTime: number) => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene) return;

    // Get effective content duration for smart clamping
    const effectiveContentDuration = getEffectiveContentDuration();
    const maxSeekTime = Math.min(scene.duration, effectiveContentDuration || scene.duration);

    // Clamp timeline time to effective content range
    const clampedTimelineTime = Math.max(0, Math.min(timelineTime, maxSeekTime));

    // Calculate video time based on video source type
    let videoTime;
    const isTranslatedOrProxy = (scene as any).translatedVideoUrl || scene.proxy_video_url;

    if (isTranslatedOrProxy) {
      // Translated/Proxy video: direct mapping (starts at 0, already trimmed)
      videoTime = clampedTimelineTime;
    } else {
      // Original video: add scene start time
      videoTime = scene.start + clampedTimelineTime;
    }

    videoElement.currentTime = videoTime;

    // Apply audio and video synchronization when seeking
    updateAudioPlayback(clampedTimelineTime);
    updateVideoPlayback(clampedTimelineTime);

    setState(prev => ({ ...prev, playhead: clampedTimelineTime }));
  }, [scene, updateAudioPlayback, updateVideoPlayback, getEffectiveContentDuration]);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const volume = parseFloat(event.target.value);
    const normalizedVolume = volume / 100;

    videoElement.volume = normalizedVolume;
    setCurrentVolume(volume);

    if (volume === 0) {
      // Volume set to 0 - enable manual mute
      videoElement.muted = true;
      setIsMuted(true);
      setIsManuallyMuted(true);
      console.log('🔇 Volume set to 0 - audio sync disabled');
    } else {
      // Volume > 0 - disable manual mute and re-enable audio sync
      videoElement.muted = false;
      setIsMuted(false);
      setIsManuallyMuted(false);
      console.log('🔊 Volume restored - audio sync re-enabled');
    }

    setState(prev => ({ ...prev, edits: { ...prev.edits, volume } }));
  }, []);

  const toggleMute = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isMuted) {
      // Unmute: restore previous volume and disable manual mute
      const volumeToRestore = previousVolume > 0 ? previousVolume : 50;
      videoElement.volume = volumeToRestore / 100;
      videoElement.muted = false;
      setCurrentVolume(volumeToRestore);
      setIsMuted(false);
      setIsManuallyMuted(false); // Re-enable audio sync
      console.log('🔊 Manual unmute - audio sync re-enabled');
    } else {
      // Mute: save current volume, mute video, and enable manual mute
      setPreviousVolume(currentVolume);
      videoElement.volume = 0;
      videoElement.muted = true;
      setCurrentVolume(0);
      setIsMuted(true);
      setIsManuallyMuted(true); // Disable audio sync
      console.log('🔇 Manual mute - audio sync disabled');
    }
  }, [isMuted, currentVolume, previousVolume]);

  const adjustVolume = useCallback((delta: number) => {
    const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.volume = newVolume / 100;
    setCurrentVolume(newVolume);

    if (newVolume === 0) {
      // Volume adjusted to 0 - enable manual mute
      videoElement.muted = true;
      setIsMuted(true);
      setIsManuallyMuted(true);
    } else {
      // Volume > 0 - disable manual mute and re-enable audio sync
      videoElement.muted = false;
      setIsMuted(false);
      setIsManuallyMuted(false);
    }

    setState(prev => ({ ...prev, edits: { ...prev.edits, volume: newVolume } }));
  }, [currentVolume]);

  // Clip selection and manipulation
  const selectClip = useCallback((clipId: string, addToSelection = false) => {
    setState(prev => ({
      ...prev,
      selectedClips: addToSelection
        ? prev.selectedClips.includes(clipId)
          ? prev.selectedClips.filter(id => id !== clipId)
          : [...prev.selectedClips, clipId]
        : [clipId],
      clips: prev.clips.map(clip => ({
        ...clip,
        selected: addToSelection
          ? clip.id === clipId ? !clip.selected : clip.selected
          : clip.id === clipId
      }))
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedClips: [],
      clips: prev.clips.map(clip => ({ ...clip, selected: false }))
    }));
  }, []);

  // Enhanced undo system with compression - moved before functions that use it
  const [undoHistory, setUndoHistory] = useState<NodeTimelineState[]>([]);
  const maxUndoHistory = 20; // Keep original for compatibility

  // Save state to compressed undo history
  const saveToUndoHistory = useCallback((currentState: NodeTimelineState) => {
    setUndoHistory(prev => {
      const newHistory = [currentState, ...prev];
      const trimmedHistory = newHistory.slice(0, maxUndoHistory);

      // Compress history periodically to save memory
      if (trimmedHistory.length >= maxUndoHistory) {
        const entry: UndoHistoryEntry = {
          timestamp: Date.now(),
          type: 'full',
          data: currentState
        };

        setCompressedUndoHistory(prevCompressed => {
          const newCompressed = [entry, ...prevCompressed];
          return compressUndoHistory(newCompressed);
        });
      }

      return trimmedHistory;
    });
  }, [maxUndoHistory, compressUndoHistory]);

  // Enhanced undo functionality with compressed history support
  const performUndo = useCallback(() => {
    if (undoHistory.length === 0) {
      console.log('No undo history available');
      return;
    }

    const previousState = undoHistory[0];
    const remainingHistory = undoHistory.slice(1);

    console.log('🔄 Undoing operation, restoring state');

    setState(previousState);
    setUndoHistory(remainingHistory);
  }, [undoHistory]);

  // Delete functionality
  const deleteSelectedClips = useCallback(() => {
    const selectedClipIds = state.selectedClips;
    if (selectedClipIds.length === 0) return;

    // Save current state to undo history before deletion
    saveToUndoHistory(state);

    console.log('Deleting selected clips:', selectedClipIds);

    setState(prev => ({
      ...prev,
      clips: prev.clips.filter(clip => !selectedClipIds.includes(clip.id)),
      selectedClips: []
    }));

    console.log(`🗑️ Deleted ${selectedClipIds.length} clip(s)`);
  }, [state, saveToUndoHistory]);

  // Check if any clips are selected for delete button visibility
  const hasSelectedClips = state.selectedClips.length > 0;

  // Clip trimming functionality
  const startTrimming = useCallback((clipId: string, trimType: 'trim-start' | 'trim-end', startX: number) => {
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;

    setState(prev => ({
      ...prev,
      isDragging: true,
      dragType: trimType,
      dragStartX: startX,
      dragStartTime: trimType === 'trim-start' ? clip.startTime : clip.startTime + clip.duration
    }));
  }, [state.clips]);

  const updateTrimming = useCallback((currentCanvasX: number) => {
    if (!state.isDragging || !state.dragType || !scene) return;

    const canvas = timelineCanvasRef.current;
    if (!canvas) return;

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);
    const deltaX = currentCanvasX - state.dragStartX;
    const deltaTime = (deltaX / timelineWidth) * scene.duration;

    // Removed trimming update logging to reduce console spam

    setState(prev => ({
      ...prev,
      clips: prev.clips.map(clip => {
        // Only update selected clips
        if (!clip.selected) return clip;

        if (prev.dragType === 'trim-start') {
          // Trimming the start of the clip
          const originalStartTime = clip.startTime;
          const newStartTime = Math.max(0, Math.min(clip.startTime + clip.duration - 0.1, originalStartTime + deltaTime));
          const trimAmount = newStartTime - originalStartTime;
          const newDuration = clip.duration - trimAmount;
          const newMediaStart = clip.mediaStart + trimAmount;

          console.log('Trim start:', {
            originalStartTime,
            newStartTime,
            trimAmount,
            newDuration,
            newMediaStart
          });

          return {
            ...clip,
            startTime: newStartTime,
            duration: newDuration,
            mediaStart: newMediaStart,
            mediaEnd: newMediaStart + newDuration
          };
        } else if (prev.dragType === 'trim-end') {
          // Trimming the end of the clip
          const newDuration = Math.max(0.1, Math.min(scene.duration - clip.startTime, clip.duration + deltaTime));
          const newMediaEnd = clip.mediaStart + newDuration;

          console.log('Trim end:', {
            originalDuration: clip.duration,
            newDuration,
            newMediaEnd
          });

          return {
            ...clip,
            duration: newDuration,
            mediaEnd: newMediaEnd
          };
        }
        return clip;
      })
    }));
  }, [state.isDragging, state.dragType, state.dragStartX, scene]);

  // NEW: Save trimmed scene to backend (moved before stopTrimming to fix hoisting issue)
  const saveTrimmedScene = useCallback(async (forcesSave: boolean = false) => {
    console.log('🎬 TRIM: saveTrimmedScene called', { forcesSave });

    if (!scene || !scene.sceneId || !analysisId) {
      console.warn('🎬 TRIM: Cannot save trimmed scene: missing required data', {
        scene: !!scene,
        sceneId: scene?.sceneId,
        analysisId: !!analysisId
      });
      return;
    }

    try {
      // Calculate the effective trim from the timeline clips
      const videoClips = state.clips.filter(clip => clip.type === 'video');
      console.log('🎬 TRIM: Found video clips:', videoClips.length, videoClips.map(c => ({ id: c.id, start: c.startTime, duration: c.duration })));

      if (videoClips.length === 0) {
        console.warn('🎬 TRIM: No video clips found to calculate trim');
        return;
      }

      // Find the earliest start and latest end of video clips
      const earliestStart = Math.min(...videoClips.map(clip => clip.startTime));
      const latestEnd = Math.max(...videoClips.map(clip => clip.startTime + clip.duration));

      // Calculate trim relative to the current scene segment
      const newClipStartTime = earliestStart; // How much to trim from the beginning
      const newClipDuration = latestEnd - earliestStart; // New duration after trimming

      console.log('🎬 TRIM: Calculated trim values:', {
        earliestStart,
        latestEnd,
        newClipStartTime,
        newClipDuration,
        originalDuration: scene.duration
      });

      // Always save if called manually, or check for meaningful changes
      // For automatic saves, we should save if:
      // 1. The start time is trimmed (> 0.1 seconds)
      // 2. The duration is significantly different from original
      // 3. There are gaps in the timeline (clips don't cover the full duration)
      // 4. The number of clips has changed significantly

      // Calculate total video coverage and check for changes
      const totalVideoCoverage = videoClips.reduce((total, clip) => total + clip.duration, 0);
      const hasGaps = totalVideoCoverage < (scene.duration - 0.1);
      const isStartTrimmed = newClipStartTime > 0.1;
      const isDurationChanged = Math.abs(newClipDuration - scene.duration) > 0.1;
      const hasSignificantGaps = hasGaps && (scene.duration - totalVideoCoverage) > 0.5; // More than 0.5s gap

      console.log('🎬 TRIM: Trim detection analysis:', {
        newClipStartTime,
        newClipDuration,
        originalDuration: scene.duration,
        totalVideoCoverage,
        hasGaps,
        hasSignificantGaps,
        isStartTrimmed,
        isDurationChanged,
        videoClipsCount: videoClips.length
      });

      // For now, let's be more aggressive about saving - save if there's any change
      const shouldSave = forcesSave || isStartTrimmed || isDurationChanged || hasSignificantGaps || videoClips.length < 2;

      if (!shouldSave) {
        console.log('🎬 TRIM: No significant trim detected, skipping save');
        return;
      }

      console.log('🎬 TRIM: Significant trim detected, proceeding with save');

      console.log('🎬 TRIM: Saving trimmed scene:', {
        sceneId: scene.sceneId,
        analysisId: analysisId,
        originalDuration: scene.duration,
        newClipStartTime,
        newClipDuration
      });

      const apiUrl = `/api/analysis/${analysisId || 'unknown'}/scene/${scene.sceneId}/trim`;
      console.log('🎬 TRIM: Making API call to:', apiUrl);

      const requestBody = {
        new_clip_start_time: newClipStartTime,
        new_clip_duration: newClipDuration
      };
      console.log('🎬 TRIM: Request body:', requestBody);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('🎬 TRIM: Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('🎬 TRIM: API error response:', errorData);
        throw new Error(`Failed to save trimmed scene: ${errorData.detail || response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ 🎬 TRIM: Scene trim saved successfully:', result.message);
      console.log('✅ 🎬 TRIM: Full response:', result);

      // Update the scene data with new URLs if provided
      if (result.updated_scene_metadata) {
        // The parent component should handle updating the scene data
        // For now, we'll just log the success
        console.log('🎬 TRIM: Updated scene metadata received:', result.updated_scene_metadata);
      }

    } catch (error) {
      console.error('❌ 🎬 TRIM: Failed to save trimmed scene:', error);
      // Could show user notification here
    }
  }, [scene, state.clips, analysisId]);

  const stopTrimming = useCallback(() => {
    console.log('🎬 TRIM: Stopping trim operation, will auto-save in 1 second');
    setState(prev => ({
      ...prev,
      isDragging: false,
      dragType: null,
      dragStartX: 0,
      dragStartTime: 0
    }));

    // Auto-save trimmed scene after a short delay
    setTimeout(() => {
      console.log('🎬 TRIM: Auto-save timeout triggered, calling saveTrimmedScene');
      // Call saveTrimmedScene directly to avoid hoisting issues
      saveTrimmedScene().catch(error => {
        console.error('🎬 TRIM: Error in auto-save:', error);
      });
    }, 1000);
  }, []); // Remove saveTrimmedScene from dependencies to avoid hoisting

  // Blade tool functionality
  const splitClipAt = useCallback((clipId: string, splitTime: number) => {
    // Save current state to undo history before splitting
    saveToUndoHistory(state);

    setState(prev => {
      const clipIndex = prev.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return prev;

      const clip = prev.clips[clipIndex];
      if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return prev;

      const splitPoint = splitTime - clip.startTime;
      const leftClip: Clip = {
        ...clip,
        id: `${clip.id}-left-${Date.now()}`,
        duration: splitPoint,
        mediaEnd: clip.mediaStart + splitPoint,
        selected: false
      };

      const rightClip: Clip = {
        ...clip,
        id: `${clip.id}-right-${Date.now()}`,
        startTime: splitTime,
        duration: clip.duration - splitPoint,
        mediaStart: clip.mediaStart + splitPoint,
        selected: false
      };

      const newClips = [...prev.clips];
      newClips.splice(clipIndex, 1, leftClip, rightClip);

      return {
        ...prev,
        clips: newClips,
        selectedClips: []
      };
    });
  }, [state, saveToUndoHistory]);

  // Clip movement functionality
  const startMovingClip = useCallback((clipId: string, startX: number) => {
    selectClip(clipId);
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;

    setState(prev => ({
      ...prev,
      isDragging: true,
      dragType: 'move',
      dragStartX: startX,
      dragStartTime: clip.startTime
    }));
  }, [state.clips, selectClip]);

  // Magnetic snapping functionality
  const getSnapTargets = useCallback(() => {
    const targets: number[] = [0, scene?.duration || 0, state.playhead]; // Start, end, playhead

    // Add clip edges as snap targets
    state.clips.forEach(clip => {
      if (!clip.selected) {
        targets.push(clip.startTime, clip.startTime + clip.duration);
      }
    });

    return targets.sort((a, b) => a - b);
  }, [scene, state.clips, state.playhead]);

  const snapToNearestTarget = useCallback((time: number, snapThreshold = 0.5) => {
    const targets = getSnapTargets();

    for (const target of targets) {
      if (Math.abs(time - target) <= snapThreshold) {
        return target;
      }
    }

    return time;
  }, [getSnapTargets]);

  const updateClipMovement = useCallback((currentCanvasX: number) => {
    if (!state.isDragging || state.dragType !== 'move' || !scene) return;

    const canvas = timelineCanvasRef.current;
    if (!canvas) return;

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);
    const deltaX = currentCanvasX - state.dragStartX;
    const deltaTime = (deltaX / timelineWidth) * scene.duration;

    // Removed movement update logging to reduce console spam

    setState(prev => ({
      ...prev,
      clips: prev.clips.map(clip => {
        if (!clip.selected) return clip;

        let newStartTime = Math.max(0, Math.min(scene.duration - clip.duration, state.dragStartTime + deltaTime));

        // Apply magnetic snapping
        newStartTime = snapToNearestTarget(newStartTime);

        return {
          ...clip,
          startTime: newStartTime
        };
      })
    }));
  }, [state.isDragging, state.dragType, state.dragStartX, state.dragStartTime, scene, snapToNearestTarget]);

  // Playhead dragging functions
  const startPlayheadDrag = useCallback((canvasX: number) => {
    // Removed playhead drag logging to reduce console spam
    setState(prev => ({
      ...prev,
      isDragging: true,
      dragType: 'playhead',
      dragStartX: canvasX,
      dragStartTime: prev.playhead,
      isPlayheadDragging: true
    }));
  }, []);

  const updatePlayheadDrag = useCallback((canvasX: number) => {
    if (!state.isPlayheadDragging || !scene) return;

    const canvas = timelineCanvasRef.current;
    if (!canvas) return;

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);

    // Get effective content duration for smart playhead constraints
    const effectiveContentDuration = getEffectiveContentDuration();
    const maxDuration = Math.min(scene.duration, effectiveContentDuration || scene.duration);

    // Calculate new playhead position based on mouse position
    const timelineProgress = Math.max(0, Math.min(1, (canvasX - timelineMargin) / timelineWidth));
    const newPlayheadTime = Math.min(timelineProgress * scene.duration, maxDuration);

    // Update playhead position and seek video
    setState(prev => ({ ...prev, playhead: newPlayheadTime }));
    seekToTime(newPlayheadTime);
  }, [state.isPlayheadDragging, scene, seekToTime, getEffectiveContentDuration]);

  const stopPlayheadDrag = useCallback(() => {
    console.log('🎯 Stopping playhead drag');
    setState(prev => ({
      ...prev,
      isDragging: false,
      dragType: null,
      isPlayheadDragging: false
    }));
  }, []);

  // Tool selection
  const setTool = useCallback((tool: NodeTimelineState['currentTool']) => {
    setState(prev => ({ ...prev, currentTool: tool }));
  }, []);

  // Canvas sizing and resize handling - fixed to prevent infinite re-renders
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 200 });

  // Calculate track height once
  const totalTrackHeight = useMemo(() => {
    return tracks.reduce((sum, track) => sum + track.height, 0);
  }, [tracks]);

  // Handle window resize with proper debouncing
  useEffect(() => {
    const updateCanvasSize = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newWidth = Math.max(400, containerRect.width - 100); // Account for track headers
      const newHeight = totalTrackHeight;

      setCanvasSize(prev => {
        // Only update if size actually changed to prevent unnecessary re-renders
        if (prev.width !== newWidth || prev.height !== newHeight) {
          return { width: newWidth, height: newHeight };
        }
        return prev;
      });
    };

    // Initial size calculation
    updateCanvasSize();

    // Add resize listener with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateCanvasSize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, [totalTrackHeight]); // Only depend on totalTrackHeight, not the tracks array

  // Optimized timeline rendering with viewport culling and frame rate limiting
  const renderTimelineOptimized = useCallback(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas || !scene || !isVideoLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size from state
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw timeline background with grid
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw time grid lines
    const timelineWidth = canvas.width - 20;
    const gridInterval = Math.max(1, Math.floor(scene.duration / 10)); // Show ~10 grid lines

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let time = 0; time <= scene.duration; time += gridInterval) {
      const x = (time / scene.duration) * timelineWidth + 10;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();

      // Draw time labels
      ctx.fillStyle = '#888';
      ctx.font = '10px Arial';
      const timeLabel = `${Math.floor(time)}s`;
      ctx.fillText(timeLabel, x + 2, 12);
    }

    // Draw track separators and content
    let yOffset = 0;
    tracks.forEach((track, index) => {
      if (index > 0) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yOffset);
        ctx.lineTo(canvas.width, yOffset);
        ctx.stroke();
      }

      // Draw clips for this track - only show content on V1 and A1 tracks with viewport culling
      const viewport = getViewportBounds();
      const allTrackClips = state.clips.filter(clip => {
        // Only show video clips on V1 track (not V2)
        if (clip.type === 'video' && track.id === 'v1') return true;
        // Only show audio clips on A1 track (not A2)
        if (clip.type === 'audio' && track.id === 'a1') return true;
        // Show text clips on both T1 and T2 tracks for now
        if (clip.type === 'text') return clip.type === track.type;
        // Don't show clips on V2 or A2 tracks
        return false;
      });

      // Apply viewport culling for performance
      const trackClips = getVisibleClips(allTrackClips, viewport.start, viewport.end);

      // Show empty track indicator for V2 and A2 tracks
      if (trackClips.length === 0 && (track.id === 'v2' || track.id === 'a2')) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(10, yOffset + 5, timelineWidth, track.height - 10);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(10, yOffset + 5, timelineWidth, track.height - 10);
        ctx.setLineDash([]); // Reset dash pattern

        // Add "Available for layers" text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px Arial';
        const text = track.id === 'v2' ? 'Available for video overlays' : 'Available for additional audio';
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, (canvas.width - textWidth) / 2, yOffset + track.height / 2 + 3);
      }

      trackClips.forEach(clip => {
        const timelineMargin = 10;
        const clipStartX = (clip.startTime / scene.duration) * timelineWidth + timelineMargin;
        const clipWidth = (clip.duration / scene.duration) * timelineWidth;
        const clipEndX = clipStartX + clipWidth;

        // Draw clip based on type
        if (track.type === 'video') {
          // Video clip gradient
          const gradient = ctx.createLinearGradient(clipStartX, yOffset + 10, clipStartX, yOffset + track.height - 10);
          gradient.addColorStop(0, clip.selected ? '#7bb3f7' : '#5aa3f0');
          gradient.addColorStop(1, clip.selected ? '#4a8bd4' : '#3d7bc6');
          ctx.fillStyle = gradient;
          ctx.fillRect(clipStartX, yOffset + 10, clipWidth, track.height - 20);

          // Clip border
          ctx.strokeStyle = clip.selected ? '#2d5aa0' : '#2d5aa0';
          ctx.lineWidth = clip.selected ? 3 : 2;
          ctx.strokeRect(clipStartX, yOffset + 10, clipWidth, track.height - 20);

          // Trim handles - more precise positioning
          if (clip.selected) {
            // Left trim handle
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            ctx.fillRect(clipStartX - 3, yOffset + 10, 6, track.height - 20);
            // Right trim handle
            ctx.fillRect(clipEndX - 3, yOffset + 10, 6, track.height - 20);
            ctx.shadowBlur = 0; // Reset shadow
          }

          // Draw video thumbnail if available and clip is wide enough
          if (clipWidth > 80) {
            const cacheKey = `${clip.id}-0`;
            const thumbnail = thumbnailCacheRef.current.get(cacheKey);
            if (thumbnail) {
              // Draw thumbnail in the left part of the clip
              const thumbnailWidth = 60;
              const thumbnailHeight = track.height - 24;
              const thumbnailX = clipStartX + 4;
              const thumbnailY = yOffset + 12;

              ctx.save();
              ctx.beginPath();
              ctx.rect(thumbnailX, thumbnailY, thumbnailWidth, thumbnailHeight);
              ctx.clip();
              ctx.drawImage(thumbnail, thumbnailX, thumbnailY, thumbnailWidth, thumbnailHeight);
              ctx.restore();

              // Draw border around thumbnail
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 1;
              ctx.strokeRect(thumbnailX, thumbnailY, thumbnailWidth, thumbnailHeight);
            }
          }

          // Clip label
          if (clipWidth > 60) {
            const labelX = clipWidth > 80 ? clipStartX + 70 : clipStartX + 5; // Offset if thumbnail is present
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Arial';
            ctx.fillText('Video', labelX, yOffset + 28);

            ctx.font = '9px Arial';
            ctx.fillStyle = '#ccc';
            ctx.fillText(`${clip.duration.toFixed(1)}s`, labelX, yOffset + 42);
          }

        } else if (track.type === 'audio') {
          // Audio clip gradient
          const gradient = ctx.createLinearGradient(clipStartX, yOffset + 20, clipStartX, yOffset + track.height - 20);
          gradient.addColorStop(0, clip.selected ? '#9ef442' : '#7ed321');
          gradient.addColorStop(1, clip.selected ? '#7bc61f' : '#5ba617');
          ctx.fillStyle = gradient;
          ctx.fillRect(clipStartX, yOffset + 20, clipWidth, track.height - 40);

          // Clip border
          ctx.strokeStyle = clip.selected ? '#4a7c0a' : '#4a7c0a';
          ctx.lineWidth = clip.selected ? 3 : 2;
          ctx.strokeRect(clipStartX, yOffset + 20, clipWidth, track.height - 40);

          // Trim handles - more precise positioning
          if (clip.selected) {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            ctx.fillRect(clipStartX - 3, yOffset + 20, 6, track.height - 40);
            ctx.fillRect(clipEndX - 3, yOffset + 20, 6, track.height - 40);
            ctx.shadowBlur = 0; // Reset shadow
          }

          // Waveform
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const centerY = yOffset + track.height / 2;
          for (let x = clipStartX + 2; x < clipEndX - 2; x += 2) {
            const progress = (x - clipStartX) / clipWidth;
            const time = progress * clip.duration;
            const frequency1 = Math.sin(time * 8) * 0.7;
            const frequency2 = Math.sin(time * 3) * 0.3;
            const amplitude = (frequency1 + frequency2) * 12;

            ctx.moveTo(x, centerY - amplitude);
            ctx.lineTo(x, centerY + amplitude);
          }
          ctx.stroke();

        } else if (track.type === 'text') {
          // Text clip
          ctx.fillStyle = clip.selected ? '#888' : '#666';
          ctx.fillRect(clipStartX, yOffset + 5, clipWidth, track.height - 10);

          ctx.strokeStyle = clip.selected ? '#aaa' : '#888';
          ctx.lineWidth = clip.selected ? 2 : 1;
          ctx.strokeRect(clipStartX, yOffset + 5, clipWidth, track.height - 10);

          // Trim handles - more precise positioning
          if (clip.selected) {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            ctx.fillRect(clipStartX - 3, yOffset + 5, 6, track.height - 10);
            ctx.fillRect(clipEndX - 3, yOffset + 5, 6, track.height - 10);
            ctx.shadowBlur = 0; // Reset shadow
          }

          if (clipWidth > 40) {
            ctx.fillStyle = '#ccc';
            ctx.font = '9px Arial';
            ctx.fillText('Text', clipStartX + 5, yOffset + 18);
          }
        }
      });

      yOffset += track.height;
    });

    // Draw effective content duration indicator
    const effectiveContentDuration = getEffectiveContentDuration();
    if (effectiveContentDuration < scene.duration) {
      const contentEndX = (effectiveContentDuration / scene.duration) * timelineWidth + 10;

      // Draw content end line
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(contentEndX, 0);
      ctx.lineTo(contentEndX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash pattern

      // Draw grayed out area after content end
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(contentEndX, 0, (canvas.width - 10) - contentEndX, canvas.height);

      // Content end label
      ctx.fillStyle = '#ff9800';
      ctx.font = 'bold 9px Arial';
      const endText = 'Content End';
      const endTextWidth = ctx.measureText(endText).width;
      ctx.fillText(endText, contentEndX - endTextWidth / 2, 12);
    }

    // Draw playhead with better visibility
    const playheadX = (state.playhead / scene.duration) * timelineWidth + 10;

    // Playhead line
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.height);
    ctx.stroke();

    // Playhead handle (top)
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(playheadX - 8, 0, 16, 20);

    // Playhead triangle
    ctx.beginPath();
    ctx.moveTo(playheadX, 20);
    ctx.lineTo(playheadX - 8, 0);
    ctx.lineTo(playheadX + 8, 0);
    ctx.closePath();
    ctx.fill();

    // Playhead time display
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    const timeText = `${state.playhead.toFixed(1)}s`;
    const textWidth = ctx.measureText(timeText).width;
    ctx.fillText(timeText, playheadX - textWidth / 2, 15);

  }, [scene, isVideoLoaded, state.playhead, state.clips, canvasSize, getEffectiveContentDuration, getViewportBounds, getVisibleClips]);

  // Use frame rate limited rendering
  useEffect(() => {
    scheduleRender(renderTimelineOptimized);
  }, [scheduleRender, renderTimelineOptimized]);

  // Enhanced timeline interaction handling with proper coordinate calculations
  const getTimelineCoordinates = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = timelineCanvasRef.current;
    if (!canvas || !scene) return null;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Account for canvas scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Timeline area calculations
    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);

    // Ensure click is within timeline bounds
    if (canvasX < timelineMargin || canvasX > canvas.width - timelineMargin) {
      return null;
    }

    // Calculate timeline time
    const timelineProgress = (canvasX - timelineMargin) / timelineWidth;
    const clickTime = timelineProgress * scene.duration;

    // Removed timeline coordinates logging to reduce console spam

    return {
      canvasX,
      canvasY,
      clickTime: Math.max(0, Math.min(clickTime, scene.duration)),
      timelineProgress
    };
  }, [scene]);

  // Check if mouse is over playhead handle
  const isOverPlayhead = useCallback((canvasX: number, canvasY: number) => {
    if (!scene) return false;

    const canvas = timelineCanvasRef.current;
    if (!canvas) return false;

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);
    const playheadX = (state.playhead / scene.duration) * timelineWidth + timelineMargin;

    // Playhead handle is 16px wide (8px on each side) and 20px tall
    const handleWidth = 16;
    const handleHeight = 20;

    const isOverHandle = canvasX >= playheadX - handleWidth / 2 &&
                        canvasX <= playheadX + handleWidth / 2 &&
                        canvasY >= 0 &&
                        canvasY <= handleHeight;



    return isOverHandle;
  }, [scene, state.playhead]);

  const getClipAtPosition = useCallback((canvasX: number, canvasY: number, clickTime: number) => {
    if (!scene) return null;

    let yOffset = 0;
    for (const track of tracks) {
      if (canvasY >= yOffset && canvasY < yOffset + track.height) {
        // Use same filtering logic as rendering - only show content on V1 and A1 tracks
        const trackClips = state.clips.filter(clip => {
          // Only show video clips on V1 track (not V2)
          if (clip.type === 'video' && track.id === 'v1') return true;
          // Only show audio clips on A1 track (not A2)
          if (clip.type === 'audio' && track.id === 'a1') return true;
          // Show text clips on both T1 and T2 tracks for now
          if (clip.type === 'text') return clip.type === track.type;
          // Don't show clips on V2 or A2 tracks
          return false;
        });
        for (const clip of trackClips) {
          if (clickTime >= clip.startTime && clickTime <= clip.startTime + clip.duration) {
            return { clip, track, clickTime };
          }
        }
      }
      yOffset += track.height;
    }
    return null;
  }, [scene, state.clips, tracks]);

  const getTrimHandle = useCallback((canvasX: number, _canvasY: number, clip: Clip) => {
    if (!scene) return null;

    const canvas = timelineCanvasRef.current;
    if (!canvas) return null;

    const timelineMargin = 10;
    const timelineWidth = canvas.width - (timelineMargin * 2);
    const clipStartX = (clip.startTime / scene.duration) * timelineWidth + timelineMargin;
    const clipWidth = (clip.duration / scene.duration) * timelineWidth;
    const clipEndX = clipStartX + clipWidth;

    const handleWidth = 10; // 6px handle + 4px tolerance = 10px total detection zone

    // Removed trim handle detection logging to reduce console spam

    if (Math.abs(canvasX - clipStartX) <= handleWidth) return 'trim-start';
    if (Math.abs(canvasX - clipEndX) <= handleWidth) return 'trim-end';
    return null;
  }, [scene]);

  const handleTimelineMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coordinates = getTimelineCoordinates(event);
    if (!coordinates) return;

    const { canvasX, canvasY, clickTime } = coordinates;

    // Priority 1: Check if clicking on playhead handle
    if (isOverPlayhead(canvasX, canvasY)) {
      startPlayheadDrag(canvasX);
      return;
    }

    const clipInfo = getClipAtPosition(canvasX, canvasY, clickTime);

    // Removed mouse down logging to reduce console spam

    if (state.currentTool === 'blade' && clipInfo) {
      // Blade tool: split clip
      splitClipAt(clipInfo.clip.id, clipInfo.clickTime);
      return;
    }

    if (state.currentTool === 'selection' && clipInfo) {
      const trimHandle = getTrimHandle(canvasX, canvasY, clipInfo.clip);

      if (trimHandle && clipInfo.clip.selected) {
        // Start trimming
        startTrimming(clipInfo.clip.id, trimHandle, canvasX);
      } else if (trimHandle) {
        // Select clip and start trimming
        selectClip(clipInfo.clip.id);
        startTrimming(clipInfo.clip.id, trimHandle, canvasX);
      } else {
        // Start moving clip
        startMovingClip(clipInfo.clip.id, canvasX);
      }
      return;
    }

    // Default: scrub timeline - this is the key fix for seeking
    console.log('Seeking to time:', clickTime);
    clearSelection();
    seekToTime(clickTime);
  }, [getTimelineCoordinates, isOverPlayhead, startPlayheadDrag, getClipAtPosition, state.currentTool, getTrimHandle, splitClipAt, startTrimming, selectClip, startMovingClip, clearSelection, seekToTime]);

  const handleTimelineMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coordinates = getTimelineCoordinates(event);
    if (!coordinates) return;

    const { canvasX, canvasY } = coordinates;

    // Update cursor when hovering over playhead (only when not dragging)
    if (!state.isDragging) {
      const canvas = timelineCanvasRef.current;
      if (canvas) {
        if (isOverPlayhead(canvasX, canvasY)) {
          canvas.style.cursor = 'ew-resize';
        } else {
          canvas.style.cursor = state.currentTool === 'blade' ? 'crosshair' :
                                state.currentTool === 'hand' ? 'grab' : 'default';
        }
      }
      return;
    }

    // Handle dragging
    if (state.dragType === 'playhead') {
      updatePlayheadDrag(canvasX);
    } else if (state.dragType === 'move') {
      updateClipMovement(canvasX);
    } else if (state.dragType === 'trim-start' || state.dragType === 'trim-end') {
      updateTrimming(canvasX);
    }
  }, [state.isDragging, state.dragType, state.currentTool, getTimelineCoordinates, isOverPlayhead, updatePlayheadDrag, updateClipMovement, updateTrimming]);

  const handleTimelineMouseUp = useCallback(() => {
    if (state.isDragging) {
      if (state.dragType === 'playhead') {
        stopPlayheadDrag();
      } else {
        stopTrimming();
      }
    }
  }, [state.isDragging, state.dragType, stopPlayheadDrag, stopTrimming]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent default if we handle the key
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePlayback();
          break;
        case 'KeyV':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            // Paste clips (placeholder)
            console.log('Paste clips at:', state.playhead);
          } else {
            event.preventDefault();
            setTool('selection');
          }
          break;
        case 'KeyB':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            setTool('blade');
          }
          break;
        case 'KeyH':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            setTool('hand');
          }
          break;
        case 'Home':
          event.preventDefault();
          seekToTime(0);
          break;
        case 'End':
          event.preventDefault();
          const effectiveContentDuration = getEffectiveContentDuration();
          seekToTime(Math.min(scene?.duration || 0, effectiveContentDuration || scene?.duration || 0));
          break;
        case 'ArrowLeft':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            seekToTime(Math.max(0, state.playhead - 0.1));
          }
          break;
        case 'ArrowRight':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            const effectiveContentDuration = getEffectiveContentDuration();
            const maxTime = Math.min(scene?.duration || 0, effectiveContentDuration || scene?.duration || 0);
            seekToTime(Math.min(maxTime, state.playhead + 0.1));
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          adjustVolume(5);
          break;
        case 'ArrowDown':
          event.preventDefault();
          adjustVolume(-5);
          break;
        case 'KeyM':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            toggleMute();
          }
          break;

        case 'KeyC':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            // Copy selected clips (placeholder)
            console.log('Copy clips:', state.selectedClips);
          }
          break;
        case 'KeyD':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            // Duplicate selected clips
            if (state.selectedClips.length > 0) {
              setState(prev => {
                const selectedClips = prev.clips.filter(clip => clip.selected);
                const duplicatedClips = selectedClips.map(clip => ({
                  ...clip,
                  id: `${clip.id}-dup-${Date.now()}`,
                  startTime: clip.startTime + clip.duration,
                  selected: false
                }));
                return {
                  ...prev,
                  clips: [...prev.clips, ...duplicatedClips]
                };
              });
            }
          }
          break;
        case 'Escape':
          event.preventDefault();
          clearSelection();
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          deleteSelectedClips();
          break;
        case 'KeyZ':
          if (event.ctrlKey || event.metaKey) { // Ctrl+Z or Cmd+Z
            event.preventDefault();
            performUndo();
            console.log('🔄 Undo triggered via Ctrl+Z');
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, togglePlayback, setTool, seekToTime, scene, state.playhead, clearSelection, deleteSelectedClips, performUndo]);

  if (!isOpen) return null;

  return (
    <div className="node-timeline-overlay" onClick={onClose}>
      <div
        ref={containerRef}
        className="node-timeline-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="node-timeline-header">
          <div className="node-timeline-title-section">
            <h3 className="node-timeline-title">
              🎬 Scene Editor: "{scene?.title || `Scene ${(scene?.scene_index || 0) + 1}`}"
            </h3>
            {/* Translation Status Indicator */}
            {(() => {
              const translationStatus = getTranslationStatus(scene);
              if (translationStatus.isTranslated) {
                return (
                  <div
                    className="node-timeline-translation-indicator"
                    title={`Translated to ${translationStatus.targetLanguage || 'unknown language'} using ${translationStatus.voice || 'default voice'}`}
                  >
                    🌐 TRANSLATED
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <div className="node-timeline-header-buttons">
            <button
              onClick={() => saveTrimmedScene(true)}
              className="node-timeline-button save"
              title="Save trimmed scene to backend"
            >
              💾 Save Trim
            </button>

            <button
              onClick={onClose}
              className="node-timeline-button close"
            >
              ❌ Close
            </button>
          </div>
        </div>

        {/* Video Preview Area */}
        <div className="node-timeline-video-area">
          <div className="node-timeline-video-container">
            <video
              ref={videoRef}
              className="node-timeline-video"
              playsInline
              preload="auto"
            />
            {!isVideoLoaded && (
              <div className="node-timeline-loading">
                Loading Scene...
              </div>
            )}
            {isVideoInGap && (
              <div className="node-timeline-video-gap-overlay">
                <div className="node-timeline-gap-message">
                  <div className="gap-icon">🎬</div>
                  <div className="gap-text">No Video Clip</div>
                  <div className="gap-subtext">Timeline gap detected</div>
                </div>
              </div>
            )}
            {/* Subtitle Overlay */}
            <SubtitleOverlay
              currentTime={state.playhead}
              subtitles={subtitles}
              visible={showSubtitles && subtitles.length > 0}
            />
          </div>
        </div>

        {/* Controls Bar */}
        <div className="node-timeline-controls">
          {/* Playback Controls */}
          <div className="node-timeline-playback-controls">
            <button
              onClick={togglePlayback}
              className={`node-timeline-control-button play ${state.isPlaying ? 'playing' : ''}`}
            >
              {state.isPlaying ? '⏸️' : '▶️'}
            </button>
            <button
              onClick={() => seekToTime(0)}
              className="node-timeline-control-button stop"
            >
              ⏹️
            </button>
          </div>

          {/* Tools */}
          <div className="node-timeline-tools">
            <button
              onClick={() => setTool('selection')}
              className={`node-timeline-tool-button ${state.currentTool === 'selection' ? 'active' : ''}`}
            >
              ✂️
            </button>
            <button
              onClick={() => setTool('blade')}
              className={`node-timeline-tool-button ${state.currentTool === 'blade' ? 'active' : ''}`}
            >
              🖐️
            </button>
            {hasSelectedClips && (
              <button
                onClick={deleteSelectedClips}
                className="node-timeline-tool-button delete"
                title={`Delete ${state.selectedClips.length} selected clip(s) (Delete/Backspace)`}
              >
                🗑️
              </button>
            )}
          </div>

          {/* Enhanced Volume Control */}
          <div className="node-timeline-volume-control">
            <button
              onClick={toggleMute}
              className="node-timeline-volume-button"
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted ? '🔇' : currentVolume > 50 ? '🔊' : currentVolume > 0 ? '🔉' : '🔈'}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={currentVolume}
              className="node-timeline-volume-slider"
              onChange={handleVolumeChange}
              title={`Volume: ${Math.round(currentVolume)}% (↑↓ to adjust)`}
            />

          </div>

          {/* Subtitle Toggle */}
          {subtitles.length > 0 && (
            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`node-timeline-control-button subtitle-toggle ${showSubtitles ? 'active' : ''}`}
              title={showSubtitles ? "Hide Subtitles" : "Show Subtitles"}
            >
              💬
            </button>
          )}

          {/* Audio Sync Status Indicator */}
          {!isManuallyMuted && (
            <div className="node-timeline-audio-sync-indicator" title="Audio sync active - respecting timeline audio clips">
              🎵 SYNC
            </div>
          )}

          {/* Video Gap Status Indicator */}
          {isVideoInGap && (
            <div className="node-timeline-video-gap-indicator" title="Video in gap - no video clip at current position">
              🎬 GAP
            </div>
          )}

          {/* Enhanced Timecode with effective duration */}
          <div className="node-timeline-timecode">
            {Math.floor(state.playhead / 60).toString().padStart(2, '0')}:
            {Math.floor(state.playhead % 60).toString().padStart(2, '0')} / {' '}
            {(() => {
              const effectiveContentDuration = getEffectiveContentDuration();
              const displayDuration = effectiveContentDuration < videoDuration ? effectiveContentDuration : videoDuration;
              return `${Math.floor(displayDuration / 60).toString().padStart(2, '0')}:${Math.floor(displayDuration % 60).toString().padStart(2, '0')}`;
            })()}
            {getEffectiveContentDuration() < videoDuration && (
              <span style={{ opacity: 0.6, fontSize: '9px', marginLeft: '4px' }}>
                (of {Math.floor(videoDuration / 60).toString().padStart(2, '0')}:
                {Math.floor(videoDuration % 60).toString().padStart(2, '0')})
              </span>
            )}
          </div>
        </div>

        {/* Timeline Area */}
        <div className="node-timeline-area">
          {/* Track Headers */}
          <div className="node-timeline-track-headers">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="node-timeline-track-header"
                style={{ height: `${track.height}px` }}
              >
                {track.name}
              </div>
            ))}
          </div>

          {/* Timeline Canvas */}
          <div className="node-timeline-canvas-container">
            <canvas
              ref={timelineCanvasRef}
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              className={`node-timeline-canvas ${
                state.isDragging && state.dragType === 'playhead' ? 'playhead-dragging' :
                state.isDragging && state.dragType === 'move' ? 'moving' :
                state.isDragging && (state.dragType === 'trim-start' || state.dragType === 'trim-end') ? 'trimming' :
                state.currentTool === 'blade' ? 'blade-tool' :
                state.currentTool === 'hand' ? 'hand-tool' : 'selecting'
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeTimeline;
