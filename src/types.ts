// src/types.ts

export type SegmentationMethod = 'cut-based' | 'ai-based' | 'manual';

export interface SceneTimeInterval {
  start: number;
  end: number;
  duration: number;
}

export interface AnalyzedScene extends SceneTimeInterval {
  scene_index: number; // Keep for ordering and display like "Scene #X"
  sceneId: string;     // NEW: UUID for unique identification
  analysisId?: string; // Optional: Reference to parent analysis
  title: string;
  tags: string[];
  avg_volume?: number;
  max_volume?: number;
  high_energy?: number; // 0 or 1
  key_moments?: number[];
  transition_type?: 'cut' | 'fade-in' | 'fade-out' | 'dissolve' | 'wipe' | string; // Allow other strings
  // AI-based segmentation specific fields
  transcript?: string; // Speech transcript for this scene
  topics?: string[];   // Detected topics in this scene
  speakers?: string[]; // Detected speakers (if available)
  confidence_score?: number; // Boundary confidence (0-1)
  segmentation_method?: SegmentationMethod; // How this scene was detected

  // NEW: Video segment URLs (real video files, not references)
  proxy_video_url?: string;      // Low-res proxy for timeline preview
  mezzanine_video_url?: string;  // High-quality mezzanine for export
  proxy_video_path?: string;     // Server path to proxy file
  mezzanine_video_path?: string; // Server path to mezzanine file

  // NEW: Original timing metadata for trimming support
  start_original?: number;        // Original start time in full video
  end_original?: number;          // Original end time in full video
  current_trimmed_start?: number; // Current trim offset from segment start
  current_trimmed_duration?: number; // Current duration after trimming

  // NEW: Translation support
  translatedVideoUrl?: string;    // URL to translated video file
  isTranslated?: boolean;         // Flag indicating if scene has been translated
  translationInfo?: {
    targetLanguage: string;       // Target language code (e.g., 'es', 'fr')
    originalLanguage?: string;    // Original language code (default: 'en')
    voice?: string;               // Voice used for TTS
    translatedAt: number;         // Timestamp when translation was completed
    agentId?: string;             // ID of the AI agent that performed translation
    processingTime?: string;      // Time taken for translation
  };
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  // other metadata like codec, bitrate can be added
}

export interface ApiAnalysisResponse {
  analysisId: string;
  fileName: string;
  videoUrl: string; // Should be absolute URL from backend
  scenes: AnalyzedScene[];
  metadata: VideoMetadata;
}

// For nodes on the React Flow canvas specifically representing video scenes
export interface NodeVideoSceneData extends SceneTimeInterval {
  analysisId: string;
  sceneIndex: number; // Keep for display order and legacy compatibility if needed
  sceneId: string;    // NEW: UUID for unique identification
  originalVideoFileName: string;
  title: string;
  aiProcessingResults?: Record<string, {
    result: any;
    processedAt: number;
    agentId: string;
    status: 'completed' | 'error';
  }>;
  tags: string[];
  avgVolume?: number;
  highEnergy?: boolean; // Converted from 0/1
  transitionType?: string;

  // Translation support for node data
  translatedVideoUrl?: string;
  isTranslated?: boolean;
  translationInfo?: {
    targetLanguage: string;
    originalLanguage?: string;
    voice?: string;
    translatedAt: number;
    agentId?: string;
    processingTime?: string;
  };
  // Potentially other data relevant for node display
}

// NEW: Optimized scene data structure for unified storage
export interface OptimizedSceneData {
  // Core identifiers
  sceneId: string;
  analysisId: string;

  // Video metadata (immutable from analysis)
  originalStart: number;
  originalEnd: number;
  originalDuration: number;
  originalVideoFileName: string;

  // Current state (modified by user)
  currentStart: number;
  currentEnd: number;
  currentDuration: number;

  // Ordering and metadata
  displayOrder: number;  // Single source of truth for playback sequence
  title: string;
  tags: string[];

  // Embedded timeline data (no separate storage)
  timelineEdits: {
    clips: any[]; // Will use existing TimelineClip type
    playhead: number;
    effects: any[]; // Will use existing SceneEdits type
    volume: number;
    brightness: number;
    contrast: number;
    saturation: number;
    textOverlays: any[];
    fadeIn: number;
    fadeOut: number;
    lastModified: number;
  };

  // AI processing results
  aiResults: Record<string, {
    result: any;
    processedAt: number;
    agentId: string;
    status: 'completed' | 'error';
  }>;

  // Canvas position (for React Flow)
  position: { x: number; y: number };

  // Legacy compatibility
  sceneIndex: number;
  avgVolume?: number;
  highEnergy?: boolean;
  transitionType?: string;
}

// NEW: Optimized project data structure
export interface OptimizedProjectData {
  projectId: string;
  analysisId: string;
  videoFileName: string;
  videoUrl: string;
  videoDuration: number;
  scenes: OptimizedSceneData[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  metadata: {
    created: number;
    lastSaved: number;
    lastModified: number;
    version: string;
    saveCount: number;
  };
}

// AI Agent Types for video editing
export type AIAgentType =
  | 'video-enhancer'
  | 'audio-processor'
  | 'content-analyzer'
  | 'auto-editor'
  | 'subtitle-generator'
  | 'color-grader'
  | 'object-detector'
  | 'scene-classifier'
  | 'transition-suggester'
  | 'noise-reducer'
  | 'audio-translator';

// Storage Strategy Types
export type StorageStrategy = 'localStorage' | 'indexedDB' | 'cloudStorage' | 'hybrid';
export type ProcessingStrategy = 'client' | 'cloud' | 'auto';

// Storage Location Metadata
export interface StorageLocation {
  type: 'localStorage' | 'indexedDB' | 'gcs' | 'url';
  key: string;
  url?: string;
  size?: number;
  lastAccessed?: number;
  expiresAt?: number;
}

// Enhanced Scene Data with Future-Ready Storage
export interface EnhancedSceneData extends OptimizedSceneData {
  // Video source locations (prioritized)
  videoSources: {
    original: StorageLocation;
    processed?: StorageLocation;
    cloudProcessed?: StorageLocation;
    activeSource: 'original' | 'processed' | 'cloudProcessed';
  };

  // Enhanced AI processing results with storage info
  aiResults: Record<string, {
    result: any;
    storage: StorageLocation;
    processedAt: number;
    agentId: string;
    status: 'completed' | 'error';
    processingStrategy: ProcessingStrategy;
    processingTime?: number;
    cloudJobId?: string;
  }>;

  // Storage optimization metadata
  storageMetadata: {
    totalSize: number;
    lastOptimized: number;
    compressionRatio?: number;
    cacheHitRate?: number;
    storageStrategy: StorageStrategy;
  };
}

// AI Agent Processing Status
export type AIProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

// AI Agent Node Data
export interface AIAgentNodeData {
  agentType: AIAgentType;
  agentName: string;
  description: string;
  status: AIProcessingStatus;
  processingProgress?: number; // 0-100
  inputConnections: string[]; // Node IDs connected as inputs
  outputData?: any; // Processed results
  error?: string;
  lastProcessed?: number; // timestamp
  settings?: Record<string, any>; // Agent-specific settings
}

// AI Processing Result
export interface AIProcessingResult {
  agentId: string;
  agentType: AIAgentType;
  sourceSceneId: string;
  result: any;
  metadata: {
    processedAt: number;
    processingTime: number;
    confidence?: number;
    model?: string;
  };
  error?: string;
}


export interface UnsavedSceneChanges {
  title?: string;
  tags?: string[];
}

// Keyed by analysisId, then by sceneId
export type UnsavedMetadataChanges = {
  [analysisId: string]: {
    [sceneId: string]: UnsavedSceneChanges;
  };
};


export interface SearchMatch {
  analysisId: string;
  sceneIndex: number; // Keep for display "Match in Scene #X"
  sceneId: string;    // NEW: UUID for identification
  title: string;
  tags: string[];
  nodeId?: string; // ID of the React Flow node if one exists for this scene
}