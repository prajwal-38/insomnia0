// src/App.tsx

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './App.css';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  Background,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnConnect,
  type NodeDragHandler,
  type SelectionDragHandler,
  type XYPosition,
  type NodeOrigin,
  type NodeChange,
  type FitViewOptions,
  type Viewport,
} from 'reactflow';

import 'reactflow/dist/style.css';
import CustomSceneNode, { type CustomNodeData } from './CustomSceneNode.tsx';
import CustomEdge, { type CustomEdgeData } from './CustomEdge.tsx';
import AIAgentNode from './components/AIAgentNode.tsx';
import './components/AIAgentNode.css';
import Sidebar, { type PanelKey } from './Sidebar.tsx';
import InteractiveSceneModal from './components/InteractiveSceneModal';
import AISidePanel from './components/AISidePanel';

import { v4 as uuidv4 } from 'uuid';
import type { ApiAnalysisResponse, NodeVideoSceneData, AnalyzedScene, UnsavedSceneChanges, SearchMatch, UnsavedMetadataChanges, AIAgentNodeData, AIAgentType } from './types';
import { geminiService } from './services/geminiService';
import { aiProcessingManager } from './services/aiProcessingManager';
import { unifiedDataService } from './services/unifiedDataService';
import { timelineIntegrationService } from './services/timelineIntegrationService';
import { storyTimelineSync } from './services/storyTimelineSync';

import { formatTime } from './utils';
import Fuse from 'fuse.js';
import { useStoryboardElements } from './hooks/useStoryboardElements.ts';
import { projectDataManager } from './utils/projectDataManager';
import {
  initializeOptimizedSystem,
  fallbackToLegacySystem,
  optimizedScenesToNodes
} from './utils/compatibilityLayer';
import type { OptimizedProjectData } from './types';
import './utils/testOptimizedSystem'; // Import test functions for development
import './utils/timelineEndpointDemo'; // Import timeline demo for testing
import './utils/debugCurrentData'; // Import debug functions
import './utils/testStorageConsolidation'; // Import storage consolidation tests
import './utils/testSubtitleGenerator'; // Import subtitle generator tests
import './utils/testTranslationFix'; // Import translation integration tests
import Editor from './features/editor';
import useDataState from './features/editor/store/use-data-state';
import { getCompactFontData } from './features/editor/utils/fonts';
import { FONTS } from './features/editor/data/fonts';
import { getApiBaseUrl } from './config/environment';
import { useAuth } from './contexts/AuthContext';
import { ProjectManager } from './utils/projectManager';

// Corrected Debounce Utility Function (NOT a hook)
function debounceUtility<F extends (...args: any[]) => any>(func: F, waitFor: number): (...args: Parameters<F>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
}

// AppNodeData now includes presentation fields directly
export interface AppNodeData {
  label: string;
  content: string;
  type: 'scene' | 'note' | 'entry' | 'intro' | 'outro' | 'ai-agent';
  videoAnalysisData?: NodeVideoSceneData; // Includes sceneId
  aiAgentData?: AIAgentNodeData; // For AI agent nodes
  hasPendingChanges?: boolean;
  isDimmed?: boolean;
  isSearchResultHighlight?: boolean;
  isEditingTitle?: boolean; // For non-scene nodes, managed by App.tsx state
  error?: string;
  retryAction?: () => void;
  // Callbacks like onOpenInteractivePreview will be added by nodesWithHandlers
}

export type AppNodeType = Node<AppNodeData>;
export type AppEdgeType = Edge<CustomEdgeData>;

const nodeOriginConst: NodeOrigin = [0.5, 0.5];
const GRID_SIZE = 30;
const CURRENT_ANALYSIS_DATA_KEY = 'storyboard-current-analysis';
const PROJECT_NODES_KEY = 'storyboard-project-nodes';
const PROJECT_EDGES_KEY = 'storyboard-project-edges';
const PROJECT_VIEWPORT_KEY = 'storyboard-project-viewport';
const CURRENT_VIEW_KEY = 'storyboard-current-view';

// Helper function to get project-specific storage keys
const getProjectStorageKey = (baseKey: string, projectId?: string) => {
  return projectId ? `${baseKey}-${projectId}` : baseKey;
};


const initialNodesTemplateFn = (): AppNodeType[] => [ { id: 'entry-point', type: 'default', position: { x: 100, y: 200 }, data: { label: 'Start Your Story', content: 'This is where your narrative begins...', type: 'entry', isDimmed: false, isSearchResultHighlight: false, isEditingTitle: false } }, { id: 'sample-scene-1', type: 'default', position: { x: 400, y: 150 }, data: { label: 'My First Scene', content: 'Describe what happens here.', type: 'scene', isDimmed: false, isSearchResultHighlight: false, isEditingTitle: false } }, { id: 'sample-note-1', type: 'default', position: { x: 400, y: 300 }, data: { label: 'A Quick Note', content: 'Important detail or idea.', type: 'note', isDimmed: false, isSearchResultHighlight: false, isEditingTitle: false } }, { id: 'sample-outro-1', type: 'default', position: { x: 700, y: 200 }, data: { label: 'An Ending Idea', content: 'How could this conclude?', type: 'outro', isDimmed: false, isSearchResultHighlight: false, isEditingTitle: false } }, ];
const initialEdgesTemplateFn = (): AppEdgeType[] => [ {id: 'e-entry-scene1', source: 'entry-point', target: 'sample-scene-1', type: 'custom', animated: true}, {id: 'e-scene1-outro1', source: 'sample-scene-1', target: 'sample-outro-1', type: 'custom', animated: true}, {id: 'e-scene1-note1', source: 'sample-scene-1', target: 'sample-note-1', type: 'custom', animated: false, style:{strokeDasharray: '5 5', strokeWidth: 1.5}}, ];


// Node and edge types defined outside component to prevent React Flow warnings
const nodeTypes = {
  default: CustomSceneNode,
  aiAgent: AIAgentNode
};
const edgeTypes = { custom: CustomEdge };

const fitViewOptionsFull: FitViewOptions = { padding: 0.70, duration: 500 };
const fitViewOptionsNodeFocus: FitViewOptions = { padding: 0.6, duration: 600, maxZoom: 1.5 };

interface ToastMessageItem {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
  duration?: number;
  onRetry?: () => void;
}

// View mode type
type ViewMode = 'story' | 'timeline';

function AppContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, setViewport, getNodes, getNode, getEdges, deleteElements, fitView, screenToFlowPosition } = useReactFlow<AppNodeData, CustomEdgeData>();

  // View mode state with persistence
  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(CURRENT_VIEW_KEY);
    return (saved === 'timeline' || saved === 'story') ? saved : 'story';
  });

  // Optimized system state
  const [optimizedProject, setOptimizedProject] = useState<OptimizedProjectData | null>(null);
  const [isOptimizedSystemReady, setIsOptimizedSystemReady] = useState(false);

  // Timeline font initialization
  const { setCompactFonts, setFonts } = useDataState();

  // Initialize fonts for timeline
  useEffect(() => {
    setCompactFonts(getCompactFontData(FONTS));
    setFonts(FONTS);
  }, [setCompactFonts, setFonts]);

  // Validate project access and redirect if necessary
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // If we have a projectId in the URL, validate that the user owns this project
    if (projectId) {
      const userProjects = ProjectManager.getAllProjects(user.id);
      const project = userProjects.find(p => p.id === projectId);

      if (!project) {
        console.warn(`Project ${projectId} not found or not accessible to user ${user.id}`);
        navigate('/', { replace: true });
        return;
      }

      // Set the current project ID in localStorage for compatibility
      localStorage.setItem('storyboard-current-project-id', projectId);
      console.log(`✅ Project ${projectId} validated for user ${user.id}`);
    } else {
      // If no projectId in URL but we're in the editor, redirect to home
      console.warn('No project ID in URL, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [projectId, user, isAuthenticated, navigate]);

  // Initialize optimized system on component mount
  useEffect(() => {
    const initializeSystem = async () => {
      try {
        console.log('🚀 Initializing optimized storage system...');
        const result = await initializeOptimizedSystem();

        if (result.success) {
          setOptimizedProject(result.project);
          setIsOptimizedSystemReady(true);

          if (result.project && result.nodes.length > 0) {
            console.log('✅ Using optimized system with migrated data');
            console.log('🔧 Scene nodes from optimized system:', result.nodes.map(n => ({
              id: n.id,
              type: n.data.type,
              sceneId: n.data.videoAnalysisData?.sceneId,
              label: n.data.label
            })));
            // Update nodes from optimized system
            setNodes(result.nodes);

            // Restore edges from localStorage to maintain AI agent connections
            const edgesStorageKey = getProjectStorageKey(PROJECT_EDGES_KEY, projectId);
            const savedEdges = localStorage.getItem(edgesStorageKey);
            if (savedEdges) {
              try {
                const edges = JSON.parse(savedEdges);
                setEdges(edges);
                console.log('🔗 Restored edges from localStorage:', edges.length, 'key:', edgesStorageKey);
              } catch (error) {
                console.error('❌ Failed to restore edges:', error);
                setEdges([]);
              }
            } else {
              setEdges([]);
            }
          } else {
            console.log('ℹ️ Optimized system ready, no existing data');

            // Try to restore nodes and edges from localStorage even if optimized system has no data
            const nodesStorageKey = getProjectStorageKey(PROJECT_NODES_KEY, projectId);
            const edgesStorageKey = getProjectStorageKey(PROJECT_EDGES_KEY, projectId);
            const savedNodes = localStorage.getItem(nodesStorageKey);
            const savedEdges = localStorage.getItem(edgesStorageKey);

            if (savedNodes) {
              try {
                const nodes = JSON.parse(savedNodes);
                setNodes(nodes);
                console.log('🔄 Restored nodes from localStorage fallback:', nodes.length, 'key:', nodesStorageKey);
              } catch (error) {
                console.error('❌ Failed to restore nodes from localStorage:', error);
              }
            }

            if (savedEdges) {
              try {
                const edges = JSON.parse(savedEdges);
                setEdges(edges);
                console.log('🔗 Restored edges from localStorage fallback:', edges.length, 'key:', edgesStorageKey);
              } catch (error) {
                console.error('❌ Failed to restore edges from localStorage:', error);
              }
            }
          }
        } else {
          console.warn('⚠️ Optimized system failed, falling back to legacy');
          const fallback = fallbackToLegacySystem();
          setNodes(fallback.nodes);

          // Also restore edges in fallback mode
          const edgesStorageKey = getProjectStorageKey(PROJECT_EDGES_KEY, projectId);
          const savedEdges = localStorage.getItem(edgesStorageKey);
          if (savedEdges) {
            try {
              const edges = JSON.parse(savedEdges);
              setEdges(edges);
              console.log('🔗 Restored edges in fallback mode:', edges.length, 'key:', edgesStorageKey);
            } catch (error) {
              console.error('❌ Failed to restore edges in fallback mode:', error);
              setEdges([]);
            }
          } else {
            setEdges([]);
          }

          setIsOptimizedSystemReady(true);
        }
      } catch (error) {
        console.error('❌ Failed to initialize optimized system:', error);
        const fallback = fallbackToLegacySystem();
        setNodes(fallback.nodes);
        setIsOptimizedSystemReady(true);
      }
    };

    initializeSystem();
  }, []); // Run once on mount

  const { nodes, setNodes, edges, setEdges, onEdgesChange: onEdgesChangeFromHook } = useStoryboardElements(
    () => {
        // Return empty array initially, will be populated by optimized system
        return [];
    },
    () => {
        // Return empty array initially, edges will be removed
        return [];
    },
    nodeOriginConst
  );

  const showToast = useCallback((message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info', duration: number = 3000, onRetry?: () => void) => {
    const id = uuidv4();
    console.log(`Toast (${type}): ${message}`, onRetry ? "with retry" : "");
    setToasts(prev => [...prev, { id, message, type, duration, onRetry }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);


    // AI Processing Handler
    // Handle AI agent settings changes
  const handleAIAgentSettingsChange = useCallback((agentId: string, settings: Record<string, any>) => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        if (node.id === agentId && node.data.type === 'ai-agent' && node.data.aiAgentData) {
          return {
            ...node,
            data: {
              ...node.data,
              aiAgentData: {
                ...node.data.aiAgentData,
                settings: settings
              }
            }
          } as AppNodeType;
        }
        return node;
      })
    );
  }, [setNodes]);

  const handleAIProcessing = useCallback(async (sceneNode: AppNodeType, aiNode: AppNodeType) => {
      console.log('🔄 handleAIProcessing called:', {
        sceneId: sceneNode.data.videoAnalysisData?.sceneId,
        agentType: aiNode.data.aiAgentData?.agentType,
        hasSceneData: !!sceneNode.data.videoAnalysisData,
        hasAgentData: !!aiNode.data.aiAgentData
      });

      if (!sceneNode.data.videoAnalysisData || !aiNode.data.aiAgentData) {
        console.error('❌ Missing required data for AI processing:', {
          sceneData: !!sceneNode.data.videoAnalysisData,
          agentData: !!aiNode.data.aiAgentData
        });
        return;
      }
  
      const sceneData = sceneNode.data.videoAnalysisData;
      const agentData = aiNode.data.aiAgentData;
  
      try {
        // Update AI node to processing state
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.id === aiNode.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    aiAgentData: {
                      ...agentData,
                      status: 'processing',
                      processingProgress: 0
                    }
                  }
                }
              : node
          )
        );
  
        // Simulate processing progress
        const progressInterval = setInterval(() => {
          setNodes((prevNodes) =>
            prevNodes.map((node) => {
              if (node.id === aiNode.id && node.data.aiAgentData?.status === 'processing') {
                const currentProgress = node.data.aiAgentData.processingProgress || 0;
                const newProgress = Math.min(currentProgress + 10, 90);
                return {
                  ...node,
                  data: {
                    ...node.data,
                    aiAgentData: {
                      ...node.data.aiAgentData,
                      processingProgress: newProgress
                    }
                  }
                };
              }
              return node;
            })
          );
        }, 500);
  
        // Use AI processing manager for ALL agent types (now includes real implementations)
        // Pass agent settings for translation agent
        const agentSettings = agentData.settings || {};

        const result = await aiProcessingManager.processScene(
          aiNode.id,
          agentData.agentType,
          sceneData,
          agentSettings,
          (progress) => {
            setNodes((prevNodes) =>
              prevNodes.map((node) => {
                if (node.id === aiNode.id && node.data.aiAgentData?.status === 'processing') {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      aiAgentData: {
                        ...node.data.aiAgentData,
                        processingProgress: progress
                      }
                    }
                  };
                }
                return node;
              })
            );
          }
        );
  
        clearInterval(progressInterval);
  
        // Update AI node to completed state
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (node.id === aiNode.id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  aiAgentData: {
                    ...agentData,
                    status: 'completed',
                    processingProgress: 100,
                    outputData: result,
                    lastProcessed: Date.now()
                  }
                }
              };
            }
            // Also update the scene node with AI processing results
            if (node.id === sceneNode.id && node.data.videoAnalysisData) {
              const aiResults = node.data.videoAnalysisData.aiProcessingResults || {};

              // For audio-translator, replace the video URL with translated version
              let updatedVideoAnalysisData = { ...node.data.videoAnalysisData };
              if (agentData.agentType === 'audio-translator' && (result as any).translatedVideoUrl) {
                const translationResult = result as any;
                console.log('🌐 Replacing scene video URL with translated version:', {
                  sceneId: node.data.videoAnalysisData.sceneId,
                  translatedUrl: translationResult.translatedVideoUrl
                });

                // Add translation info to the scene data
                updatedVideoAnalysisData = {
                  ...updatedVideoAnalysisData,
                  translatedVideoUrl: translationResult.translatedVideoUrl,
                  isTranslated: true,
                  translationInfo: {
                    targetLanguage: translationResult.targetLanguage,
                    voice: translationResult.voice,
                    originalLanguage: translationResult.originalLanguage || 'en',
                    translatedAt: Date.now(),
                    agentId: aiNode.id,
                    processingTime: translationResult.processingTime
                  }
                } as any; // Cast to any to avoid type conflicts
              }

              return {
                ...node,
                data: {
                  ...node.data,
                  videoAnalysisData: {
                    ...updatedVideoAnalysisData,
                    aiProcessingResults: {
                      ...aiResults,
                      [agentData.agentType]: {
                        result,
                        processedAt: Date.now(),
                        agentId: aiNode.id,
                        status: 'completed'
                      }
                    }
                  }
                }
              };
            }
            return node;
          })
        );
  
        // Update unified data service with AI results
        if (sceneNode.data.videoAnalysisData?.sceneId) {
          const aiProcessingResult = {
            agentId: aiNode.id,
            agentType: agentData.agentType,
            sourceSceneId: sceneNode.data.videoAnalysisData.sceneId,
            result,
            metadata: {
              processedAt: Date.now(),
              processingTime: 2000, // Approximate
              confidence: 0.9
            }
          };

          await unifiedDataService.updateSceneAIResults(
            sceneNode.data.videoAnalysisData.sceneId,
            agentData.agentType,
            aiProcessingResult
          );

          // If this is an audio translation result, update the scene data with translated video URL
          if (agentData.agentType === 'audio-translator' && (result as any).translatedVideoUrl) {
            const translationResult = result as any;
            console.log(`🌐 App: Updating scene ${sceneNode.data.videoAnalysisData?.sceneId} with translated video URL`);

            // CRITICAL: Update project data manager first
            try {
              const currentProject = projectDataManager.getCurrentProject();
              if (currentProject && sceneNode.data.videoAnalysisData?.sceneId) {
                const sceneToUpdate = currentProject.scenes.find(s => s.sceneId === sceneNode.data.videoAnalysisData!.sceneId);
                if (sceneToUpdate) {
                  // Add translation data to the scene
                  (sceneToUpdate as any).translatedVideoUrl = translationResult.translatedVideoUrl;
                  (sceneToUpdate as any).isTranslated = true;
                  (sceneToUpdate as any).translationInfo = {
                    targetLanguage: translationResult.targetLanguage,
                    originalLanguage: translationResult.originalLanguage || 'en',
                    voice: translationResult.voice,
                    translatedAt: Date.now(),
                    agentId: aiNode.id,
                    processingTime: translationResult.processingTime
                  };

                  // Save the updated project
                  await projectDataManager.saveProject(currentProject);
                  console.log(`💾 App: Translation data saved to project manager for scene ${sceneNode.data.videoAnalysisData!.sceneId}`);
                }
              }
            } catch (error) {
              console.error('❌ App: Failed to update project data with translation:', error);
            }

            // Update currentAnalysisData with translated video URL
            setCurrentAnalysisData(prevData => {
              if (!prevData || !sceneNode.data.videoAnalysisData?.sceneId) return prevData;

              const updatedScenes = prevData.scenes.map(scene => {
                if (scene.sceneId === sceneNode.data.videoAnalysisData!.sceneId) {
                  return {
                    ...scene,
                    translatedVideoUrl: translationResult.translatedVideoUrl,
                    isTranslated: true,
                    translationInfo: {
                      targetLanguage: translationResult.targetLanguage,
                      voice: translationResult.voice,
                      originalLanguage: translationResult.originalLanguage || 'en',
                      translatedAt: Date.now(),
                      agentId: aiNode.id,
                      processingTime: translationResult.processingTime
                    }
                  };
                }
                return scene;
              });

              const updatedData = {
                ...prevData,
                scenes: updatedScenes
              };

              // Update localStorage immediately
              localStorage.setItem('currentAnalysisData', JSON.stringify(updatedData));

              return updatedData;
            });

            // Force update modal scene data if it's currently open for this scene
            if (modalSceneData && modalSceneData.sceneId === sceneNode.data.videoAnalysisData.sceneId) {
              console.log(`🔄 App: Force updating modal scene data with translation info`);
              setModalSceneData(prev => prev ? {
                ...prev,
                translatedVideoUrl: result.result.translatedVideoUrl,
                isTranslated: true,
                translationInfo: {
                  targetLanguage: result.result.targetLanguage,
                  voice: result.result.voice,
                  originalLanguage: result.result.originalLanguage || 'en',
                  translatedAt: Date.now(),
                  agentId: aiNode.id,
                  processingTime: result.result.processingTime
                }
              } : null);
            }

            // Dispatch event to notify NodeTimeline and other components
            const eventDetail = {
              sceneId: sceneNode.data.videoAnalysisData.sceneId,
              translatedVideoUrl: translationResult.translatedVideoUrl,
              translationInfo: {
                targetLanguage: translationResult.targetLanguage,
                voice: translationResult.voice,
                originalLanguage: translationResult.originalLanguage || 'en',
                translatedAt: Date.now(),
                agentId: aiNode.id,
                processingTime: translationResult.processingTime
              }
            };

            console.log(`🌐 App: Dispatching video-translation-completed event:`, eventDetail);
            window.dispatchEvent(new CustomEvent('video-translation-completed', {
              detail: eventDetail
            }));

            // CRITICAL: Force a complete refresh of the modal scene data to ensure NodeTimeline gets updated data
            setTimeout(() => {
              if (modalSceneData && sceneNode.data.videoAnalysisData?.sceneId && modalSceneData.sceneId === sceneNode.data.videoAnalysisData.sceneId) {
                console.log(`🔄 App: Force refreshing modal scene data after translation`);
                const refreshedScene = currentAnalysisData?.scenes.find(s => s.sceneId === sceneNode.data.videoAnalysisData!.sceneId);
                if (refreshedScene) {
                  setModalSceneData(prev => prev ? {
                    ...refreshedScene,
                    aiProcessingResults: prev.aiProcessingResults
                  } : null);
                  console.log(`✅ App: Modal scene data force refreshed with translation data`);
                }
              }
            }, 100); // Small delay to ensure state updates have propagated

            console.log(`✅ App: Scene data updated, project saved, and event dispatched for scene ${sceneNode.data.videoAnalysisData.sceneId}`);
          }

          // 🚫 PREVENT SUBTITLE CASCADE: Only trigger timeline sync for non-subtitle agents
          // Subtitle agents don't need full timeline sync as they only add captions
          if (aiNode.data.aiAgentData?.agentType !== 'subtitle-generator') {
            console.log('🔄 Triggering timeline sync after AI processing completion');
            storyTimelineSync.forceSyncTimeline();
          } else {
            console.log('📝 Subtitle processing complete - skipping timeline sync to prevent cascade');
          }
        }
  
        showToast(`✅ ${aiNode.data.label} processing completed! Results saved and synced.`, 'success');
  
      } catch (error) {
        console.error('AI processing error:', error);
  
        // Update AI node to error state
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.id === aiNode.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    aiAgentData: {
                      ...agentData,
                      status: 'error',
                      error: error instanceof Error ? error.message : 'Processing failed'
                    }
                  }
                }
              : node
          )
        );
  
        showToast(`❌ ${aiNode.data.label} processing failed`, 'error');
      }
    }, [setNodes, showToast]);

  // Test API connection on-demand when user tries to use AI features
  const testApiConnectionOnDemand = useCallback(async () => {
    console.log('🔍 Testing Gemini API connection on-demand...');
    try {
      const connected = await geminiService.testConnection();
      setGeminiApiConnected(connected);
      if (connected) {
        showToast('✅ Gemini API connection successful!', 'success');
      } else {
        showToast('⚠️ Gemini API connection failed. AI processing will use fallback methods.', 'warning');
      }
      return connected;
    } catch (error) {
      setGeminiApiConnected(false);
      showToast('⚠️ Gemini API connection failed. AI processing will use fallback methods.', 'warning');
      return false;
    }
  }, [showToast]);

  // Save nodes and edges to localStorage (re-enabled for AI agent persistence)
  useEffect(() => {
    const storageKey = getProjectStorageKey(PROJECT_NODES_KEY, projectId);
    localStorage.setItem(storageKey, JSON.stringify(nodes));
    // Only log when nodes count changes significantly to reduce spam
    if (nodes.length % 5 === 0 || nodes.length === 0) {
      console.log('💾 Saved nodes to localStorage:', nodes.length, 'key:', storageKey);
    }
  }, [nodes, projectId]);
  useEffect(() => {
    const storageKey = getProjectStorageKey(PROJECT_EDGES_KEY, projectId);
    localStorage.setItem(storageKey, JSON.stringify(edges));
    // Only log when edges count changes significantly to reduce spam
    if (edges.length % 5 === 0 || edges.length === 0) {
      console.log('💾 Saved edges to localStorage:', edges.length, 'key:', storageKey);
    }
  }, [edges, projectId]);

  // Restore AI processing connections after page refresh
  useEffect(() => {
    if (!isOptimizedSystemReady || edges.length === 0) return;

    console.log('🔄 Checking for AI connections to restore after refresh...');

    // Find AI agent to scene connections
    const aiConnections = edges.filter(edge => {
      const sourceNode = getNode(edge.source);
      const targetNode = getNode(edge.target);

      return (sourceNode?.data.type === 'ai-agent' && targetNode?.data.type === 'scene') ||
             (sourceNode?.data.type === 'scene' && targetNode?.data.type === 'ai-agent');
    });

    if (aiConnections.length > 0) {
      console.log(`🤖 Found ${aiConnections.length} AI connections to restore`);

      // Delay to ensure all systems are ready
      setTimeout(() => {
        aiConnections.forEach(edge => {
          const sourceNode = getNode(edge.source);
          const targetNode = getNode(edge.target);

          if (sourceNode && targetNode) {
            // Determine which is the AI agent and which is the scene
            const aiNode = sourceNode.data.type === 'ai-agent' ? sourceNode : targetNode;
            const sceneNode = sourceNode.data.type === 'scene' ? sourceNode : targetNode;

            if (aiNode.data.aiAgentData && sceneNode.data.videoAnalysisData) {
              console.log(`🔄 Restoring AI connection: ${aiNode.data.aiAgentData.agentType} → Scene ${sceneNode.data.videoAnalysisData.sceneId}`);

              // Check if processing already exists
              const existingResult = sceneNode.data.videoAnalysisData.aiProcessingResults?.[aiNode.data.aiAgentData.agentType];

              if (!existingResult) {
                console.log(`🚀 Triggering AI processing for restored connection`);
                handleAIProcessing(sceneNode as AppNodeType, aiNode as AppNodeType);
              } else {
                console.log(`✅ AI processing result already exists for this connection`);
              }
            }
          }
        });
      }, 1000); // 1 second delay to ensure all systems are ready
    }
  }, [isOptimizedSystemReady, edges, getNode, handleAIProcessing]);
  useEffect(() => { localStorage.setItem(CURRENT_VIEW_KEY, currentView); }, [currentView]);
  useEffect(() => {
    const viewportStorageKey = getProjectStorageKey(PROJECT_VIEWPORT_KEY, projectId);
    const savedViewport = localStorage.getItem(viewportStorageKey);
    if (savedViewport) {
        try { const viewport = JSON.parse(savedViewport) as Viewport; setViewport(viewport); }
        catch (e) { console.error("Error parsing saved viewport", e); }
    }
  }, [setViewport, projectId]);


  const [unsavedMetadataChanges, setUnsavedMetadataChanges] = useState<UnsavedMetadataChanges>({});
  const [selectedSceneIdsInEditor, setSelectedSceneIdsInEditor] = useState<Set<string>>(new Set());

  const updateOneUnsavedSceneChange = useCallback((analysisId: string, sceneId: string, newChanges: UnsavedSceneChanges, originalSceneData?: { title: string; tags: string[] }) => {
    setUnsavedMetadataChanges(prev => {
      const newAnalysisChanges = { ...(prev[analysisId] || {}) };
      const existingSceneChanges = { ...(newAnalysisChanges[sceneId] || {}) };

      if (newChanges.title !== undefined) {
        if (originalSceneData && newChanges.title === originalSceneData.title && existingSceneChanges.title !== undefined) {
          delete existingSceneChanges.title;
        } else if (newChanges.title !== (originalSceneData?.title ?? "")) {
          existingSceneChanges.title = newChanges.title;
        } else if (newChanges.title === (originalSceneData?.title ?? "") && existingSceneChanges.title !== undefined) {
          delete existingSceneChanges.title;
        }
      }
      if (newChanges.tags !== undefined) {
         if (originalSceneData && JSON.stringify(newChanges.tags.sort()) === JSON.stringify(originalSceneData.tags.sort()) && existingSceneChanges.tags !== undefined) {
            delete existingSceneChanges.tags;
         } else if (JSON.stringify(newChanges.tags.sort()) !== JSON.stringify((originalSceneData?.tags || []).sort())) {
            existingSceneChanges.tags = newChanges.tags;
         } else if (JSON.stringify(newChanges.tags.sort()) === JSON.stringify((originalSceneData?.tags || []).sort()) && existingSceneChanges.tags !== undefined){
            delete existingSceneChanges.tags;
         }
      }

      if (Object.keys(existingSceneChanges).length > 0) {
        newAnalysisChanges[sceneId] = existingSceneChanges;
      } else {
        delete newAnalysisChanges[sceneId];
      }

      if (Object.keys(newAnalysisChanges).length > 0) {
        return { ...prev, [analysisId]: newAnalysisChanges };
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [analysisId]: _, ...rest } = prev;
        return rest;
      }
    });
  }, []);

  const resetAllMetadataState = useCallback(() => {
    setUnsavedMetadataChanges({});
    setSelectedSceneIdsInEditor(new Set());
  }, []);


  const [activePanelKey, setActivePanelKey] = useState<PanelKey | null>(null);
  // 🚀 SINGLE STORAGE: Get currentAnalysisData from optimized system only
  const [currentAnalysisData, setCurrentAnalysisData] = useState<ApiAnalysisResponse | null>(null);

  // Update global analysis ID whenever currentAnalysisData changes
  useEffect(() => {
    if (currentAnalysisData?.analysisId) {
      (window as any).currentAnalysisId = currentAnalysisData.analysisId;
      // Also store in localStorage as fallback
      localStorage.setItem('currentAnalysisData', JSON.stringify(currentAnalysisData));
    } else {
      (window as any).currentAnalysisId = null;
      localStorage.removeItem('currentAnalysisData');
    }
  }, [currentAnalysisData]);

  // Initialize analysis ID from project data on app load
  useEffect(() => {
    const initializeAnalysisId = async () => {
      try {
        // First check if there's a fresh analysis ID from a new upload
        const freshAnalysisId = localStorage.getItem('storyboard-current-analysis');
        if (freshAnalysisId && !currentAnalysisData) {
          console.log('🆕 Found fresh analysis ID from new upload:', freshAnalysisId);

          // Try to fetch the fresh analysis data from the server
          try {
            const { buildApiUrl } = await import('./config/environment');
            const apiUrl = buildApiUrl(`/api/analysis/${freshAnalysisId}`);

            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            });

            if (response.ok) {
              const analysisData = await response.json();
              console.log('✅ Successfully loaded fresh analysis data:', {
                analysisId: analysisData.analysisId,
                scenes: analysisData.scenes?.length || 0,
                fileName: analysisData.fileName
              });

              // Process the fresh analysis data
              await handleAnalysisComplete(analysisData);
              return; // Exit early since we found fresh data
            } else {
              console.warn('⚠️ Fresh analysis not found on server, falling back to project data');
            }
          } catch (error) {
            console.warn('⚠️ Failed to fetch fresh analysis data:', error);
          }
        }

        // If we don't have currentAnalysisData but we have a project, restore it
        if (!currentAnalysisData) {
          const project = projectDataManager.getCurrentProject();
          if (project?.analysisId) {
            console.log('🔄 Restoring analysis ID from project data:', project.analysisId);

            // Validate that the analysis still exists on the server before restoring
            try {
              const { buildApiUrl } = await import('./config/environment');
              const apiUrl = buildApiUrl(`/api/analysis/${project.analysisId}`);

              const response = await fetch(apiUrl, {
                method: 'HEAD', // Just check if it exists, don't fetch full data
                headers: {
                  'Accept': 'application/json',
                },
              });

              if (response.ok) {
                // Analysis exists on server, safe to restore
                (window as any).currentAnalysisId = project.analysisId;

                // Try to restore full analysis data from localStorage
                const storedAnalysisData = localStorage.getItem('currentAnalysisData');
                if (storedAnalysisData) {
                  try {
                    const analysisData = JSON.parse(storedAnalysisData);
                    if (analysisData.analysisId === project.analysisId) {
                      setCurrentAnalysisData(analysisData);
                      console.log('✅ Restored full analysis data from localStorage');
                    }
                  } catch (error) {
                    console.warn('Failed to restore analysis data from localStorage:', error);
                  }
                }
              } else if (response.status === 404) {
                console.warn(`⚠️ Analysis ${project.analysisId} no longer exists on server. Clearing stale project data.`);

                // Clear stale project data
                await projectDataManager.clearProject();
                (window as any).currentAnalysisId = null;
                localStorage.removeItem('currentAnalysisData');

                console.log('✅ Cleared stale project data. Ready for new video upload.');
              } else {
                console.warn(`⚠️ Could not verify analysis ${project.analysisId} (status: ${response.status}). Proceeding with caution.`);
                (window as any).currentAnalysisId = project.analysisId;
              }
            } catch (networkError) {
              console.warn('⚠️ Network error checking analysis validity. Proceeding with cached data:', networkError);
              (window as any).currentAnalysisId = project.analysisId;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to initialize analysis ID:', error);
      }
    };

    initializeAnalysisId();
  }, []); // Run once on mount

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSceneData, setModalSceneData] = useState<(AnalyzedScene & { aiProcessingResults?: NodeVideoSceneData['aiProcessingResults'] }) | null>(null);

  // Update modal scene data when currentAnalysisData changes (e.g., when translation completes)
  useEffect(() => {
    if (modalSceneData && currentAnalysisData) {
      const updatedScene = currentAnalysisData.scenes.find(s => s.sceneId === modalSceneData.sceneId);
      if (updatedScene) {
        console.log(`🔄 App: Updating modal scene data for scene ${modalSceneData.sceneId}`);

        // Check if translation data has been added
        const hasTranslationData = (updatedScene as any).translatedVideoUrl || (updatedScene as any).isTranslated;
        if (hasTranslationData) {
          console.log('🌐 App: Modal scene data includes translation info:', {
            translatedVideoUrl: (updatedScene as any).translatedVideoUrl,
            isTranslated: (updatedScene as any).isTranslated,
            targetLanguage: (updatedScene as any).translationInfo?.targetLanguage
          });
        }

        setModalSceneData(prev => prev ? {
          ...updatedScene,
          aiProcessingResults: prev.aiProcessingResults // Preserve AI processing results
        } : null);
      }
    }
  }, [currentAnalysisData, modalSceneData?.sceneId]);

  const [isFlowRendered, setIsFlowRendered] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  // AI Chat Panel State
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  // Auto-hide sidebar when in timeline view, show when in story view
  useEffect(() => {
    if (currentView === 'timeline') {
      setIsSidebarVisible(false);
      setActivePanelKey(null);
    } else if (currentView === 'story') {
      setIsSidebarVisible(true);
    }
  }, [currentView, setActivePanelKey]);

  const [toasts, setToasts] = useState<ToastMessageItem[]>([]);


  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 🚀 SINGLE STORAGE: Load currentAnalysisData from optimized system only
  useEffect(() => {
    const loadFromOptimizedSystem = () => {
      const project = projectDataManager.getCurrentProject();
      console.log('🔍 Loading from optimized system:', {
        hasProject: !!project,
        scenes: project?.scenes?.length || 0,
        projectId: project?.projectId,
        analysisId: project?.analysisId,
        videoFileName: project?.videoFileName
      });

      if (project && project.scenes && project.scenes.length > 0) {
        // Convert optimized project to ApiAnalysisResponse format
        const analysisData: ApiAnalysisResponse = {
          analysisId: project.analysisId,
          fileName: project.videoFileName,
          videoUrl: project.videoUrl,
          scenes: project.scenes
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(scene => ({
              sceneId: scene.sceneId,
              title: scene.title,
              start: scene.currentStart,
              end: scene.currentEnd,
              duration: scene.currentDuration,
              scene_index: scene.displayOrder,
              tags: scene.tags || [],
              avg_volume: scene.avgVolume || 0,
              high_energy: scene.highEnergy ? 1 : 0,
              transition_type: scene.transitionType || 'cut',
              // Include translation data from project
              translatedVideoUrl: (scene as any).translatedVideoUrl,
              isTranslated: (scene as any).isTranslated,
              translationInfo: (scene as any).translationInfo
            })),
          metadata: {
            duration: project.videoDuration,
            width: 1920, // Default values - should be stored in optimized format
            height: 1080,
            fps: 30
          }
        };
        setCurrentAnalysisData(analysisData);
        console.log('📊 Loaded currentAnalysisData from optimized system:', {
          scenes: analysisData.scenes.length,
          fileName: analysisData.fileName,
          analysisId: analysisData.analysisId
        });

        // Also store in localStorage for other components to access
        localStorage.setItem('currentAnalysisData', JSON.stringify(analysisData));
      } else {
        console.log('⚠️ No project data or scenes found, checking localStorage fallback...');

        // Try to load from localStorage as fallback
        const storedAnalysisData = localStorage.getItem('currentAnalysisData');
        if (storedAnalysisData) {
          try {
            const parsedData = JSON.parse(storedAnalysisData);
            setCurrentAnalysisData(parsedData);
            console.log('📊 Loaded currentAnalysisData from localStorage fallback:', {
              scenes: parsedData.scenes?.length || 0,
              fileName: parsedData.fileName
            });
          } catch (error) {
            console.error('❌ Failed to parse stored analysis data:', error);
            setCurrentAnalysisData(null);
          }
        } else {
          setCurrentAnalysisData(null);
        }
      }
    };

    // Initial load
    loadFromOptimizedSystem();

    // Single delayed load attempt to ensure project manager is initialized
    const delayedLoadTimeout = setTimeout(() => {
      loadFromOptimizedSystem();
    }, 1000);

    // Cleanup timeout on unmount
    return () => clearTimeout(delayedLoadTimeout);

    // Listen for optimized system updates
    const handleOptimizedUpdate = () => {
      loadFromOptimizedSystem();
    };

    // Also listen for project data manager updates
    const handleProjectUpdate = () => {
      loadFromOptimizedSystem();
    };

    window.addEventListener('optimizedProjectUpdated', handleOptimizedUpdate);
    window.addEventListener('projectDataUpdated', handleProjectUpdate);

    return () => {
      window.removeEventListener('optimizedProjectUpdated', handleOptimizedUpdate);
      window.removeEventListener('projectDataUpdated', handleProjectUpdate);
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]); // This still holds SearchMatch[]
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number | null>(null);
  const [tempNoResultsMessage, setTempNoResultsMessage] = useState<string | null>(null);
  const noResultsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fuseRef = useRef<Fuse<AnalyzedScene> | null>(null);

  useEffect(() => {
    if (currentAnalysisData && currentAnalysisData.scenes.length > 0) {
        fuseRef.current = new Fuse(currentAnalysisData.scenes, { keys: ['title', 'tags', 'sceneId'], includeScore: true, threshold: 0.4 });
    } else { fuseRef.current = null; }
  }, [currentAnalysisData]);

  // This useEffect manages searchResults state (no changes here needed for node dimming)
  useEffect(() => {
    if (!currentAnalysisData) { setSearchResults([]); setCurrentMatchIndex(null); return; }
    let filteredScenes = currentAnalysisData.scenes;
    if (activeTagFilters.size > 0) {
        filteredScenes = filteredScenes.filter(scene => Array.from(activeTagFilters).every(filterTag => scene.tags.includes(filterTag)));
    }
    let finalResults: SearchMatch[] = [];
    // Node IDs are from the main `nodes` state which is updated separately
    const currentNodes = getNodes(); // Get current nodes for ID lookup
    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const fuseMatches = fuseRef.current ? fuseRef.current.search(term).map(result => result.item) : [];
        const tagQuery = term.startsWith('#') ? term.substring(1) : term;
        const tagMatchScenes = filteredScenes.filter(scene => scene.tags.some(tag => tag.toLowerCase().includes(tagQuery)));
        const combined = new Set([...fuseMatches, ...tagMatchScenes]);
        finalResults = Array.from(combined)
            .filter(scene => filteredScenes.some(fs => fs.sceneId === scene.sceneId))
            .map(scene => ({ analysisId: currentAnalysisData.analysisId, sceneIndex: scene.scene_index, sceneId: scene.sceneId, title: scene.title, tags: scene.tags, nodeId: currentNodes.find(n => n.data.videoAnalysisData?.sceneId === scene.sceneId)?.id }));
    } else {
        finalResults = filteredScenes.map(scene => ({ analysisId: currentAnalysisData.analysisId, sceneIndex: scene.scene_index, sceneId: scene.sceneId, title: scene.title, tags: scene.tags, nodeId: currentNodes.find(n => n.data.videoAnalysisData?.sceneId === scene.sceneId)?.id }));
    }
    setSearchResults(finalResults);
    setCurrentMatchIndex(finalResults.length > 0 ? 0 : null);

    if (noResultsTimerRef.current) clearTimeout(noResultsTimerRef.current);
    if (searchTerm.trim() && finalResults.length === 0 && activeTagFilters.size === 0) {
        setTempNoResultsMessage(`No scenes match "${searchTerm}".`);
        noResultsTimerRef.current = setTimeout(() => setTempNoResultsMessage(null), 3000);
    } else if (activeTagFilters.size > 0 && finalResults.length === 0) {
        setTempNoResultsMessage("No scenes match active filters.");
        noResultsTimerRef.current = setTimeout(() => setTempNoResultsMessage(null), 3000);
    } else { setTempNoResultsMessage(null); }
  }, [searchTerm, activeTagFilters, currentAnalysisData, getNodes]); // getNodes is stable, nodes (state) is the real dep


  const handleSearchTermChange = useCallback((term: string) => { setSearchTerm(term); }, []);
  const handleTagFilterChange = useCallback((tag: string, isActive: boolean) => { setActiveTagFilters(prev => { const newSet = new Set(prev); if (isActive) newSet.add(tag); else newSet.delete(tag); return newSet; }); }, []);
  const handleClearAllFilters = useCallback(() => { setActiveTagFilters(new Set()); setSearchTerm(''); }, []);
  const focusNodeOnCanvas = useCallback((nodeId: string | undefined, selectNode = true) => { if (nodeId) { const targetNode = getNode(nodeId); if (targetNode) { fitView({ nodes: [targetNode], ...fitViewOptionsNodeFocus }); if (selectNode) { setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, selected: true } : { ...n, selected: false })); } } } }, [getNode, fitView, setNodes]);

  const handleOpenInteractivePreview = useCallback((sceneDataForModal: NodeVideoSceneData) => {
    if (currentAnalysisData && currentAnalysisData.analysisId === sceneDataForModal.analysisId) {
        const fullScene = currentAnalysisData.scenes.find(s => s.sceneId === sceneDataForModal.sceneId);

        if (fullScene) {
          // Enhance scene with AI processing results from the node data
          const enhancedScene = {
            ...fullScene,
            aiProcessingResults: sceneDataForModal.aiProcessingResults
          };
          setModalSceneData(enhancedScene);
          setIsModalOpen(true);
        }
        else {
          showToast("Could not find full scene data for preview.", "error");
        }
    }
  }, [currentAnalysisData, showToast]);
  const handleCloseInteractivePreview = useCallback(() => { setIsModalOpen(false); setModalSceneData(null); }, []);

  const handleSearchResultClick = useCallback((match: SearchMatch) => {
    if(match.nodeId) focusNodeOnCanvas(match.nodeId);
    const matchIndex = searchResults.findIndex(r => r.sceneId === match.sceneId && r.analysisId === match.analysisId);
    if (matchIndex !== -1) setCurrentMatchIndex(matchIndex);
  }, [searchResults, focusNodeOnCanvas]);

  const handleNavigateMatch = useCallback((direction: 'next' | 'previous') => {
    if (searchResults.length === 0) return;
    setCurrentMatchIndex(prev => {
        if (prev === null && searchResults.length > 0) return 0;
        if (prev === null) return null;
        let newIndex = direction === 'next' ? prev + 1 : prev - 1;
        if (newIndex >= searchResults.length) newIndex = 0;
        if (newIndex < 0) newIndex = searchResults.length - 1;
        const nextMatch = searchResults[newIndex];
        if (nextMatch?.nodeId) focusNodeOnCanvas(nextMatch.nodeId);
        return newIndex;
    });
  }, [searchResults, focusNodeOnCanvas]);


  const scenesMapBySceneId = useMemo(() => {
    if (!currentAnalysisData?.scenes) return new Map<string, AnalyzedScene>();
    return new Map(currentAnalysisData.scenes.map(scene => [scene.sceneId, scene]));
  }, [currentAnalysisData]);

  // useEffect to sync currentAnalysisData and unsavedMetadataChanges to nodes' core data
  useEffect(() => {
    const analysisId = currentAnalysisData?.analysisId;

    if (!analysisId || !currentAnalysisData) {
      setNodes(prevNodes => {
        let changed = false;
        const newNodes = prevNodes.map(node => {
          if (node.data.hasPendingChanges || node.data.error) {
            changed = true;
            return { ...node, data: { ...node.data, hasPendingChanges: false, error: undefined, retryAction: undefined } };
          }
          return node;
        });
        return changed ? newNodes : prevNodes;
      });
      return;
    }

    const changesForThisAnalysis = unsavedMetadataChanges[analysisId];

    if (changesForThisAnalysis && Object.keys(changesForThisAnalysis).length > 0) {
      setCurrentAnalysisData(prevCA => {
        if (!prevCA || prevCA.analysisId !== analysisId) return prevCA;
        let caScenesChanged = false;
        const newCaScenes = prevCA.scenes.map(scene => {
          const sceneSpecificUnsaved = changesForThisAnalysis[scene.sceneId];
          if (sceneSpecificUnsaved) {
            const newTitle = sceneSpecificUnsaved.title ?? scene.title;
            const newTags = sceneSpecificUnsaved.tags ?? scene.tags;
            const currentTagsSorted = [...scene.tags].sort();
            const newTagsSorted = [...newTags].sort();
            if (scene.title !== newTitle || JSON.stringify(currentTagsSorted) !== JSON.stringify(newTagsSorted)) {
              caScenesChanged = true;
              return { ...scene, title: newTitle, tags: newTags };
            }
          }
          return scene;
        });
        if (!caScenesChanged) return prevCA;
        return { ...prevCA, scenes: newCaScenes };
      });
    }

    setNodes(prevNodes => {
      let nodesArrayChanged = false;
      const newNodes = prevNodes.map(node => {
        let specificNodeChanged = false;
        let newNodeData = { ...node.data };

        if (node.data.videoAnalysisData && node.data.videoAnalysisData.analysisId === analysisId && node.data.videoAnalysisData.sceneId) {
          const sceneId = node.data.videoAnalysisData.sceneId;
          const sceneFromCa = scenesMapBySceneId.get(sceneId);
          const sceneUnsaved = changesForThisAnalysis?.[sceneId];
          const originalVAD = node.data.videoAnalysisData;

          let titleForNode = sceneFromCa?.title ?? originalVAD.title;
          if (sceneUnsaved?.title !== undefined) titleForNode = sceneUnsaved.title;

          let tagsForNode = originalVAD.tags || [];
          if (sceneUnsaved?.tags !== undefined) {
            tagsForNode = sceneUnsaved.tags;
          } else if (sceneFromCa?.tags) {
            tagsForNode = sceneFromCa.tags;
          }

          const newPendingStatus = !!(sceneUnsaved && Object.keys(sceneUnsaved).length > 0);
          const transitionPart = originalVAD.transitionType ? ` (${originalVAD.transitionType})` : '';
          const newCalculatedLabel = `${titleForNode}${transitionPart}`;

          const currentTagsForNodeSorted = [...tagsForNode].sort();
          const originalTagsSorted = [...(originalVAD.tags || [])].sort();

          if (originalVAD.title !== titleForNode || JSON.stringify(originalTagsSorted) !== JSON.stringify(currentTagsForNodeSorted)) {
            newNodeData.videoAnalysisData = { ...originalVAD, title: titleForNode, tags: tagsForNode };
            specificNodeChanged = true;
          }

          if (node.data.label !== newCalculatedLabel) {
            newNodeData.label = newCalculatedLabel;
            specificNodeChanged = true;
          }
          if (node.data.hasPendingChanges !== newPendingStatus) {
            newNodeData.hasPendingChanges = newPendingStatus;
            specificNodeChanged = true;
          }

          if (sceneUnsaved && node.data.error) {
            newNodeData.error = undefined;
            newNodeData.retryAction = undefined;
            specificNodeChanged = true;
          }
        } else if ((node.data.hasPendingChanges || node.data.error) && (!node.data.videoAnalysisData || node.data.videoAnalysisData.analysisId !== analysisId )) {
          newNodeData.hasPendingChanges = false;
          newNodeData.error = undefined;
          newNodeData.retryAction = undefined;
          specificNodeChanged = true;
        }

        if (specificNodeChanged) {
          nodesArrayChanged = true;
          return { ...node, data: newNodeData };
        }
        return node;
      });
      return nodesArrayChanged ? newNodes : prevNodes;
    });
  }, [currentAnalysisData, unsavedMetadataChanges, setNodes, scenesMapBySceneId, setCurrentAnalysisData]);

  // useEffect to update isDimmed and isSearchResultHighlight on nodes
  useEffect(() => {
    const isFiltering = searchTerm.trim() !== '' || activeTagFilters.size > 0;
    const searchResultNodeIds = new Set(searchResults.map(r => r.nodeId).filter(Boolean));

    setNodes(prevNodes => {
      let changed = false;
      const newNodes = prevNodes.map(n => {
        let newIsDimmed = false;
        let newIsSearchResultHighlight = false;

        if (isFiltering) {
          if (n.id && searchResultNodeIds.has(n.id)) {
            newIsSearchResultHighlight = true;
          } else {
            newIsDimmed = true;
          }
        }

        // If dim status changes, node selection might also need to change
        const newSelectedStatus = newIsDimmed ? false : n.selected;

        if (n.data.isDimmed !== newIsDimmed || n.data.isSearchResultHighlight !== newIsSearchResultHighlight || n.selected !== newSelectedStatus) {
          changed = true;
          return {
            ...n,
            selected: newSelectedStatus,
            data: {
              ...n.data,
              isDimmed: newIsDimmed,
              isSearchResultHighlight: newIsSearchResultHighlight,
            },
          };
        }
        return n;
      });
      return changed ? newNodes : prevNodes;
    });
  }, [searchTerm, activeTagFilters, searchResults, setNodes]);

  // Story Timeline Sync: Track scene node changes and sync with timeline
  // Only trigger when scene nodes are added/removed or their IDs change, not on every state update
  const sceneNodeIds = useMemo(() =>
    nodes
      .filter(n => n.data.type === 'scene')
      .map(n => n.data.videoAnalysisData?.sceneId)
      .filter(Boolean)
      .sort(),
    [nodes]
  );

  useEffect(() => {
    if (!isOptimizedSystemReady || !currentAnalysisData?.analysisId) return;

    // 🚫 PREVENT SUBTITLE CASCADE: Only update story state when scene composition actually changes
    // Don't trigger on AI processing result updates (like subtitle completion)
    const currentSceneCount = sceneNodeIds.length;
    const lastSceneCount = (window as any).__lastStorySceneCount || 0;
    const sceneCountChanged = currentSceneCount !== lastSceneCount;

    // Only update story state if scene count or analysis ID changed
    if (sceneCountChanged || (window as any).__lastAnalysisId !== currentAnalysisData.analysisId) {
      console.log('🔄 StoryTimelineSync: Scene composition changed:', currentSceneCount, 'scenes');
      storyTimelineSync.updateStoryState(nodes, currentAnalysisData.analysisId);
      (window as any).__lastStorySceneCount = currentSceneCount;
      (window as any).__lastAnalysisId = currentAnalysisData.analysisId;
    } else {
      // Scene composition hasn't changed, just AI processing results updated
      console.log('📝 Node state updated (AI processing results) - skipping timeline sync');
    }
  }, [sceneNodeIds, currentAnalysisData?.analysisId, isOptimizedSystemReady, nodes]);

  // Listen for project scene deletion events
  useEffect(() => {
    const handleSceneDeletion = (event: CustomEvent) => {
      const { sceneId } = event.detail;
      console.log('🗑️ StoryTimelineSync: Received scene deletion event:', sceneId);
      storyTimelineSync.handleSceneDeletion(sceneId);
    };

    window.addEventListener('projectSceneDeleted', handleSceneDeletion as EventListener);

    return () => {
      window.removeEventListener('projectSceneDeleted', handleSceneDeletion as EventListener);
    };
  }, []);


  const toggleSidebarVisibility = useCallback(() => {
    // Don't allow manual toggle when in timeline view
    if (currentView === 'timeline') return;

    setIsSidebarVisible(prev => {
      const newState = !prev;
      if (!newState) setActivePanelKey(null);
      return newState;
    });
  }, [setActivePanelKey, currentView]);
  useEffect(() => { if (nodes.length > 0 && getNode && getEdges && fitView && reactFlowWrapper.current && !isFlowRendered) { const timeoutId = setTimeout(() => { fitView(fitViewOptionsFull); setIsFlowRendered(true); }, 100); return () => clearTimeout(timeoutId); } }, [nodes.length, getNode, getEdges, fitView, isFlowRendered]);

  const handleTogglePanel = useCallback((key: PanelKey) => {
    if (key === 'aiChat') {
      setIsAIChatOpen(prev => !prev);
      setActivePanelKey(null); // Close sidebar panel when opening chat
    } else {
      setActivePanelKey(prev => prev === key ? null : key);
      setIsAIChatOpen(false); // Close chat when opening sidebar panel
    }
  }, []);
  const handleDeleteEdge = useCallback((edgeId: string) => { setEdges((eds: Edge[]) => eds.filter((edge) => edge.id !== edgeId)); }, [setEdges]);

  // AI Chat Panel Handlers
  const handleNodeUpdate = useCallback((nodeId: string, updates: any) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [setNodes]);

  const handleCloseChatPanel = useCallback(() => {
    setIsAIChatOpen(false);
  }, []);

  const handleRefreshProject = useCallback(async () => {
    console.log('🔄 Manual project refresh triggered...');

    // Force refresh project data and update nodes
    const currentProject = projectDataManager.getCurrentProject();
    console.log('🔍 Current project from manager:', {
      hasProject: !!currentProject,
      scenes: currentProject?.scenes?.length || 0,
      analysisId: currentProject?.analysisId
    });

    if (currentProject && currentProject.scenes && currentProject.scenes.length > 0) {
      // Update nodes
      const updatedNodes = optimizedScenesToNodes(currentProject.scenes);
      setNodes(updatedNodes);

      // Force update current analysis data
      const analysisData: ApiAnalysisResponse = {
        analysisId: currentProject.analysisId,
        fileName: currentProject.videoFileName,
        videoUrl: currentProject.videoUrl,
        scenes: currentProject.scenes
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map(scene => ({
            sceneId: scene.sceneId,
            title: scene.title,
            start: scene.currentStart,
            end: scene.currentEnd,
            duration: scene.currentDuration,
            scene_index: scene.displayOrder,
            tags: scene.tags || [],
            avg_volume: scene.avgVolume || 0,
            high_energy: scene.highEnergy ? 1 : 0,
            transition_type: scene.transitionType || 'cut'
          })),
        metadata: {
          duration: currentProject.videoDuration,
          width: 1920,
          height: 1080,
          fps: 30
        }
      };

      setCurrentAnalysisData(analysisData);
      localStorage.setItem('currentAnalysisData', JSON.stringify(analysisData));

      console.log('✅ Manually refreshed currentAnalysisData:', {
        scenes: analysisData.scenes.length,
        fileName: analysisData.fileName,
        analysisId: analysisData.analysisId
      });

      // Also trigger story timeline sync after refresh
      console.log('🔄 Triggering story timeline sync after manual refresh');
      storyTimelineSync.updateStoryState(updatedNodes, analysisData.analysisId);
    } else {
      console.warn('⚠️ No valid project data found during manual refresh');

      // Try to load from localStorage as fallback
      const storedAnalysisData = localStorage.getItem('currentAnalysisData');
      if (storedAnalysisData) {
        try {
          const parsedData = JSON.parse(storedAnalysisData);
          setCurrentAnalysisData(parsedData);
          console.log('📊 Loaded from localStorage during manual refresh:', {
            scenes: parsedData.scenes?.length || 0,
            fileName: parsedData.fileName
          });
        } catch (error) {
          console.error('❌ Failed to parse stored analysis data during refresh:', error);
        }
      }
    }
  }, [setNodes]);
  const edgesWithDeleteHandler = useMemo(() => { return edges.map(edge => ({...edge, data: { ...edge.data, onDeleteEdge: handleDeleteEdge }})); }, [edges, handleDeleteEdge]);

  const [isEditingTitle, setIsEditingTitle] = useState<string | null>(null); // Node ID being edited

  // useEffect to update isEditingTitle on the specific node for non-scene nodes
  useEffect(() => {
    setNodes(prevNodes => {
      let changed = false;
      const newNodes = prevNodes.map(n => {
        // Only non-scene nodes allow title editing directly via this mechanism
        const shouldBeEditingThisNode = n.id === isEditingTitle && !(n.data.type === 'scene' && n.data.videoAnalysisData);
        if ((n.data.isEditingTitle ?? false) !== shouldBeEditingThisNode) {
          changed = true;
          return { ...n, data: { ...n.data, isEditingTitle: shouldBeEditingThisNode } };
        }
        return n;
      });
      return changed ? newNodes : prevNodes;
    });
  }, [isEditingTitle, setNodes]);

  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [connectingNode, setConnectingNode] = useState<{ id: string; handleId: string | null } | null>(null);

  const handleAnalysisComplete = useCallback(async (analysisData: ApiAnalysisResponse) => {
    showToast(`Video "${analysisData.fileName}" analyzed. Found ${analysisData.scenes.length} scenes.`, 'success');
    setActivePanelKey('search');
    setSelectedSceneIdsInEditor(new Set());
    setIsModalOpen(false); setModalSceneData(null); resetAllMetadataState();

    // Clear existing edges to prevent duplicates when creating new scene connections
    setEdges([]);

    // Set global analysis ID for timeline access
    (window as any).currentAnalysisId = analysisData.analysisId;

    // 🚀 SINGLE STORAGE: Save to optimized system only - currentAnalysisData will be auto-loaded
    try {
      console.log('💾 Saving new video analysis to optimized system...');
      await projectDataManager.createFromAnalysis(analysisData);
      console.log('✅ Video analysis saved to optimized system - currentAnalysisData will auto-update');
    } catch (error) {
      console.error('❌ Failed to save to optimized system:', error);
      showToast('Warning: Video data may not persist after refresh', 'warning');
    }

    const newFlowNodes: AppNodeType[] = [];
    const newFlowEdges: Edge[] = [];
    let basePosition: XYPosition = reactFlowWrapper.current ? screenToFlowPosition({ x: reactFlowWrapper.current.clientWidth * 0.25, y: reactFlowWrapper.current.clientHeight * 0.25 }) : { x: 200, y: Math.max(200, ...nodes.map(n => (n.position?.y || 0) + 200))};

    // Create scene nodes in an organic, flowing layout that's visually appealing
    const centerX = basePosition.x;
    const centerY = basePosition.y;
    const sceneCount = analysisData.scenes.length;

    let previousNodeId: string | null = null;

    analysisData.scenes.forEach((scene: AnalyzedScene, index: number) => {
        const newNodeId = `scene_node_${analysisData.analysisId.substring(0,4)}_${scene.sceneId}`;
        const sceneNodeDataContent: NodeVideoSceneData = {
          analysisId: analysisData.analysisId,
          sceneIndex: scene.scene_index,
          sceneId: scene.sceneId,
          originalVideoFileName: analysisData.fileName,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          avgVolume: scene.avg_volume,
          highEnergy: scene.high_energy === 1,
          transitionType: scene.transition_type,
          title: scene.title,
          tags: scene.tags
        };

        // Calculate position using a flowing, organic pattern
        let nodeX, nodeY;

        if (sceneCount === 1) {
          // Single scene at center
          nodeX = centerX;
          nodeY = centerY;
        } else if (sceneCount <= 3) {
          // Small number: simple horizontal layout with slight curve
          const spacing = 280;
          const startX = centerX - ((sceneCount - 1) * spacing) / 2;
          nodeX = startX + (index * spacing);
          nodeY = centerY + Math.sin(index * 0.5) * 40; // Gentle wave
        } else if (sceneCount <= 6) {
          // Medium number: staggered rows for better visual flow
          const cols = Math.ceil(sceneCount / 2);
          const row = Math.floor(index / cols);
          const col = index % cols;
          const spacing = 260;
          const rowSpacing = 180;

          nodeX = centerX - ((cols - 1) * spacing) / 2 + (col * spacing);
          nodeY = centerY - 90 + (row * rowSpacing);

          // Add slight offset for organic feel
          nodeX += (Math.sin(index * 1.2) * 20);
          nodeY += (Math.cos(index * 0.8) * 15);
        } else {
          // Many scenes: flowing spiral pattern (much more subtle than full circle)
          const spiralTightness = 0.3; // How tight the spiral is
          const spiralSpacing = 40; // Distance between spiral arms
          const angle = index * spiralTightness;
          const radius = 120 + (index * spiralSpacing);

          nodeX = centerX + radius * Math.cos(angle);
          nodeY = centerY + radius * Math.sin(angle);
        }

        newFlowNodes.push({
          id: newNodeId,
          type: 'default',
          position: { x: nodeX, y: nodeY },
          data: {
            label: `${scene.title}${scene.transition_type ? ` (${scene.transition_type})` : ''}`,
            type: 'scene',
            content: `Time: ${formatTime(scene.start)}-${formatTime(scene.end)}`,
            videoAnalysisData: sceneNodeDataContent,
            hasPendingChanges: false,
            isDimmed: false,
            isSearchResultHighlight: false,
            isEditingTitle: false
          }
        });

        // Create sequential connections between scenes (maintains story flow)
        if (previousNodeId) {
          const edgeId = `edge_${analysisData.analysisId.substring(0,8)}_${index-1}_to_${index}`;
          newFlowEdges.push({
            id: edgeId,
            source: previousNodeId,
            target: newNodeId,
            type: 'custom',
            animated: true,
            data: { onDeleteEdge: handleDeleteEdge }
          });
        }

        previousNodeId = newNodeId;
    });

    // Add all nodes and edges at once
    setNodes((prevNodes: Node[]) => prevNodes.concat(newFlowNodes));
    setEdges((prevEdges: Edge[]) => prevEdges.concat(newFlowEdges));
    setTimeout(() => fitView({nodes: newFlowNodes, ...fitViewOptionsFull }), 200);
  }, [showToast, screenToFlowPosition, nodes, setNodes, setEdges, handleDeleteEdge, setActivePanelKey, fitView, setCurrentAnalysisData, setIsModalOpen, setModalSceneData, resetAllMetadataState]);

  const handleAnalysisError = useCallback((error: string) => { showToast(`Video analysis failed: ${error}`, 'error', 0); setCurrentAnalysisData(null); }, [showToast]);

  const handleSceneListSelect = useCallback((scene: AnalyzedScene) => {
    if (!currentAnalysisData) return;
    const targetNode = nodes.find(n => n.data.videoAnalysisData?.sceneId === scene.sceneId);
    if (targetNode?.id) { focusNodeOnCanvas(targetNode.id); }
    else { showToast(`Node for Scene ${scene.scene_index + 1} (ID: ${scene.sceneId.substring(0,6)}) not found.`, 'warning'); }
  }, [nodes, focusNodeOnCanvas, showToast, currentAnalysisData]);

  const makeSceneMetadataUpdateRequest = useCallback(async (nodeId: string | undefined, analysisId: string, sceneId: string, updates: { title?: string; tags?: string[] }) => {
    if (Object.keys(updates).length === 0) return;
    const sceneNode = nodeId ? getNode(nodeId) : nodes.find(n => n.data.videoAnalysisData?.sceneId === sceneId && n.data.videoAnalysisData?.analysisId === analysisId);
    const originalNodeDataSnapshot = sceneNode ? JSON.parse(JSON.stringify(sceneNode.data)) : null;

    if (sceneNode) setNodes(nds => nds.map(n => n.id === sceneNode.id ? {...n, data: {...n.data, error: undefined, retryAction: undefined }} : n));

    try {
        const response = await fetch(`${getApiBaseUrl()}/api/analysis/${analysisId}/scene/${sceneId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
        if (!response.ok) { const errData = await response.json().catch(() => ({ detail: `Request failed: ${response.status}` })); throw new Error(errData.detail); }
        const updatedSceneFromServer: AnalyzedScene = await response.json();
        showToast(`Scene "${updatedSceneFromServer.title.substring(0,20)}..." updated.`, 'success');
        setCurrentAnalysisData(prev => prev && prev.analysisId === analysisId ? { ...prev, scenes: prev.scenes.map(s => s.sceneId === sceneId ? updatedSceneFromServer : s) } : prev);
        updateOneUnsavedSceneChange(analysisId, sceneId, {}, { title: updatedSceneFromServer.title, tags: updatedSceneFromServer.tags });
    } catch (error: any) {
        const errorMessage = `Error updating scene (ID ${sceneId.substring(0,6)}): ${error.message}`;
        showToast(errorMessage, 'error', 0, () => makeSceneMetadataUpdateRequest(nodeId, analysisId, sceneId, updates));
        if (sceneNode && originalNodeDataSnapshot) {
            setNodes(nds => nds.map(n => n.id === sceneNode.id ? { ...n, data: { ...originalNodeDataSnapshot, error: errorMessage, retryAction: () => makeSceneMetadataUpdateRequest(nodeId, analysisId, sceneId, updates) } } : n));
        }
    }
  }, [getNode, nodes, setNodes, setCurrentAnalysisData, showToast, updateOneUnsavedSceneChange]);

  const debouncedMakeSceneMetadataUpdateRequest = useCallback(debounceUtility(makeSceneMetadataUpdateRequest, 750), [makeSceneMetadataUpdateRequest]);


  const handleSaveAllMetadataChanges = useCallback(async (analysisId: string) => {
    const changesToSave = unsavedMetadataChanges[analysisId];
    if (!changesToSave || Object.keys(changesToSave).length === 0) { showToast("No unsaved changes.", "info"); return; }
    showToast(`Saving ${Object.keys(changesToSave).length} scene changes...`, "info", 5000);
    let allSubmittedSuccessfully = true;
    for (const sceneId of Object.keys(changesToSave)) {
        const updates = changesToSave[sceneId];
        if (updates.title !== undefined && updates.title.trim() === "") {
            showToast(`Scene (ID: ${sceneId.substring(0,6)}) title cannot be empty. Skipped.`, "error");
            setNodes(nds => nds.map(n => (n.data.videoAnalysisData?.sceneId === sceneId && n.data.videoAnalysisData?.analysisId === analysisId) ? {...n, data: {...n.data, error: "Title cannot be empty.", hasPendingChanges: true }} : n));
            allSubmittedSuccessfully = false; continue;
        }
        await makeSceneMetadataUpdateRequest(undefined, analysisId, sceneId, updates);
    }
    setTimeout(() => {
        const remainingChanges = unsavedMetadataChanges[analysisId];
        if (!remainingChanges || Object.keys(remainingChanges).length === 0) {
            showToast("All changes processed successfully!", "success");
        } else if (allSubmittedSuccessfully) {
             showToast(`Some changes saved. ${Object.keys(remainingChanges).length} item(s) may have issues.`, "warning");
        } else {
            showToast("Failed to save all changes. Check items for errors.", "error");
        }
    }, 1500);
  }, [unsavedMetadataChanges, showToast, makeSceneMetadataUpdateRequest, setNodes]);

  const handleMetadataEditorSceneChange = useCallback((analysisId: string, sceneId: string, newChanges: UnsavedSceneChanges) => {
    const originalScene = currentAnalysisData?.scenes.find(s => s.sceneId === sceneId && s.analysisId === analysisId);
    updateOneUnsavedSceneChange(analysisId, sceneId, newChanges, originalScene ? { title: originalScene.title, tags: originalScene.tags } : undefined);
  }, [currentAnalysisData, updateOneUnsavedSceneChange]);

  const handleMetadataEditorSelectionChange = useCallback((sceneId: string, selected: boolean) => {
    setSelectedSceneIdsInEditor(prev => { const newSet = new Set(prev); if (selected) newSet.add(sceneId); else newSet.delete(sceneId); return newSet; });
    const targetNode = nodes.find(n => n.data.videoAnalysisData?.sceneId === sceneId);
    if (targetNode) setNodes(prevNodes => prevNodes.map(n => n.id === targetNode.id ? { ...n, selected } : n));
  }, [nodes, setNodes]);

  const handleBulkTagScenes = useCallback(async (analysisId: string, sceneIds: string[], tag: string) => {
    if (!tag.trim()) { showToast("Tag cannot be empty.", "warning"); return; }
    showToast(`Adding tag "${tag}" to ${sceneIds.length} scenes...`, "info", 0, undefined);
    let successCount = 0;
    for (const sceneId of sceneIds) {
        const scene = currentAnalysisData?.scenes.find(s => s.sceneId === sceneId && s.analysisId === analysisId);
        if (scene) {
            const newTags = Array.from(new Set([...scene.tags, tag.trim()]));
            try {
                await makeSceneMetadataUpdateRequest(undefined, analysisId, sceneId, { tags: newTags });
                successCount++;
            } catch (e) { /* Individual error handled by makeSceneMetadataUpdateRequest */ }
        }
    }
    setToasts(prevToasts => prevToasts.filter(t => !t.message.startsWith("Adding tag")));
    if (successCount === sceneIds.length) showToast("Bulk tagging complete.", "success");
    else showToast(`Bulk tagging: ${successCount}/${sceneIds.length} scenes updated. Some may have errors.`, "warning", 5000);
    setSelectedSceneIdsInEditor(new Set());
  }, [currentAnalysisData, makeSceneMetadataUpdateRequest, showToast, setToasts]);

  const onNodesChangeApp: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    if (currentAnalysisData?.analysisId) {
        let selectionChangedInCanvas = false;
        const newSelectedSceneIds = new Set(selectedSceneIdsInEditor);
        changes.forEach(change => {
            if (change.type === 'select' && change.selected !== undefined) {
                const node = getNode(change.id);
                if (node?.data.videoAnalysisData?.analysisId === currentAnalysisData.analysisId && node.data.videoAnalysisData.sceneId) {
                    if (change.selected) newSelectedSceneIds.add(node.data.videoAnalysisData.sceneId);
                    else newSelectedSceneIds.delete(node.data.videoAnalysisData.sceneId);
                    selectionChangedInCanvas = true;
                }
            }
        });
        if (selectionChangedInCanvas) {
            const sortedNew = Array.from(newSelectedSceneIds).sort();
            const sortedOld = Array.from(selectedSceneIdsInEditor).sort();
            if (JSON.stringify(sortedNew) !== JSON.stringify(sortedOld)) {
                 setSelectedSceneIdsInEditor(newSelectedSceneIds);
            }
        }
    }
  }, [setNodes, getNode, currentAnalysisData, selectedSceneIdsInEditor]);

  const handleResetAppData = useCallback(() => {
    if (window.confirm("Are you sure you want to reset ALL app data? This includes current video, nodes, and unsaved changes.")) {
      // 🚀 SINGLE STORAGE: Clear optimized system only
      localStorage.removeItem('storyboard-project-v2');
      localStorage.removeItem('storyboard-project-backup-v2');
      localStorage.removeItem('storyboard-migration-completed');

      // Clear timeline data
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('timeline-')) {
          localStorage.removeItem(key);
        }
      });

      // Clear legacy keys for safety (in case they exist)
      localStorage.removeItem(CURRENT_ANALYSIS_DATA_KEY);
      localStorage.removeItem(PROJECT_NODES_KEY);
      localStorage.removeItem(PROJECT_EDGES_KEY);
      localStorage.removeItem(PROJECT_VIEWPORT_KEY);

      setCurrentAnalysisData(null);
      setIsModalOpen(false);
      setModalSceneData(null);
      setNodes(initialNodesTemplateFn());
      setEdges(initialEdgesTemplateFn());
      resetAllMetadataState();
      setSearchTerm('');
      setActiveTagFilters(new Set());
      showToast("Application data reset.", "success");
      fitView(fitViewOptionsFull);
    }
  }, [setNodes, setEdges, showToast, resetAllMetadataState, setCurrentAnalysisData, setIsModalOpen, setModalSceneData, fitView]);

  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => { if (nodeId) setConnectingNode({ id: nodeId, handleId }); }, []);
  const onConnectEnd = useCallback((_: MouseEvent | TouchEvent) => {
    // Simply clear the connecting node state without creating new nodes
    setConnectingNode(null);
  }, []);
  const onConnect: OnConnect = useCallback((params) => {
    const sourceNode = getNode(params.source!);
    const targetNode = getNode(params.target!);

    if (!sourceNode || !targetNode) {
      showToast("Error: Node not found.", "error");
      return;
    }

    if (params.source === params.target) {
      showToast("Cannot connect node to itself.", "error");
      return;
    }

    if (sourceNode.data.type === 'outro') {
      showToast("Outro nodes cannot start connections.", "error");
      return;
    }

    if (targetNode.data.type === 'entry') {
      showToast("Cannot connect into Entry node.", "error");
      return;
    }

    // Check if connecting scene to AI agent
    const isSceneToAI = sourceNode.data.type === 'scene' && targetNode.data.type === 'ai-agent';
    const isAIToScene = sourceNode.data.type === 'ai-agent' && targetNode.data.type === 'scene';

    if (isSceneToAI || isAIToScene) {
      // AI agent connection - trigger processing
      const sceneNode = isSceneToAI ? sourceNode : targetNode;
      const aiNode = isSceneToAI ? targetNode : sourceNode;

      if (sceneNode.data.videoAnalysisData && aiNode.data.aiAgentData) {

        showToast(`🤖 ${aiNode.data.label} connected! Starting AI processing...`, 'info');

        // Trigger AI processing asynchronously
        setTimeout(() => {
          handleAIProcessing(sceneNode, aiNode).catch(error => {
            console.error('AI processing failed:', error);
            showToast(`❌ AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
          });
        }, 100);
      } else {
        showToast("⚠️ Scene must have video data for AI processing", 'warning');
      }
    } else if (sourceNode.data.type === 'ai-agent' && targetNode.data.type === 'ai-agent') {
      // Prevent AI agent to AI agent connections
      showToast("❌ Cannot connect AI agents to each other", 'error');
      return;
    }

    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: true, data: { onDeleteEdge: handleDeleteEdge } }, eds));
    setConnectingNode(null);

    // Trigger AI processing if this is an AI agent to scene connection
    if ((sourceNode.data.type === 'ai-agent' && targetNode.data.type === 'scene') ||
        (sourceNode.data.type === 'scene' && targetNode.data.type === 'ai-agent')) {

      const aiNode = sourceNode.data.type === 'ai-agent' ? sourceNode : targetNode;
      const sceneNode = sourceNode.data.type === 'scene' ? sourceNode : targetNode;

      if (aiNode.data.aiAgentData && sceneNode.data.videoAnalysisData) {
        console.log(`🚀 Auto-triggering AI processing: ${aiNode.data.aiAgentData.agentType} → Scene ${sceneNode.data.videoAnalysisData.sceneId}`);

        // Small delay to ensure edge is added to state
        setTimeout(() => {
          handleAIProcessing(sceneNode as AppNodeType, aiNode as AppNodeType);
        }, 100);
      }
    }
  }, [setEdges, getNode, showToast, handleDeleteEdge]);



  // Clean up localStorage data when a node is deleted - OPTIMIZED SYSTEM ONLY
  const cleanupNodeLocalStorage = useCallback(async (node: AppNodeType) => {
    try {
      // Handle scene nodes - remove from optimized system (single source of truth)
      if (node.data.type === 'scene' && node.data.videoAnalysisData?.sceneId) {
        const sceneId = node.data.videoAnalysisData.sceneId;
        console.log(`🧹 Removing scene from optimized system: ${sceneId}`);

        // 🚀 NEW: Use optimized system's deleteScene method (single source of truth)
        const currentProject = projectDataManager.getCurrentProject();
        if (currentProject) {
          // Use the new deleteScene method which handles everything automatically
          await projectDataManager.deleteScene(sceneId);
          console.log(`✅ Scene ${sceneId} removed using optimized system`);

          // Update React Flow nodes to reflect the change
          const updatedProject = projectDataManager.getCurrentProject();
          if (updatedProject) {
            const updatedNodes = optimizedScenesToNodes(updatedProject.scenes);
            setNodes(updatedNodes);
            console.log(`🔄 Updated React Flow with ${updatedProject.scenes.length} remaining scenes`);

            // Immediately trigger story timeline sync after node deletion
            console.log('🔄 Triggering story timeline sync after node deletion');
            storyTimelineSync.updateStoryState(updatedNodes, updatedProject.analysisId);
          }

          // 🚀 SINGLE STORAGE: currentAnalysisData will auto-update from optimized system
          console.log(`✅ Scene ${sceneId} deleted from optimized system - currentAnalysisData will auto-update`);
        } else {
          console.warn(`⚠️ No current project found when trying to delete scene ${sceneId}`);
        }
      }

      // Handle AI agent nodes - clean up any AI-specific storage
      if (node.data.type === 'ai-agent' && node.data.aiAgentData) {
        const agentType = node.data.aiAgentData.agentType;
        const nodeId = node.id;
        console.log(`🧹 Cleaning up AI agent node: ${agentType} (${nodeId})`);

        // Clean up any AI agent specific storage keys (if any exist)
        const aiStorageKeys = [
          `ai-agent-${nodeId}`,
          `ai-results-${nodeId}`,
          `ai-settings-${nodeId}`,
          `ai-processing-${nodeId}`
        ];

        aiStorageKeys.forEach(key => {
          if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
            console.log(`🧹 Removed AI agent storage key: ${key}`);
          }
        });
      }

      console.log(`✅ Node deletion cleanup completed: ${node.data.label} (${node.id})`);
    } catch (error) {
      console.error(`❌ Error during node deletion cleanup for ${node.id}:`, error);
    }
  }, [setNodes]);

  const handleDeleteNodeFromApp = useCallback(async (nodeId: string) => {
    const nodeToDelete = getNode(nodeId);
    if (nodeToDelete) {
      // Clean up localStorage data before deleting the node
      await cleanupNodeLocalStorage(nodeToDelete);
      deleteElements({ nodes: [nodeToDelete] });
      showToast(`Node "${nodeToDelete.data.label}" deleted.`, "info");
    }
  }, [getNode, deleteElements, showToast, cleanupNodeLocalStorage]);

  const handleTitleChangeFromApp = useCallback((nodeId: string, newTitle: string) => { setNodes((prevNodes: AppNodeType[]) => prevNodes.map((node) => (node.id === nodeId && !(node.data.type === 'scene' && node.data.videoAnalysisData)) ? { ...node, data: { ...node.data, label: newTitle } } : node )); setIsEditingTitle(null); }, [setNodes]);
  const handleTitleDoubleClickFromApp = useCallback((nodeId: string) => { const node = getNode(nodeId); if (node && !(node.data.type === 'scene' && node.data.videoAnalysisData)) setIsEditingTitle(nodeId); }, [getNode]);
  const handleTitleBlurFromApp = useCallback(() => setIsEditingTitle(null), []);
  const handleTitleKeyDownFromApp = useCallback((e: React.KeyboardEvent, nodeId?: string) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setIsEditingTitle(null); if (nodeId && reactFlowWrapper.current) (reactFlowWrapper.current.querySelector('.react-flow__pane') as HTMLElement)?.focus(); } }, []);
  const handleAddNode = useCallback((type: AppNodeData['type'] = 'scene') => { const newNodeId = `node_${uuidv4().substring(0,8)}`; let position: XYPosition = reactFlowWrapper.current ? screenToFlowPosition({ x: reactFlowWrapper.current.clientWidth / 2, y: reactFlowWrapper.current.clientHeight / 3 }) : { x: 250, y: 100 }; const newNode: AppNodeType = { id: newNodeId, type: 'default', position, data: { label: `New ${type}`, content: '', type: type, isDimmed: false, isSearchResultHighlight: false, isEditingTitle: false } }; setNodes((prevNodes) => [...prevNodes, newNode]); }, [setNodes, screenToFlowPosition]);
  const handleDeleteSelected = useCallback(async () => {
    const selNodes = getNodes().filter(n => n.selected);
    const selEdges = getEdges().filter(e => e.selected);
    if (selNodes.length > 0 || selEdges.length > 0) {
      // Clean up localStorage for each selected node before deletion
      await Promise.all(selNodes.map(node => cleanupNodeLocalStorage(node)));
      deleteElements({ nodes: selNodes, edges: selEdges });
      showToast(`${selNodes.length} node(s) & ${selEdges.length} edge(s) deleted.`, 'success');
    } else {
      showToast("No elements selected.", 'info');
    }
  }, [getNodes, getEdges, deleteElements, showToast, cleanupNodeLocalStorage]);
  const hasSelection = useMemo(() => nodes.some(n => n.selected) || edges.some(e => e.selected), [nodes, edges]);
  const navigateToRootNode = useCallback(() => { const currentNodes = getNodes(); const currentEdges = getEdges(); if (currentNodes.length === 0) return; const allTargetNodeIds = new Set(currentEdges.map((edge) => edge.target)); const rootNodes = currentNodes.filter((node) => !allTargetNodeIds.has(node.id) || node.data.type === 'entry' || node.data.type === 'intro'); if (rootNodes.length > 0) { let rootNodeToFocus = rootNodes.find(n => n.data.type === 'entry') || rootNodes.find(n => n.data.type === 'intro') || rootNodes.find(n => !allTargetNodeIds.has(n.id)) || rootNodes[0]; setNodes((prevNodes) => prevNodes.map((node) => ({ ...node, selected: node.id === rootNodeToFocus.id }))); const nodeForFitView = getNode(rootNodeToFocus.id); if (nodeForFitView) { setTimeout(() => { fitView({ nodes: [nodeForFitView], ...fitViewOptionsNodeFocus }); }, 50); } else { fitView(fitViewOptionsFull); } } else { fitView(fitViewOptionsFull); } }, [getNodes, getEdges, setNodes, getNode, fitView]);

  useEffect(() => { const handleGlobalKeyDown = (event: KeyboardEvent) => { const activeElement = document.activeElement; const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || activeElement?.closest('.tag-editor-popover') || activeElement?.closest('.metadata-editor-container') || activeElement?.closest('.interactive-scene-modal-content'); const isNodeTitleEditingState = !!isEditingTitle; const isModalOpenNow = isModalOpen; if (event.key === '/' && !isInputFocused && !isNodeTitleEditingState && !isModalOpenNow) { event.preventDefault(); setActivePanelKey('search'); setTimeout(() => document.querySelector<HTMLInputElement>('.sidebar-panel.open .search-input')?.focus(), 50); return; } if (isInputFocused || isNodeTitleEditingState || isModalOpenNow) return; if (event.key === 'Delete' || event.key === 'Backspace') handleDeleteSelected(); else if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))); setEdges((eds) => eds.map((e) => ({ ...e, selected: true }))); showToast('All selected.', 'info'); } else if (event.key === 'Escape') { setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))); setEdges((eds) => eds.map((e) => ({ ...e, selected: false }))); setIsEditingTitle(null); handleCloseInteractivePreview(); showToast('Selection cleared.', 'info');} }; document.addEventListener('keydown', handleGlobalKeyDown); return () => document.removeEventListener('keydown', handleGlobalKeyDown); }, [handleDeleteSelected, setNodes, setEdges, isEditingTitle, showToast, setActivePanelKey, handleCloseInteractivePreview, isModalOpen]);

  const onNodeDrag: NodeDragHandler = useCallback((_event, _node, _currentNodes) => { /* AutoPan logic if needed */ }, []);
  const onSelectionDrag: SelectionDragHandler = useCallback((_event, _currentNodes) => { /* AutoPan logic if needed */ }, []);
  const onConnectDrag = useCallback((_event: MouseEvent | TouchEvent) => { /* AutoPan logic if needed */ }, []);



  const [apiHealthy, setApiHealthy] = useState(true);
  const [geminiApiConnected, setGeminiApiConnected] = useState(false);
  useEffect(() => {
    const checkHealth = async () => {
        try {
            // Import environment config dynamically to avoid SSR issues
            const { checkApiHealth } = await import('./config/environment');
            const isHealthy = await checkApiHealth();
            setApiHealthy(isHealthy);
        } catch (error) {
            console.error('Health check failed:', error);
            setApiHealthy(false);
        }
    };

    // Note: Removed automatic Gemini API connection test to save API quota
    // The API connection will be tested only when actually needed for AI processing
    const checkGeminiConnection = async () => {
        try {
            const connected = await geminiService.testConnection();
            setGeminiApiConnected(connected);
            return connected;
        } catch (error) {
            setGeminiApiConnected(false);
            return false;
        }
    };



    // Initialize unified data service and timeline integration
    unifiedDataService.initialize();
    timelineIntegrationService.initialize();

    // Initialize story timeline sync service
    storyTimelineSync.initialize();

    // Initial checks only - no intervals to save API quota
    checkHealth();
    // checkGeminiConnection(); // Commented out to save API quota - will test when needed
  }, []);

  const getProjectState = useCallback(() => ({
    nodes: getNodes(), edges: getEdges(), currentAnalysisData, unsavedMetadataChanges, activePanelKey,
    viewport: project
  }), [getNodes, getEdges, currentAnalysisData, unsavedMetadataChanges, activePanelKey, project]);

  const handleExportProject = useCallback(() => {
    const projectState = getProjectState();
    const jsonString = JSON.stringify(projectState, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    const fileName = currentAnalysisData?.fileName ? `storyboard-${currentAnalysisData.fileName.split('.')[0]}.json` : 'storyboard-project.json';
    link.download = fileName;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(href);
    showToast('Project exported!', 'success');
  }, [getProjectState, currentAnalysisData, showToast]);

  const handleImportProject = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const projectState = JSON.parse(e.target?.result as string);
                if (projectState.nodes && projectState.edges) {
                    // Ensure imported nodes have the new data structure if they are old
                    const migratedNodes = projectState.nodes.map((n: AppNodeType) => ({
                        ...n,
                        data: {
                            ...n.data,
                            isDimmed: n.data.isDimmed ?? false,
                            isSearchResultHighlight: n.data.isSearchResultHighlight ?? false,
                            isEditingTitle: n.data.isEditingTitle ?? false,
                        }
                    }));
                    setNodes(migratedNodes);
                    setEdges(projectState.edges);
                    setCurrentAnalysisData(projectState.currentAnalysisData || null);
                    setUnsavedMetadataChanges(projectState.unsavedMetadataChanges || {});
                    setActivePanelKey(projectState.activePanelKey || null);
                    if (projectState.viewport) setViewport(projectState.viewport);
                    const newSelectedIds = new Set<string>();
                    if (projectState.currentAnalysisData?.analysisId && migratedNodes) {
                        migratedNodes.forEach((node: AppNodeType) => {
                            if (node.selected && node.data.videoAnalysisData?.analysisId === projectState.currentAnalysisData.analysisId && node.data.videoAnalysisData.sceneId) {
                                newSelectedIds.add(node.data.videoAnalysisData.sceneId);
                            }
                        });
                    }
                    setSelectedSceneIdsInEditor(newSelectedIds);
                    showToast('Project imported!', 'success');
                    setTimeout(() => fitView(fitViewOptionsFull), 100);
                } else { throw new Error("Invalid project file."); }
            } catch (error: any) { showToast(`Import error: ${error.message}`, 'error'); }
            finally { if (event.target) event.target.value = ""; }
        };
        reader.readAsText(file);
    }
  }, [setNodes, setEdges, setCurrentAnalysisData, setActivePanelKey, setViewport, showToast, fitView]);


  const nodesWithHandlers = useMemo(() => {
    return nodes.map(node => {
        // node.data is already AppNodeData, which includes isDimmed, isSearchResultHighlight, isEditingTitle
        // We just need to add the handlers for CustomSceneNode and AI agents
        return {
            ...node,
            data: {
                // Spread all fields from AppNodeData
                ...node.data,
                // Add handlers required by CustomNodeData
                onOpenInteractivePreview: handleOpenInteractivePreview,
                onDeleteNode: handleDeleteNodeFromApp,

                onTitleChange: handleTitleChangeFromApp,
                onTitleDoubleClick: handleTitleDoubleClickFromApp,
                // isEditingTitle is already in node.data
                handleTitleBlur: handleTitleBlurFromApp,
                handleTitleKeyDown: (e: React.KeyboardEvent) => handleTitleKeyDownFromApp(e, node.id),
                makeSceneMetadataUpdateRequest: debouncedMakeSceneMetadataUpdateRequest,

                // Add AI agent settings handler
                onSettingsChange: node.data.type === 'ai-agent' ? handleAIAgentSettingsChange : undefined,
            } as any // Cast to any to avoid type conflicts between CustomNodeData and AIAgentNodeData
        };
    });
  }, [
    nodes, // This is the primary dependency. If `nodes` array reference doesn't change, this won't re-run.
    handleOpenInteractivePreview, handleDeleteNodeFromApp,
    handleTitleChangeFromApp, handleTitleDoubleClickFromApp, handleTitleBlurFromApp,
    handleTitleKeyDownFromApp, debouncedMakeSceneMetadataUpdateRequest, handleAIAgentSettingsChange
  ]);

  const handleZoomToFit = useCallback(() => { fitView(fitViewOptionsFull); }, [fitView]);
  const unsavedChangesForCurrentAnalysis = currentAnalysisData ? unsavedMetadataChanges[currentAnalysisData.analysisId] : undefined;

  // AI Agent handlers
  const handleAddAIAgent = useCallback((agentType: AIAgentType) => {
    const newAgentId = `ai-agent-${uuidv4().substring(0,8)}`;
    const position = reactFlowWrapper.current
      ? screenToFlowPosition({
          x: reactFlowWrapper.current.clientWidth / 2 + Math.random() * 200 - 100,
          y: reactFlowWrapper.current.clientHeight / 2 + Math.random() * 200 - 100
        })
      : { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 };

    const aiAgentData: AIAgentNodeData = {
      agentType,
      agentName: agentType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: `AI agent for ${agentType}`,
      status: 'idle',
      inputConnections: [],
      processingProgress: 0
    };

    const newNode: AppNodeType = {
      id: newAgentId,
      type: 'aiAgent',
      position,
      data: {
        label: aiAgentData.agentName,
        content: aiAgentData.description,
        type: 'ai-agent',
        aiAgentData,
        isDimmed: false,
        isSearchResultHighlight: false,
        isEditingTitle: false
      }
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);
    showToast(`${aiAgentData.agentName} added to canvas`, 'success');
  }, [setNodes, screenToFlowPosition, showToast]);

  // Enhanced AI Agent handler with connection support
  const handleAddAIAgentWithConnection = useCallback(async (agentType: AIAgentType, targetSceneIds: string[]): Promise<string> => {
    const newAgentId = `ai-agent-${uuidv4().substring(0,8)}`;
    const position = reactFlowWrapper.current
      ? screenToFlowPosition({
          x: reactFlowWrapper.current.clientWidth / 2 + Math.random() * 200 - 100,
          y: reactFlowWrapper.current.clientHeight / 2 + Math.random() * 200 - 100
        })
      : { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 };

    const aiAgentData: AIAgentNodeData = {
      agentType,
      agentName: agentType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: `AI agent for ${agentType}`,
      status: 'idle',
      inputConnections: [],
      processingProgress: 0
    };

    const newNode: AppNodeType = {
      id: newAgentId,
      type: 'aiAgent',
      position,
      data: {
        label: aiAgentData.agentName,
        content: aiAgentData.description,
        type: 'ai-agent',
        aiAgentData,
        isDimmed: false,
        isSearchResultHighlight: false,
        isEditingTitle: false
      }
    };

    // Add the node to state
    console.log('🔧 Adding AI agent node to state:', {
      newNodeId: newAgentId,
      currentNodeCount: nodes.length,
      newNodeType: newNode.type,
      newNodeDataType: newNode.data.type
    });

    setNodes((prevNodes) => {
      const updatedNodes = [...prevNodes, newNode];
      console.log('🔧 Updated nodes array:', {
        previousCount: prevNodes.length,
        newCount: updatedNodes.length,
        nodeIds: updatedNodes.map(n => n.id)
      });
      return updatedNodes;
    });

    showToast(`${aiAgentData.agentName} added to canvas`, 'success');

    // Wait for React to update and ReactFlow to process the new node
    await new Promise(resolve => {
      // Use requestAnimationFrame to wait for the next render cycle
      requestAnimationFrame(() => {
        setTimeout(resolve, 100);
      });
    });

    return newAgentId;
  }, [setNodes, screenToFlowPosition, showToast]);

  // Create connection between nodes with retry mechanism
  const handleCreateConnection = useCallback(async (sourceId: string, targetId: string, retryCount = 0) => {
    console.log(`🔗 Creating connection (attempt ${retryCount + 1}): ${sourceId} → ${targetId}`);

    // Get current nodes from ReactFlow (not from stale closure)
    const currentNodes = getNodes();
    const sourceNode = getNode(sourceId);
    const targetNode = getNode(targetId);

    // Debug: Log current node state (only when connection fails)
    if (!sourceNode || !targetNode) {
      console.log('🔍 Connection failed - node state:', {
        totalNodes: currentNodes.length,
        sourceExists: !!sourceNode,
        targetExists: !!targetNode,
        sourceId,
        targetId,
        retryCount
      });
    }

    if (!sourceNode || !targetNode) {
      if (retryCount < 3) {
        console.log(`⏳ Nodes not found, retrying in 200ms (attempt ${retryCount + 1}/3)`);
        setTimeout(() => {
          handleCreateConnection(sourceId, targetId, retryCount + 1);
        }, 200);
        return;
      }

      console.error('❌ Cannot create connection: Source or target node not found after retries', {
        sourceId,
        targetId,
        sourceNode: !!sourceNode,
        targetNode: !!targetNode,
        availableNodes: nodes.map(n => ({ id: n.id, type: n.data.type }))
      });
      showToast('Error: Cannot create connection - node not found', 'error');
      return;
    }

    // Validate connection types
    const isValidConnection = (
      (sourceNode.data.type === 'ai-agent' && targetNode.data.type === 'scene') ||
      (sourceNode.data.type === 'scene' && targetNode.data.type === 'ai-agent')
    );

    if (!isValidConnection) {
      console.warn('⚠️ Invalid connection type:', { sourceType: sourceNode.data.type, targetType: targetNode.data.type });
      showToast('Invalid connection: Can only connect AI agents to scenes', 'warning');
      return;
    }

    const newEdgeId = `e-${sourceId}-${targetId}`;
    const newEdge: AppEdgeType = {
      id: newEdgeId,
      source: sourceId,
      target: targetId,
      type: 'custom',
      animated: true,
      data: { onDeleteEdge: handleDeleteEdge }
    };

    // Check if connection already exists
    const existingEdge = edges.find(edge =>
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId)
    );

    if (existingEdge) {
      console.log('⚠️ Connection already exists between these nodes');
      showToast('Connection already exists between these nodes', 'warning');
      return;
    }

    // Add the edge
    setEdges((prevEdges) => [...prevEdges, newEdge]);

    // Determine AI and scene nodes
    const aiNode = sourceNode.data.type === 'ai-agent' ? sourceNode : targetNode;
    const sceneNode = sourceNode.data.type === 'scene' ? sourceNode : targetNode;

    // Validate node data
    if (!aiNode.data.aiAgentData) {
      console.error('❌ AI node missing aiAgentData:', aiNode);
      showToast('Error: AI agent node is missing required data', 'error');
      return;
    }

    if (!sceneNode.data.videoAnalysisData) {
      console.error('❌ Scene node missing videoAnalysisData:', sceneNode);
      showToast('Error: Scene node is missing video data', 'error');
      return;
    }

    // Show connection success message
    showToast(`🤖 ${aiNode.data.label} connected to scene! Starting AI processing...`, 'info');

    // Trigger AI processing immediately with the nodes we already have
    console.log(`🚀 Auto-triggering AI processing: ${aiNode.data.aiAgentData.agentType} → Scene ${sceneNode.data.videoAnalysisData.sceneId}`);

    // Small delay to ensure edge is rendered, then trigger processing
    setTimeout(() => {
      handleAIProcessing(sceneNode as AppNodeType, aiNode as AppNodeType).catch(error => {
        console.error('❌ AI processing failed:', error);
        showToast(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      });
    }, 50); // Reduced delay for faster response
  }, [setEdges, handleDeleteEdge, getNode, getNodes, handleAIProcessing, edges, showToast]);



    return (
      <div className="app-container">
        {/* Home Button */}
        <div className="fixed top-4 left-4 z-50">

        </div>

        <div className="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast-notification ${toast.type}`}>
                    <span>{toast.message}</span>
                    <div>
                        {toast.onRetry && <button onClick={() => { toast.onRetry!(); removeToast(toast.id); }} className="toast-retry-btn">Retry</button>}
                        <button onClick={() => removeToast(toast.id)} className="toast-close-btn" title="Close">×</button>
                    </div>
                </div>
            ))}
        </div>

        {/* Fixed Logo - Always visible in top right */}
        <div className="app-title">Insomnia</div>

        {/* Floating Navigation Header - Hidden for Story Tab */}
        {currentView !== 'story' && (
          <div className="app-header">
            {/* Center - View Toggle Navigation */}
            <div className="view-toggle-container">
              <button
                className={`view-toggle-button ${currentView === 'story' ? 'active' : ''}`}
                onClick={() => setCurrentView('story')}
              >
                🔗 Story
              </button>
              <button
                className={`view-toggle-button ${currentView === 'timeline' ? 'active' : ''}`}
                onClick={() => setCurrentView('timeline')}
              >
                🎬 Timeline
              </button>
            </div>
          </div>
        )}

        {/* Story Tab Navigation - Only visible in story view */}
        {currentView === 'story' && (
          <div className="story-tab-nav">
            <div className="view-toggle-container">
              <button
                className={`view-toggle-button ${currentView === 'story' ? 'active' : ''}`}
                onClick={() => setCurrentView('story')}
              >
                🔗 Story
              </button>
              <button
                className={`view-toggle-button ${currentView === 'timeline' ? 'active' : ''}`}
                onClick={() => setCurrentView('timeline')}
              >
                🎬 Timeline
              </button>
            </div>
          </div>
        )}

        <div className={`main-content-wrapper ${currentView === 'timeline' ? 'timeline-view' : ''}`}>
          {isSidebarVisible ? (
            <Sidebar
              activePanelKey={activePanelKey} onTogglePanel={handleTogglePanel} onToggleSidebarVisibility={toggleSidebarVisibility}
              onNavigateToRootNode={navigateToRootNode} onZoomToFit={handleZoomToFit} onResetAppData={handleResetAppData}
              onAddNode={handleAddNode} snapToGrid={snapToGrid} onToggleSnapToGrid={setSnapToGrid} onDeleteSelected={handleDeleteSelected} hasSelection={hasSelection}
              onAnalysisComplete={handleAnalysisComplete} onAnalysisError={handleAnalysisError}
              currentAnalysisData={currentAnalysisData}
              onSceneSelect={handleSceneListSelect}
              unsavedChangesForCurrentAnalysis={unsavedChangesForCurrentAnalysis}
              selectedSceneIdsInEditor={selectedSceneIdsInEditor}
              onMetadataEditorSceneChange={(sceneId, updates) => currentAnalysisData && handleMetadataEditorSceneChange(currentAnalysisData.analysisId, sceneId, updates)}
              onSaveAllMetadataChanges={() => currentAnalysisData && handleSaveAllMetadataChanges(currentAnalysisData.analysisId)}
              onMetadataEditorSelectionChange={handleMetadataEditorSelectionChange}
              onBulkTagScenes={(sceneIds, tag) => currentAnalysisData && handleBulkTagScenes(currentAnalysisData.analysisId, sceneIds, tag)}
              searchTerm={searchTerm} activeTagFilters={activeTagFilters} searchResults={searchResults} currentMatchIndex={currentMatchIndex}
              onSearchTermChange={handleSearchTermChange} onTagFilterChange={handleTagFilterChange} onClearAllFilters={handleClearAllFilters}
              onSearchResultClick={handleSearchResultClick} onNavigateMatch={handleNavigateMatch}
              apiHealthy={apiHealthy} onExportProject={handleExportProject} onImportProject={handleImportProject}
              onAddAIAgent={handleAddAIAgent} geminiApiConnected={geminiApiConnected}
            />
          ) : (
            currentView === 'story' && (
              <button className="sidebar-expand-button" onClick={toggleSidebarVisibility} title="Show Sidebar">➔</button>
            )
          )}
          <div className="content-area-with-preview">
            <main className="content">
              {currentView === 'story' ? (
                <div
                  key="story-view"
                  className="story-web-canvas view-enter-active"
                  ref={reactFlowWrapper}
                  tabIndex={0}
                  style={{
                    animation: 'fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                  }}
                >
                  { (nodes && nodes.length > 0 ) ? (
                    <ReactFlow
                        nodes={nodesWithHandlers} edges={edgesWithDeleteHandler}
                        onNodesChange={onNodesChangeApp} onEdgesChange={onEdgesChangeFromHook}
                        onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
                        onNodeDrag={onNodeDrag} onSelectionDrag={onSelectionDrag}
                        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                        fitViewOptions={fitViewOptionsFull}
                        panOnScroll selectionOnDrag panOnDrag={[1, 2]}
                        nodeOrigin={nodeOriginConst} deleteKeyCode={null}
                        onMoveEnd={(_event, viewport) => {
                          const viewportStorageKey = getProjectStorageKey(PROJECT_VIEWPORT_KEY, projectId);
                          localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
                        }}
                        onlyRenderVisibleElements={true}
                      >
                      <Background variant="dots" gap={GRID_SIZE} size={1} />
                    </ReactFlow>
                  ) : ( <div className="canvas-placeholder"><p>Your Story Web is empty.</p><p>Add nodes or analyze video!</p></div> )}
                </div>
              ) : (
                <div
                  key="timeline-view"
                  className="timeline-container view-enter-active"
                  style={{
                    animation: 'fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                    height: '100%',
                    width: '100%'
                  }}
                >
                  <Editor
                    isAIChatOpen={isAIChatOpen}
                    onToggleAIChat={() => setIsAIChatOpen(prev => !prev)}
                  />
                </div>
              )}
            </main>
          </div>
        </div>
        <InteractiveSceneModal
          isOpen={isModalOpen} onClose={handleCloseInteractivePreview}
          scene={modalSceneData}
          videoUrl={currentAnalysisData?.videoUrl || null}
          analysisId={currentAnalysisData?.analysisId || null}
        />

        {/* AI Chat Side Panel */}
        <AISidePanel
          isOpen={isAIChatOpen}
          onClose={handleCloseChatPanel}
          currentAnalysisData={currentAnalysisData}
          nodes={nodes}
          onNodeUpdate={handleNodeUpdate}
          onAddAIAgent={handleAddAIAgent}
          onAddAIAgentWithConnection={handleAddAIAgentWithConnection}
          onCreateConnection={handleCreateConnection}
          onShowToast={showToast}
          onRefreshProject={handleRefreshProject}

        />
      </div>
    );
  }

export default function App() {
  return ( <ReactFlowProvider> <AppContent /> </ReactFlowProvider> );
}