import { Button } from "@/components/ui/button";
import { dispatch } from "@designcombo/events";
import {
  ACTIVE_SPLIT,
  LAYER_CLONE,
  LAYER_DELETE,
  TIMELINE_SCALE_CHANGED,
} from "@designcombo/state";
import StateManager from "@designcombo/state";
import { PLAYER_PAUSE, PLAYER_PLAY } from "../constants/events";
import { frameToTimeString, getCurrentTime, timeToString } from "../utils/time";
import useStore from "../store/use-store";
import { SquareSplitHorizontal, Trash, ZoomIn, ZoomOut, Bot } from "lucide-react";
import {
  getFitZoomLevel,
  getNextZoomLevel,
  getPreviousZoomLevel,
  getZoomByIndex,
} from "../utils/timeline";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { Slider } from "@/components/ui/slider";
import { useEffect, useState, useCallback } from "react";
import useUpdateAnsestors from "../hooks/use-update-ansestors";
import type { ITimelineScaleState } from "@designcombo/types";
import { timelineIntegrationService } from "../../../services/timelineIntegrationService";
import { unifiedDataService } from "../../../services/unifiedDataService";
import {
  loadMezzanineScenesToTimeline,
  createSeamlessTransitionConfig,
  type MezzanineLoadOptions
} from "../../../utils/mezzanineLoader";
import { projectDataManager } from "../../../utils/projectDataManager";
import { storyTimelineSync } from "../../../services/storyTimelineSync";

const IconPlayerPlayFilled = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
  </svg>
);

const IconPlayerPauseFilled = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
    <path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
  </svg>
);
const IconPlayerSkipBack = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 5v14l-12 -7z" />
    <path d="M4 5l0 14" />
  </svg>
);

const IconPlayerSkipForward = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 5v14l12 -7z" />
    <path d="M20 5l0 14" />
  </svg>
);

const IconSync = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </svg>
);
interface HeaderProps {
  stateManager: StateManager;
  isAIChatOpen?: boolean;
  onToggleAIChat?: () => void;
}

const Header = ({ stateManager, isAIChatOpen, onToggleAIChat }: HeaderProps) => {
  const [playing, setPlaying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [aiResultsCount, setAIResultsCount] = useState(0);
  const [translatedScenesCount, setTranslatedScenesCount] = useState(0);
  const { duration, fps, scale, playerRef, activeIds, trackItemIds, trackItemsMap, setState } = useStore();

  useUpdateAnsestors({ playing, playerRef });

  const currentFrame = useCurrentPlayerFrame(playerRef!);

  const doActiveDelete = () => {
    dispatch(LAYER_DELETE);
  };

  // Function to clear timeline items (preserving AI-generated content)
  const clearAllTimelineItems = useCallback(() => {
    try {
      console.log('🔧 DEBUG: clearAllTimelineItems called');
      console.log('🔧 DEBUG: trackItemIds:', trackItemIds);
      console.log('🔧 DEBUG: trackItemsMap keys:', Object.keys(trackItemsMap || {}));
      console.log('🔧 DEBUG: activeIds:', activeIds);

      // Get state from StateManager prop
      const currentState = stateManager.getState();
      console.log('🔧 DEBUG: StateManager state:', {
        trackItemIds: currentState.trackItemIds,
        trackItemsMapKeys: Object.keys(currentState.trackItemsMap || {}),
        activeIds: currentState.activeIds
      });

      // Identify AI-generated items to preserve
      const aiGeneratedItems = new Set<string>();
      const allTrackItemIds = currentState.trackItemIds || trackItemIds || [];

      allTrackItemIds.forEach(itemId => {
        const item = (currentState.trackItemsMap || trackItemsMap)?.[itemId];
        if (item?.metadata?.aiGenerated || item?.metadata?.sourceUrl === 'ai-generated') {
          aiGeneratedItems.add(itemId);
          console.log('🤖 Preserving AI-generated item:', itemId, item.type);
        }
      });

      console.log(`🤖 Found ${aiGeneratedItems.size} AI-generated items to preserve during sync`);




      // Filter out AI-generated items to preserve them
      const itemsToDelete = allTrackItemIds.filter(itemId => !aiGeneratedItems.has(itemId));

      console.log(`🔧 DEBUG: Total items found: ${allTrackItemIds.length}`);
      console.log(`🤖 DEBUG: AI items to preserve: ${aiGeneratedItems.size}`);
      console.log(`🗑️ DEBUG: Items to delete: ${itemsToDelete.length}`);

      if (itemsToDelete.length === 0) {
        console.log('✅ No non-AI items to clear (all items are AI-generated or timeline is empty)');
        return;
      }

      console.log(`🎯 Selecting ${itemsToDelete.length} non-AI items for deletion`);
      console.log('🔧 DEBUG: Items to select for deletion:', itemsToDelete);

      // Select only non-AI items for deletion using stateManager prop
      stateManager.updateState({
        activeIds: [...itemsToDelete]
      });

      console.log('🔧 DEBUG: StateManager updateState called with non-AI activeIds');

      // Small delay to ensure selection is processed, then delete
      setTimeout(() => {
        console.log('🔧 DEBUG: About to dispatch LAYER_DELETE (preserving AI items)');
        dispatch(LAYER_DELETE);
        console.log(`✅ Cleared ${itemsToDelete.length} timeline items (preserved ${aiGeneratedItems.size} AI items)`);
      }, 50);

    } catch (error) {
      console.error('❌ Error clearing all timeline items:', error);
    }
  }, [trackItemIds, trackItemsMap, activeIds, setState, stateManager]);

  const doActiveSplit = () => {
    dispatch(ACTIVE_SPLIT, {
      payload: {},
      options: {
        time: getCurrentTime(),
      },
    });
  };

  const changeScale = (scale: ITimelineScaleState) => {
    dispatch(TIMELINE_SCALE_CHANGED, {
      payload: {
        scale,
      },
    });
  };

  const handlePlay = () => {
    dispatch(PLAYER_PLAY);
  };

  const handlePause = () => {
    dispatch(PLAYER_PAUSE);
  };

  // Get current analysis ID from global state
  const getCurrentAnalysisId = useCallback((): string | null => {
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
  }, []);

  // Helper function to get scene IDs from the story node graph via story timeline sync
  const getStorySceneIds = useCallback((): string[] => {
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

      // FALLBACK: Try localStorage only if above methods fail
      const analysisId = getCurrentAnalysisId();
      console.log('🔍 Fallback: Getting story scene IDs for analysis:', analysisId);

      if (analysisId) {
        // Get from localStorage - this should have the current analysis data
        const analysisData = localStorage.getItem('currentAnalysisData');
        if (analysisData) {
          const parsed = JSON.parse(analysisData);
          if (parsed.scenes && parsed.scenes.length > 0) {
            // FILTER OUT DELETED SCENES
            const validScenes = parsed.scenes.filter((scene: any) => {
              return scene &&
                     scene.sceneId &&
                     scene.sceneId !== 'deleted' &&
                     !scene.sceneId.includes('deleted') &&
                     scene.duration > 0 &&
                     scene.title !== 'DELETED';
            });
            const sceneIds = validScenes.map((scene: any) => scene.sceneId);
            console.log('📊 Scene IDs from currentAnalysisData (FALLBACK):', sceneIds);
            return sceneIds;
          }
        }
      }

      console.warn('⚠️ No scenes found in any data source');
      return [];
    } catch (error) {
      console.error('❌ Failed to get story scene IDs:', error);
      return [];
    }
  }, [getCurrentAnalysisId]);

  // Smart sync mezzanine scenes to timeline - ONLY scenes that exist in story node graph
  const handleSync = useCallback(async (forceReload: boolean = false) => {
    console.log('🔧 DEBUG: handleSync called with forceReload:', forceReload);

    const analysisId = getCurrentAnalysisId();
    console.log('🔧 DEBUG: analysisId:', analysisId);

    if (!analysisId) {
      console.warn('⚠️ No analysis ID available for sync');
      return;
    }

    // 🎯 NEW: Get only scenes that exist in the story node graph
    const storySceneIds = getStorySceneIds();
    console.log('🎬 Story scene IDs found in node graph:', storySceneIds);

    if (storySceneIds.length === 0) {
      console.warn('⚠️ No scenes found in story node graph - nothing to sync');
      return;
    }

    setIsSyncing(true);
    console.log(`🔄 ${forceReload ? 'Force reloading' : 'Smart syncing'} mezzanine scenes for analysis: ${analysisId}`);

    try {
      // Clear the entire timeline before loading new content to prevent duplicates
      console.log('🧹 Clearing timeline before sync...');
      console.log('🔧 DEBUG: About to call clearAllTimelineItems');
      clearAllTimelineItems();
      console.log('🔧 DEBUG: clearAllTimelineItems called');

      // Small delay to ensure clearing is processed
      console.log('🔧 DEBUG: Waiting 200ms for clearing to complete...');
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('🔧 DEBUG: Wait complete, proceeding with loading...');

      // Create seamless transition configuration
      const seamlessConfig = createSeamlessTransitionConfig('frame-perfect', 30);

      const options = {
        analysisId,
        baseUrl: '',
        ...seamlessConfig,
        forceReload: true, // Always force reload since we cleared the timeline
        updateOnly: false, // Don't update, always load fresh since timeline is cleared
        customSceneOrder: storySceneIds, // 🎯 ONLY load scenes that exist in story graph
        onProgress: (loaded, total) => {
          console.log(`📊 Story sync progress: ${loaded}/${total} scenes (from story graph)`);
        },
        onError: (error, sceneId) => {
          console.error(`❌ Story sync error${sceneId ? ` (Scene: ${sceneId})` : ''}:`, error);

          // Check if this is an analysis not found error
          if (error.includes('Analysis not found') || error.includes('404')) {
            // Show user-friendly message
            console.log('🔄 Analysis not found - user should upload a new video');
            // The error handling in mezzanineLoader will have already cleared stale data
          }
        },
        onComplete: (loadedCount) => {
          console.log(`🎉 Story sync complete! Loaded ${loadedCount} scenes from story graph to timeline`);
          setIsSyncing(false);

          // Count translated scenes in the timeline
          updateTranslatedScenesCount();
        }
      };

      await loadMezzanineScenesToTimeline(options);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      setIsSyncing(false);
    }
  }, [getCurrentAnalysisId]);

  // Function to count translated scenes in the timeline
  const updateTranslatedScenesCount = useCallback(() => {
    try {
      const currentState = stateManager.getState();
      const allTrackItemIds = currentState.trackItemIds || [];

      let translatedCount = 0;
      allTrackItemIds.forEach(itemId => {
        const item = currentState.trackItemsMap?.[itemId];
        if (item?.metadata?.isTranslated && item?.metadata?.isMezzanineSegment) {
          translatedCount++;
        }
      });

      console.log(`🌐 Timeline translation count: ${translatedCount}/${allTrackItemIds.length} scenes translated`);
      setTranslatedScenesCount(translatedCount);
    } catch (error) {
      console.error('❌ Error counting translated scenes:', error);
    }
  }, [stateManager]);

  // Track AI results for display
  useEffect(() => {
    const updateAIResultsCount = () => {
      const allScenes = unifiedDataService.getAllScenesWithAIResults();
      const totalResults = Object.values(allScenes).reduce((total, sceneResults) => {
        return total + Object.keys(sceneResults).length;
      }, 0);
      setAIResultsCount(totalResults);
    };

    // Initial count
    updateAIResultsCount();

    // Listen for AI results updates
    const handleAIUpdate = () => {
      updateAIResultsCount();
    };

    unifiedDataService.addEventListener('ai-results-updated', handleAIUpdate);

    return () => {
      unifiedDataService.removeEventListener('ai-results-updated', handleAIUpdate);
    };
  }, []);

  // Track translated scenes count when timeline changes
  useEffect(() => {
    updateTranslatedScenesCount();
  }, [trackItemIds, trackItemsMap, updateTranslatedScenesCount]);

  useEffect(() => {
    playerRef?.current?.addEventListener("play", () => {
      setPlaying(true);
    });
    playerRef?.current?.addEventListener("pause", () => {
      setPlaying(false);
    });
    return () => {
      playerRef?.current?.removeEventListener("play", () => {
        setPlaying(true);
      });
      playerRef?.current?.removeEventListener("pause", () => {
        setPlaying(false);
      });
    };
  }, [playerRef]);



  return (
    <div
      style={{
        position: "relative",
        height: "50px",
        flex: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          height: 50,
          width: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            height: 36,
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr 260px 1fr",
            alignItems: "center",
          }}
        >
          <div className="flex px-2">
            <Button
              onClick={(e) => {
                // Hold Shift for force reload, otherwise smart sync
                const forceReload = e.shiftKey;
                handleSync(forceReload);
              }}
              disabled={isSyncing}
              variant={"ghost"}
              size={"sm"}
              className="flex items-center gap-1 px-2 text-blue-400 hover:text-blue-300"
              title="Smart sync mezzanine scenes (Hold Shift to force reload all segments)"
            >
              <IconSync size={14} />
              {isSyncing ? 'Syncing...' : 'Sync'}
            </Button>

            {/* AI Results Indicator */}
            {aiResultsCount > 0 && (
              <Button
                variant={"ghost"}
                size={"sm"}
                className="flex items-center gap-1 px-2 text-green-400 hover:text-green-300"
                title={`${aiResultsCount} AI processing results available in timeline`}
                disabled
              >
                🤖 {aiResultsCount}
              </Button>
            )}

            {/* Translation Indicator */}
            {translatedScenesCount > 0 && (
              <Button
                variant={"ghost"}
                size={"sm"}
                className="flex items-center gap-1 px-2 text-cyan-400 hover:text-cyan-300"
                title={`${translatedScenesCount} translated scenes loaded in timeline`}
                disabled
              >
                🌐 {translatedScenesCount}
              </Button>
            )}

            <Button
              disabled={!activeIds.length}
              onClick={doActiveDelete}
              variant={"ghost"}
              size={"sm"}
              className="flex items-center gap-1 px-2"
            >
              <Trash size={14} /> Delete
            </Button>

            <Button
              disabled={!activeIds.length}
              onClick={doActiveSplit}
              variant={"ghost"}
              size={"sm"}
              className="flex items-center gap-1 px-2"
            >
              <SquareSplitHorizontal size={15} /> Split
            </Button>
            <Button
              disabled={!activeIds.length}
              onClick={() => {
                dispatch(LAYER_CLONE);
              }}
              variant={"ghost"}
              size={"sm"}
              className="flex items-center gap-1 px-2"
            >
              <SquareSplitHorizontal size={15} /> Clone
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <div>
              <Button onClick={doActiveDelete} variant={"ghost"} size={"icon"}>
                <IconPlayerSkipBack size={14} />
              </Button>
              <Button
                onClick={() => {
                  if (playing) {
                    return handlePause();
                  }
                  handlePlay();
                }}
                variant={"ghost"}
                size={"icon"}
              >
                {playing ? (
                  <IconPlayerPauseFilled size={14} />
                ) : (
                  <IconPlayerPlayFilled size={14} />
                )}
              </Button>
              <Button onClick={doActiveSplit} variant={"ghost"} size={"icon"}>
                <IconPlayerSkipForward size={14} />
              </Button>
            </div>
            <div
              className="text-xs font-light"
              style={{
                display: "grid",
                alignItems: "center",
                gridTemplateColumns: "54px 4px 54px",
                paddingTop: "2px",
                justifyContent: "center",
              }}
            >
              <div
                className="font-medium text-zinc-200"
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
                data-current-time={currentFrame / fps}
                id="video-current-time"
              >
                {frameToTimeString({ frame: currentFrame }, { fps })}
              </div>
              <span>/</span>
              <div
                className="text-muted-foreground"
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {timeToString({ time: duration })}
              </div>
            </div>
          </div>

          <ZoomControl
            scale={scale}
            onChangeTimelineScale={changeScale}
            duration={duration}
            isAIChatOpen={isAIChatOpen}
            onToggleAIChat={onToggleAIChat}
          />
        </div>
      </div>
    </div>
  );
};

const ZoomControl = ({
  scale,
  onChangeTimelineScale,
  duration,
  isAIChatOpen,
  onToggleAIChat,
}: {
  scale: ITimelineScaleState;
  onChangeTimelineScale: (scale: ITimelineScaleState) => void;
  duration: number;
  isAIChatOpen?: boolean;
  onToggleAIChat?: () => void;
}) => {
  const [localValue, setLocalValue] = useState(scale.index);

  useEffect(() => {
    setLocalValue(scale.index);
  }, [scale.index]);

  const onZoomOutClick = () => {
    const previousZoom = getPreviousZoomLevel(scale);
    onChangeTimelineScale(previousZoom);
  };

  const onZoomInClick = () => {
    const nextZoom = getNextZoomLevel(scale);
    onChangeTimelineScale(nextZoom);
  };

  const onZoomFitClick = () => {
    const fitZoom = getFitZoomLevel(duration, scale.zoom);
    onChangeTimelineScale(fitZoom);
  };

  return (
    <div className="flex items-center justify-end">
      {/* AI Chat Button */}
      {onToggleAIChat && (
        <div className="flex border-r border-border pr-4 mr-4">
          <Button
            size={"sm"}
            variant={isAIChatOpen ? "default" : "ghost"}
            onClick={onToggleAIChat}
            className={`flex items-center gap-2 px-3 ${
              isAIChatOpen
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'text-purple-400 hover:text-purple-300 hover:bg-purple-900/20'
            }`}
            title="Toggle AI Assistant"
          >
            <Bot size={16} />
            AI Assistant
          </Button>
        </div>
      )}

      <div className="flex border-l border-border pl-4 pr-2">
        <Button size={"icon"} variant={"ghost"} onClick={onZoomOutClick}>
          <ZoomOut size={16} />
        </Button>
        <Slider
          className="w-28"
          value={[localValue]}
          min={0}
          max={12}
          step={1}
          onValueChange={(e) => {
            setLocalValue(e[0]); // Update local state
          }}
          onValueCommit={() => {
            const zoom = getZoomByIndex(localValue);
            onChangeTimelineScale(zoom); // Propagate value to parent when user commits change
          }}
        />
        <Button size={"icon"} variant={"ghost"} onClick={onZoomInClick}>
          <ZoomIn size={16} />
        </Button>
        <Button onClick={onZoomFitClick} variant={"ghost"} size={"icon"}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M20 8V6h-2q-.425 0-.712-.288T17 5t.288-.712T18 4h2q.825 0 1.413.588T22 6v2q0 .425-.288.713T21 9t-.712-.288T20 8M2 8V6q0-.825.588-1.412T4 4h2q.425 0 .713.288T7 5t-.288.713T6 6H4v2q0 .425-.288.713T3 9t-.712-.288T2 8m18 12h-2q-.425 0-.712-.288T17 19t.288-.712T18 18h2v-2q0-.425.288-.712T21 15t.713.288T22 16v2q0 .825-.587 1.413T20 20M4 20q-.825 0-1.412-.587T2 18v-2q0-.425.288-.712T3 15t.713.288T4 16v2h2q.425 0 .713.288T7 19t-.288.713T6 20zm2-6v-4q0-.825.588-1.412T8 8h8q.825 0 1.413.588T18 10v4q0 .825-.587 1.413T16 16H8q-.825 0-1.412-.587T6 14"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default Header;
