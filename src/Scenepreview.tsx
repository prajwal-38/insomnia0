// src/ScenePreview.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { AnalyzedScene } from './types'; // Adjust path as needed
import { SubtitleOverlay, type SubtitleCue } from './components/SubtitleOverlay';
import { unifiedDataService } from './services/unifiedDataService';

// Assuming formatTime is in utils.ts or defined elsewhere
// For this example, let's re-define it for clarity if utils.ts isn't provided.
// Ideally, it would be in utils.ts
const formatDisplayTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 100); // Hundredths for more precision
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

interface ScenePreviewProps {
  videoUrl: string | null;
  scene: AnalyzedScene | null;
}

const ScenePreview: React.FC<ScenePreviewProps> = ({ videoUrl, scene }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // These times are relative to the scene's start
  const [currentTimeInScene, setCurrentTimeInScene] = useState(0);
  const [sceneDuration, setSceneDuration] = useState(0);

  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null); // To force video remount on scene change

  // Subtitle state
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [aiResults, setAIResults] = useState<Record<string, any>>({});
  const [showAIResults, setShowAIResults] = useState(true);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);


  const clearEndCheckInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Effect to initialize and handle scene changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene || !videoUrl) {
      console.log('ScenePreview: Missing video element, scene, or videoUrl');
      return;
    }

    console.log('ScenePreview: Setting up video', { videoUrl, sceneId: scene.sceneId, start: scene.start, end: scene.end });

    // Reset states
    setVideoError(null);
    setIsPlaying(false);
    setIsLoaded(false);
    setCurrentTimeInScene(0);
    setSceneDuration(scene.duration);

    // Set the video key for React remounting (this will cause re-render with new src)
    const newKey = `${videoUrl}-${scene.sceneId}`;
    setVideoKey(newKey);

    // Load AI results from unified data service
    if (scene.sceneId) {
      const storedAIResults = unifiedDataService.getStoredAIResults(scene.sceneId);
      setAIResults(storedAIResults);
      console.log('🔄 Loaded AI results for scene preview:', Object.keys(storedAIResults));

      // Load subtitles from unified data service first, then fallback to scene data
      let subtitlesLoaded = false;

      if (storedAIResults['subtitle-generator']) {
        const subtitleResult = storedAIResults['subtitle-generator'];
        console.log('✅ Loading subtitles from unified data service:', subtitleResult);

        if (subtitleResult.result?.subtitles) {
          setSubtitles(subtitleResult.result.subtitles);
          console.log('✅ Loaded subtitles from unified service:', subtitleResult.result.subtitles.length);
          subtitlesLoaded = true;
        } else if (Array.isArray(subtitleResult.result)) {
          setSubtitles(subtitleResult.result);
          console.log('✅ Loaded subtitles from unified service (array):', subtitleResult.result.length);
          subtitlesLoaded = true;
        }
      }

      // Fallback to scene data if not loaded from unified service
      if (!subtitlesLoaded && scene.aiProcessingResults?.['subtitle-generator']) {
        const subtitleResult = scene.aiProcessingResults['subtitle-generator'];
        console.log('📋 Fallback: Loading subtitles from scene data:', subtitleResult);

        if (subtitleResult.result?.subtitles) {
          setSubtitles(subtitleResult.result.subtitles);
          console.log('✅ Loaded subtitles from scene data:', subtitleResult.result.subtitles.length);
        } else if (Array.isArray(subtitleResult.result)) {
          setSubtitles(subtitleResult.result);
          console.log('✅ Loaded subtitles from scene data (array):', subtitleResult.result.length);
        } else if (subtitleResult.result?.result?.subtitles) {
          setSubtitles(subtitleResult.result.result.subtitles);
          console.log('✅ Loaded subtitles from scene data (nested):', subtitleResult.result.result.subtitles.length);
        }
      }

      if (!subtitlesLoaded) {
        setSubtitles([]);
      }
    }

    // The video will load automatically due to preload="auto" and src change
    console.log('ScenePreview: Video will load automatically with new key:', newKey);

    // Fallback timeout
    const loadTimeout = setTimeout(() => {
      if (videoElement.readyState < videoElement.HAVE_ENOUGH_DATA) {
        console.log('ScenePreview: Video loading timeout, retrying...');
        videoElement.load();
      }
    }, 5000);

    return () => {
      clearTimeout(loadTimeout);
    };
  }, [scene?.sceneId, videoUrl]);

  // Effect for listening to AI results updates
  useEffect(() => {
    if (!scene?.sceneId) return;

    const handleAIResultsUpdate = (data: any) => {
      if (data.sceneId === scene.sceneId) {
        console.log('🔄 ScenePreview: AI results updated for scene', data.sceneId);
        const updatedResults = unifiedDataService.getStoredAIResults(scene.sceneId);
        setAIResults(updatedResults);

        // Update subtitles if subtitle generator result was updated
        if (data.agentType === 'subtitle-generator' && data.result?.result?.subtitles) {
          setSubtitles(data.result.result.subtitles);
          console.log('✅ ScenePreview: Updated subtitles from AI results');
        }
      }
    };

    unifiedDataService.addEventListener('ai-results-updated', handleAIResultsUpdate);

    return () => {
      unifiedDataService.removeEventListener('ai-results-updated', handleAIResultsUpdate);
    };
  }, [scene?.sceneId]);

  // Effect for video event listeners
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !scene) return;

    const handleLoadedMetadata = () => {
      console.log('ScenePreview: Video metadata loaded, duration:', videoElement.duration);
      if (videoElement && scene) {
        // Set the video to the scene start time
        videoElement.currentTime = scene.start;
        setCurrentTimeInScene(0);
        setSceneDuration(scene.duration);
        console.log('ScenePreview: Set video time to scene start:', scene.start);
      }
    };

    const handleCanPlay = () => {
      console.log('ScenePreview: Video can play, readyState:', videoElement.readyState);
      if (videoElement && scene) {
        // Ensure we're at the right time
        if (Math.abs(videoElement.currentTime - scene.start) > 0.1) {
          console.log('ScenePreview: Correcting video time from', videoElement.currentTime, 'to', scene.start);
          videoElement.currentTime = scene.start;
        }
        setCurrentTimeInScene(Math.max(0, videoElement.currentTime - scene.start));
        setIsLoaded(true);
        setVideoError(null);
        console.log('ScenePreview: Video ready for playback');
      }
    };

    const handleLoadedData = () => {
      console.log('ScenePreview: Video data loaded');
      if (videoElement && scene && !isLoaded) {
        setIsLoaded(true);
        setVideoError(null);
      }
    };

    const handleTimeUpdate = () => {
      if (videoElement && scene && !isDraggingPlayhead) {
        const currentAbsoluteTime = videoElement.currentTime;
        if (currentAbsoluteTime < scene.start && scene.start > 0) {
            // If video jumped before scene start unexpectedly
            if (Math.abs(currentAbsoluteTime - scene.start) > 0.2) { // threshold to avoid fighting small discrepancies
                 videoElement.currentTime = scene.start;
            }
            setCurrentTimeInScene(0);
        } else {
            setCurrentTimeInScene(Math.max(0, currentAbsoluteTime - scene.start));
        }
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => { // Video ended (might be end of whole video, not scene)
        setIsPlaying(false);
        if (videoElement && scene) {
            videoElement.currentTime = scene.start;
            setCurrentTimeInScene(0);
        }
    };
    const handleError = (e: Event) => {
        const mediaError = (e.target as HTMLVideoElement).error;
        const errorMsg = `Video Error: Code ${mediaError?.code}, ${mediaError?.message || 'Unknown'}`;
        console.error('ScenePreview: Video error occurred:', errorMsg, e);
        console.error('ScenePreview: Video URL was:', videoElement.src);
        console.error('ScenePreview: Video readyState:', videoElement.readyState);
        setVideoError(errorMsg);
        setIsLoaded(false);
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('error', handleError);

    // Initial check if video is already ready
    if (videoElement.readyState >= videoElement.HAVE_METADATA && scene) {
        console.log('ScenePreview: Video already has metadata, triggering handlers');
        handleLoadedMetadata();
        if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
             handleCanPlay();
        }
    }


    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('ended', handleEnded);
      videoElement.removeEventListener('error', handleError);
      clearEndCheckInterval();
    };
  }, [scene, isLoaded, isDraggingPlayhead, clearEndCheckInterval, videoKey]); // videoKey ensures listeners re-attach if video remounts

  // Effect for auto-pausing at scene end
   useEffect(() => {
    const videoElement = videoRef.current;
    if (isPlaying && videoElement && scene && isLoaded) {
      clearEndCheckInterval();
      intervalRef.current = setInterval(() => {
        if (videoElement.currentTime >= scene.end - 0.05) { // Small buffer
          videoElement.pause();
          // setIsPlaying(false); // handlePause listener will do this
          videoElement.currentTime = scene.start; // Optionally reset to start of scene on pause
          setCurrentTimeInScene(0);
          clearEndCheckInterval();
        }
      }, 50); // Check frequently
    } else {
      clearEndCheckInterval();
    }
    return () => clearEndCheckInterval();
  }, [isPlaying, scene, isLoaded, clearEndCheckInterval]);


  const seekVideo = useCallback((newSceneTime: number) => {
    const videoElement = videoRef.current;
    if (videoElement && scene && isLoaded) {
      const targetAbsoluteTime = scene.start + newSceneTime;
      // Clamp to scene boundaries
      videoElement.currentTime = Math.max(scene.start, Math.min(targetAbsoluteTime, scene.end - 0.01)); // -0.01 to avoid hitting exact end
      setCurrentTimeInScene(Math.max(0, videoElement.currentTime - scene.start));
    }
  }, [scene, isLoaded]);

  const handlePlayPause = () => {
    const videoElement = videoRef.current;
    if (videoElement && scene && isLoaded) {
      if (videoElement.paused) {
        // If at the end of the scene, reset to the start before playing
        if (currentTimeInScene >= sceneDuration - 0.1) {
          seekVideo(0);
        }
        videoElement.play().catch(error => {
            console.error("Error playing video:", error);
            setVideoError(`Play failed: ${error.message}`);
        });
      } else {
        videoElement.pause();
      }
    }
  };

  const handleStop = () => {
    const videoElement = videoRef.current;
    if (videoElement && scene && isLoaded) {
      videoElement.pause();
      seekVideo(0);
    }
  };

  const handleTimelineInteraction = useCallback((event: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!timelineRef.current || !scene || sceneDuration <= 0) return;
    const timelineRect = timelineRef.current.getBoundingClientRect();
    const clickX = event.clientX - timelineRect.left;
    let newTimeRatio = clickX / timelineRect.width;
    newTimeRatio = Math.max(0, Math.min(1, newTimeRatio)); // Clamp between 0 and 1

    const newSceneTime = newTimeRatio * sceneDuration;
    seekVideo(newSceneTime);

  }, [scene, sceneDuration, seekVideo]);

  const onTimelineMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; // Only left click
    setIsDraggingPlayhead(true);
    handleTimelineInteraction(event); // Seek on initial click

    const onDragMouseMove = (moveEvent: MouseEvent) => {
        handleTimelineInteraction(moveEvent);
    };
    const onDragMouseUp = () => {
        setIsDraggingPlayhead(false);
        document.removeEventListener('mousemove', onDragMouseMove);
        document.removeEventListener('mouseup', onDragMouseUp);
    };

    document.addEventListener('mousemove', onDragMouseMove);
    document.addEventListener('mouseup', onDragMouseUp);
  };

  if (!videoUrl || !scene) {
    return <div className="scene-preview-placeholder">Select a scene to preview.</div>;
  }

  const playheadPositionPercent = sceneDuration > 0 ? (currentTimeInScene / sceneDuration) * 100 : 0;

  return (
    <div className="scene-preview-editor-style">
      {/* Apply CSS to style this like an editor - it will need more height */}
      <div className="video-display-area">
        <video
            ref={videoRef}
            className="scene-preview-video-element"
            key={videoKey} // Forces re-mount if key (src or critical scene boundaries) changes
            src={videoUrl || undefined}
            playsInline
            preload="auto"
            controls={false}
            muted={false}
            onContextMenu={(e) => e.preventDefault()} // Optional: disable right click menu
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '400px',
              backgroundColor: '#000',
              display: 'block'
            }}
        >
          Your browser does not support the video tag.
        </video>
        {videoError && <div className="video-error-overlay">{videoError}</div>}
        {!isLoaded && !videoError && <div className="video-loading-overlay">Loading Scene...</div>}

        {/* Subtitle Overlay */}
        <SubtitleOverlay
          currentTime={currentTimeInScene}
          subtitles={subtitles}
          visible={showSubtitles && subtitles.length > 0}
        />
      </div>

      <div className="timeline-controls-area">
        <div className="timeline-track-container" ref={timelineRef} onMouseDown={onTimelineMouseDown}>
          <div className="timeline-track">
            {/* Optional: Add tick marks or other visual elements to the track via CSS */}
            <div
                ref={playheadRef}
                className="timeline-playhead"
                style={{ left: `${playheadPositionPercent}%` }}
            />
          </div>
        </div>

        <div className="playback-buttons-panel">
          <button onClick={handleStop} disabled={!isLoaded || !!videoError} className="control-btn stop-btn" title="Stop and Rewind">
            {/* Icon for Stop (e.g., square) */} ■
          </button>
          <button onClick={handlePlayPause} disabled={!isLoaded || !!videoError} className="control-btn play-pause-btn" title={isPlaying ? "Pause" : "Play"}>
            {/* Icons for Play/Pause */} {isPlaying ? '❚❚' : '▶'}
          </button>

          {/* Subtitle Toggle */}
          {subtitles.length > 0 && (
            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`control-btn subtitle-toggle ${showSubtitles ? 'active' : ''}`}
              title={showSubtitles ? "Hide Subtitles" : "Show Subtitles"}
            >
              💬
            </button>
          )}
          {/* Add more controls here if needed, e.g., step frame, loop */}
        </div>

        <div className="timecode-display-panel">
          <span className="timecode current-time">{formatDisplayTime(currentTimeInScene)}</span>
          <span className="timecode-separator">/</span>
          <span className="timecode duration">{formatDisplayTime(sceneDuration)}</span>
          {subtitles.length > 0 && (
            <span className="subtitle-count" style={{ marginLeft: '10px', fontSize: '12px', color: '#888' }}>
              📝 {subtitles.length} subs
            </span>
          )}

          {/* AI Results Toggle */}
          {Object.keys(aiResults).length > 0 && (
            <button
              onClick={() => setShowAIResults(!showAIResults)}
              className={`control-btn ai-results-toggle ${showAIResults ? 'active' : ''}`}
              title={showAIResults ? "Hide AI Results" : "Show AI Results"}
              style={{ marginLeft: '10px' }}
            >
              🤖 {Object.keys(aiResults).length}
            </button>
          )}
        </div>

        {/* AI Results Panel */}
        {showAIResults && Object.keys(aiResults).length > 0 && (
          <div className="ai-results-panel" style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '5px',
            fontSize: '12px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>
              🤖 AI Processing Results
            </h4>
            {Object.entries(aiResults).map(([agentType, result]) => (
              <div key={agentType} style={{
                marginBottom: '8px',
                padding: '8px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #ddd'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {agentType.split('-').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </div>
                <div style={{ color: '#666', fontSize: '11px' }}>
                  Processed: {new Date(result.processedAt).toLocaleTimeString()}
                </div>
                {result.result && (
                  <div style={{ marginTop: '4px', fontSize: '11px' }}>
                    {agentType === 'subtitle-generator' && result.result.subtitles && (
                      <span>✅ {result.result.subtitles.length} subtitles generated</span>
                    )}
                    {agentType === 'video-enhancer' && result.result.qualityScore && (
                      <div>
                        <span>✅ Quality improved to {(result.result.qualityScore * 100).toFixed(0)}%</span>
                        {result.result.isRealProcessing && (
                          <div style={{ marginTop: '2px', fontSize: '10px', color: '#4CAF50' }}>
                            🎬 Real FFmpeg.js processing
                          </div>
                        )}
                        {result.result.enhancedVideoUrl && (
                          <button
                            onClick={() => {
                              // Switch to enhanced video
                              const videoElement = document.querySelector('.scene-preview-video-element') as HTMLVideoElement;
                              if (videoElement) {
                                videoElement.src = result.result.enhancedVideoUrl;
                                videoElement.load();
                              }
                            }}
                            style={{
                              marginTop: '4px',
                              padding: '2px 6px',
                              fontSize: '10px',
                              backgroundColor: '#4CAF50',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            View Enhanced
                          </button>
                        )}
                      </div>
                    )}
                    {agentType === 'audio-processor' && result.result.improvements && (
                      <span>✅ {result.result.improvements.length} audio improvements</span>
                    )}
                    {agentType === 'content-analyzer' && result.result.detectedObjects && (
                      <span>✅ {result.result.detectedObjects.length} objects detected</span>
                    )}
                    {agentType === 'color-grader' && result.result.colorProfile && (
                      <span>✅ Applied {result.result.colorProfile} color profile</span>
                    )}
                    {agentType === 'object-detector' && result.result.objects && (
                      <span>✅ {result.result.objects.length} objects tracked</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScenePreview;