// src/utils/compatibilityLayer.ts
// Compatibility layer to bridge old and new storage systems

import type { OptimizedSceneData, NodeVideoSceneData, OptimizedProjectData, ApiAnalysisResponse, AnalyzedScene } from '../types';
import type { Node as ReactFlowNode } from 'reactflow';
import { projectDataManager } from './projectDataManager';

export interface AppNodeData {
  label: string;
  content: string;
  type: 'scene' | 'note' | 'entry' | 'intro' | 'outro' | 'ai-agent';
  videoAnalysisData?: NodeVideoSceneData;
  hasPendingChanges?: boolean;
  isDimmed?: boolean;
  isSearchResultHighlight?: boolean;
  isEditingTitle?: boolean;
  error?: string;
  [key: string]: any;
}

export type AppNodeType = ReactFlowNode<AppNodeData>;

/**
 * Convert OptimizedSceneData to legacy NodeVideoSceneData format
 * This ensures existing components continue to work
 */
export function optimizedToLegacyScene(optimizedScene: OptimizedSceneData): NodeVideoSceneData {
  return {
    analysisId: optimizedScene.analysisId || 'unknown',
    sceneIndex: optimizedScene.sceneIndex || 0,
    sceneId: optimizedScene.sceneId,
    originalVideoFileName: optimizedScene.originalVideoFileName || 'unknown.mp4',
    start: optimizedScene.currentStart, // Use current values for compatibility
    end: optimizedScene.currentEnd,
    duration: optimizedScene.currentDuration,
    title: optimizedScene.title,
    aiProcessingResults: optimizedScene.aiResults || {},
    tags: optimizedScene.tags || [],
    avgVolume: optimizedScene.avgVolume || 0,
    highEnergy: optimizedScene.highEnergy || false,
    transitionType: optimizedScene.transitionType || 'cut'
  };
}

/**
 * Convert OptimizedSceneData to React Flow node format
 * This maintains compatibility with existing React Flow setup
 */
export function optimizedSceneToNode(optimizedScene: OptimizedSceneData): AppNodeType {
  const legacySceneData = optimizedToLegacyScene(optimizedScene);

  // Safe access to analysisId with fallback
  const analysisIdPrefix = optimizedScene.analysisId ?
    optimizedScene.analysisId.substring(0, 4) :
    'unkn';

  // Ensure position is preserved from optimized scene data
  const position = optimizedScene.position || { x: 0, y: 0 };

  return {
    id: `scene_node_${analysisIdPrefix}_${optimizedScene.sceneId}`,
    type: 'default',
    position,
    data: {
      label: optimizedScene.title,
      type: 'scene',
      content: `Time: ${formatTime(optimizedScene.currentStart)}-${formatTime(optimizedScene.currentEnd)}`,
      videoAnalysisData: legacySceneData,
      hasPendingChanges: false,
      isDimmed: false,
      isSearchResultHighlight: false,
      isEditingTitle: false
    }
  };
}

/**
 * Convert array of OptimizedSceneData to React Flow nodes
 */
export function optimizedScenesToNodes(scenes: OptimizedSceneData[]): AppNodeType[] {
  const nodes = scenes
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(optimizedSceneToNode);

  // Note: Edges are now handled by the React Flow component in App.tsx
  // to ensure proper integration and avoid duplicate edge creation.

  return nodes;
}

/**
 * Update optimized scene from legacy node data
 * This allows existing node update logic to work
 */
export async function updateOptimizedSceneFromNode(nodeId: string, nodeData: AppNodeData): Promise<void> {
  if (!nodeData.videoAnalysisData) return;

  const sceneData = nodeData.videoAnalysisData;
  const project = projectDataManager.getCurrentProject();
  if (!project) return;

  const scene = project.scenes.find(s => s.sceneId === sceneData.sceneId);
  if (!scene) return;

  // Update the optimized scene with changes from the node
  const updates: Partial<OptimizedSceneData> = {
    title: sceneData.title,
    tags: sceneData.tags,
    aiResults: sceneData.aiProcessingResults || {},
    currentStart: sceneData.start,
    currentEnd: sceneData.end,
    currentDuration: sceneData.duration
  };

  await projectDataManager.updateScene(sceneData.sceneId, updates);
}

/**
 * Get legacy-compatible scene data for existing components
 */
export function getLegacySceneData(sceneId: string): NodeVideoSceneData | null {
  const project = projectDataManager.getCurrentProject();
  if (!project) return null;

  const scene = project.scenes.find(s => s.sceneId === sceneId);
  if (!scene) return null;

  return optimizedToLegacyScene(scene);
}

/**
 * Get all scenes in legacy format for existing components
 */
export function getAllLegacyScenes(): NodeVideoSceneData[] {
  const project = projectDataManager.getCurrentProject();
  if (!project) return [];

  return project.scenes
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(optimizedToLegacyScene);
}

/**
 * Format time helper (moved from existing code)
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hook to use optimized project data with legacy compatibility
 */
export function useOptimizedProject() {
  const project = projectDataManager.getCurrentProject();
  
  return {
    project,
    scenes: project?.scenes || [],
    legacyScenes: getAllLegacyScenes(),
    nodes: project ? optimizedScenesToNodes(project.scenes) : [],
    
    // Legacy compatibility methods
    updateScene: async (sceneId: string, updates: Partial<OptimizedSceneData>) => {
      await projectDataManager.updateScene(sceneId, updates);
    },
    
    reorderScenes: async (newOrder: string[]) => {
      await projectDataManager.reorderScenes(newOrder);
    },
    
    getPlaybackOrder: () => {
      return projectDataManager.getPlaybackOrder();
    }
  };
}

/**
 * Initialize the optimized system while maintaining compatibility
 */
export async function initializeOptimizedSystem(): Promise<{
  success: boolean;
  project: OptimizedProjectData | null;
  nodes: AppNodeType[];
  error?: string;
}> {
  try {
    console.log('🚀 Initializing optimized storage system...');
    
    const project = await projectDataManager.initialize();
    
    if (project) {
      const nodes = optimizedScenesToNodes(project.scenes);
      
      console.log('✅ Optimized system initialized successfully', {
        scenes: project.scenes.length,
        nodes: nodes.length
      });
      
      return {
        success: true,
        project,
        nodes
      };
    } else {
      console.log('ℹ️ No project data found, system ready for new project');
      return {
        success: true,
        project: null,
        nodes: []
      };
    }
  } catch (error) {
    console.error('❌ Failed to initialize optimized system:', error);
    return {
      success: false,
      project: null,
      nodes: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fallback to legacy system if optimized system fails
 */
export function fallbackToLegacySystem(): {
  nodes: AppNodeType[];
  hasLegacyData: boolean;
} {
  try {
    console.log('🔄 Falling back to legacy system...');
    
    const savedNodes = localStorage.getItem('storyboard-project-nodes');
    if (savedNodes) {
      const nodes = JSON.parse(savedNodes) as AppNodeType[];
      console.log('📂 Loaded nodes from legacy system:', nodes.length);
      
      return {
        nodes,
        hasLegacyData: true
      };
    }
    
    return {
      nodes: [],
      hasLegacyData: false
    };
  } catch (error) {
    console.error('❌ Legacy system fallback failed:', error);
    return {
      nodes: [],
      hasLegacyData: false
    };
  }
}

/**
 * Safe scene update that works with both systems
 */
export async function safeUpdateScene(
  sceneId: string, 
  updates: Partial<NodeVideoSceneData>
): Promise<boolean> {
  try {
    // Try optimized system first
    const project = projectDataManager.getCurrentProject();
    if (project) {
      const optimizedUpdates: Partial<OptimizedSceneData> = {
        title: updates.title,
        tags: updates.tags,
        currentStart: updates.start,
        currentEnd: updates.end,
        currentDuration: updates.duration,
        aiResults: updates.aiProcessingResults
      };
      
      await projectDataManager.updateScene(sceneId, optimizedUpdates);
      return true;
    }
    
    // Fallback to legacy system
    console.log('⚠️ Using legacy system for scene update');
    // Legacy update logic would go here if needed
    return false;
  } catch (error) {
    console.error('❌ Failed to update scene:', error);
    return false;
  }
}

/**
 * Get scene order for video playback (works with both systems)
 */
export function getVideoPlaybackOrder(): NodeVideoSceneData[] {
  const project = projectDataManager.getCurrentProject();
  if (project) {
    return projectDataManager.getPlaybackOrder().map(optimizedToLegacyScene);
  }

  // Fallback to legacy system
  const savedNodes = localStorage.getItem('storyboard-project-nodes');
  if (savedNodes) {
    const nodes = JSON.parse(savedNodes) as AppNodeType[];
    return nodes
      .filter(node => node.data.type === 'scene' && node.data.videoAnalysisData)
      .sort((a, b) => (a.data.videoAnalysisData?.sceneIndex || 0) - (b.data.videoAnalysisData?.sceneIndex || 0))
      .map(node => node.data.videoAnalysisData!)
      .filter(Boolean);
  }

  return [];
}

/**
 * STORAGE CONSOLIDATION COMPATIBILITY LAYER
 * Functions to convert OptimizedProjectData to ApiAnalysisResponse format
 * This enables components to read from the optimized system
 */

/**
 * Convert OptimizedSceneData to AnalyzedScene format
 */
export function optimizedSceneToAnalyzedScene(
  optimizedScene: OptimizedSceneData,
  projectData: OptimizedProjectData
): AnalyzedScene {
  return {
    sceneId: optimizedScene.sceneId,
    title: optimizedScene.title,
    start: optimizedScene.currentStart,
    end: optimizedScene.currentEnd,
    duration: optimizedScene.currentDuration,
    scene_index: optimizedScene.displayOrder,
    tags: optimizedScene.tags || [],
    // Map additional properties from optimized format
    avgVolume: optimizedScene.avgVolume || 0,
    highEnergy: optimizedScene.highEnergy || false,
    transitionType: optimizedScene.transitionType || 'cut',
    // Preserve original metadata for compatibility
    originalStart: optimizedScene.originalStart,
    originalEnd: optimizedScene.originalEnd,
    originalDuration: optimizedScene.originalDuration
  };
}

/**
 * Convert OptimizedProjectData to ApiAnalysisResponse format
 * This enables components to read from optimized system
 */
export function createApiAnalysisResponseFromOptimized(
  projectData: OptimizedProjectData
): ApiAnalysisResponse {
  return {
    analysisId: projectData.analysisId,
    fileName: projectData.videoFileName,
    videoUrl: projectData.videoUrl,
    scenes: projectData.scenes
      .sort((a, b) => a.displayOrder - b.displayOrder) // Ensure proper ordering
      .map(scene => optimizedSceneToAnalyzedScene(scene, projectData)),
    metadata: {
      duration: projectData.videoDuration,
      // Add other metadata fields as needed
      width: 1920, // Default values - these should be stored in optimized format
      height: 1080,
      fps: 30,
      fileSize: 0,
      format: 'mp4'
    }
  };
}
