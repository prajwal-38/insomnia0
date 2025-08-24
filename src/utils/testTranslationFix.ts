/**
 * Quick test to verify translation integration fix
 * Run this in browser console to test the translation flow
 */

export function testTranslationFix() {
  console.log('🧪 Testing Translation Integration Fix...');
  
  // Test 1: Check if currentAnalysisData includes translation fields
  const currentAnalysisData = localStorage.getItem('currentAnalysisData');
  if (currentAnalysisData) {
    try {
      const data = JSON.parse(currentAnalysisData);
      console.log('📊 Current Analysis Data:', {
        scenes: data.scenes?.length || 0,
        hasTranslationFields: data.scenes?.some((s: any) => s.translatedVideoUrl || s.isTranslated)
      });
      
      // Check for translated scenes
      const translatedScenes = data.scenes?.filter((s: any) => s.isTranslated) || [];
      console.log(`🌐 Found ${translatedScenes.length} translated scenes:`, translatedScenes.map((s: any) => ({
        sceneId: s.sceneId,
        title: s.title,
        translatedVideoUrl: s.translatedVideoUrl,
        targetLanguage: s.translationInfo?.targetLanguage
      })));
      
    } catch (error) {
      console.error('❌ Failed to parse currentAnalysisData:', error);
    }
  } else {
    console.log('⚠️ No currentAnalysisData found in localStorage');
  }
  
  // Test 2: Check project data manager
  try {
    // @ts-ignore - Access global project manager
    const projectManager = window.projectDataManager || (window as any).projectDataManager;
    if (projectManager) {
      const project = projectManager.getCurrentProject();
      if (project) {
        console.log('📂 Project Data:', {
          scenes: project.scenes?.length || 0,
          hasTranslationFields: project.scenes?.some((s: any) => s.translatedVideoUrl || s.isTranslated)
        });
        
        const translatedScenes = project.scenes?.filter((s: any) => s.isTranslated) || [];
        console.log(`🌐 Project translated scenes: ${translatedScenes.length}`, translatedScenes.map((s: any) => ({
          sceneId: s.sceneId,
          title: s.title,
          translatedVideoUrl: s.translatedVideoUrl,
          targetLanguage: s.translationInfo?.targetLanguage
        })));
      } else {
        console.log('⚠️ No current project found');
      }
    } else {
      console.log('⚠️ Project data manager not accessible');
    }
  } catch (error) {
    console.error('❌ Failed to check project data:', error);
  }
  
  // Test 3: Simulate translation event
  console.log('🎭 Simulating translation event...');
  const mockTranslationEvent = new CustomEvent('video-translation-completed', {
    detail: {
      sceneId: 'test-scene-123',
      translatedVideoUrl: '/api/translated-video/test_translated.mp4',
      translationInfo: {
        targetLanguage: 'es',
        voice: 'Kore',
        originalLanguage: 'en',
        translatedAt: Date.now(),
        agentId: 'test-agent'
      }
    }
  });
  
  window.dispatchEvent(mockTranslationEvent);
  console.log('✅ Mock translation event dispatched');
  
  // Test 4: Check if NodeTimeline utilities work
  testUtilityFunctions();
  
  console.log('🧪 Translation Integration Test Complete');
}

/**
 * Test utility functions asynchronously
 */
async function testUtilityFunctions() {
  try {
    // @ts-ignore - Test utility functions
    const { getEffectiveVideoUrl, isSceneTranslated } = await import('./sceneTranslationManager');

    const mockScene = {
      sceneId: 'test-scene',
      translatedVideoUrl: '/api/translated-video/test.mp4',
      isTranslated: true,
      proxy_video_url: '/api/proxy/test.mp4'
    };

    const effectiveUrl = getEffectiveVideoUrl(mockScene, '/api/original/test.mp4');
    const isTranslated = isSceneTranslated(mockScene);

    console.log('🔧 Utility Functions Test:', {
      effectiveUrl,
      isTranslated,
      expectedUrl: window.location.origin + '/api/translated-video/test.mp4',
      urlCorrect: effectiveUrl === (window.location.origin + '/api/translated-video/test.mp4'),
      translationCorrect: isTranslated === true
    });

  } catch (error) {
    console.error('❌ Failed to test utility functions:', error);
  }
}

/**
 * Test main timeline translation integration
 */
export function testMainTimelineIntegration() {
  console.log('🎬 Testing Main Timeline Translation Integration...');

  // Check if main timeline is currently open
  const timelineElement = document.querySelector('#timeline-container');
  if (timelineElement) {
    console.log('✅ Main timeline is currently open');

    // Check for translation indicator in header
    const translationIndicator = document.querySelector('[title*="translated scenes loaded in timeline"]');
    if (translationIndicator) {
      console.log('🌐 Translation indicator found in header:', translationIndicator.textContent);
    } else {
      console.log('⚠️ No translation indicator found in header');
    }

    // Check timeline state for translated segments
    try {
      // Access the timeline state through the global state manager
      const timelineCanvas = document.querySelector('#designcombo-timeline-canvas');
      if (timelineCanvas) {
        console.log('🎥 Timeline canvas found');

        // Try to access timeline state through events
        let timelineState: any = null;
        const stateEvent = new CustomEvent('getTimelineState', {
          detail: { callback: (state: any) => { timelineState = state; } }
        });
        window.dispatchEvent(stateEvent);

        if (timelineState) {
          const translatedSegments = timelineState.trackItemIds?.filter((id: string) => {
            const item = timelineState.trackItemsMap?.[id];
            return item?.metadata?.isTranslated && item?.metadata?.isMezzanineSegment;
          }) || [];

          console.log('🌐 Timeline state analysis:', {
            totalSegments: timelineState.trackItemIds?.length || 0,
            translatedSegments: translatedSegments.length,
            translatedIds: translatedSegments
          });
        } else {
          console.log('⚠️ Could not access timeline state');
        }
      } else {
        console.log('⚠️ Timeline canvas not found');
      }
    } catch (error) {
      console.error('❌ Error analyzing timeline state:', error);
    }

  } else {
    console.log('⚠️ Main timeline is not currently open');
    console.log('💡 Navigate to the editor page to test main timeline integration');
  }
}

/**
 * Test specifically for NodeTimeline integration
 */
export function testNodeTimelineIntegration() {
  console.log('🎬 Testing NodeTimeline Integration...');
  
  // Check if NodeTimeline is currently open
  const nodeTimelineElement = document.querySelector('.node-timeline-container');
  if (nodeTimelineElement) {
    console.log('✅ NodeTimeline is currently open');
    
    // Check for translation indicator
    const translationIndicator = document.querySelector('.node-timeline-translation-indicator');
    if (translationIndicator) {
      console.log('🌐 Translation indicator found:', translationIndicator.textContent);
    } else {
      console.log('⚠️ No translation indicator found');
    }
    
    // Check video element
    const videoElement = document.querySelector('.node-timeline-video') as HTMLVideoElement;
    if (videoElement) {
      console.log('🎥 Video element found:', {
        src: videoElement.src,
        isTranslatedVideo: videoElement.src.includes('translated-video'),
        currentTime: videoElement.currentTime,
        duration: videoElement.duration
      });
    } else {
      console.log('⚠️ No video element found');
    }
    
  } else {
    console.log('⚠️ NodeTimeline is not currently open');
    console.log('💡 Open a scene in NodeTimeline to test translation integration');
  }
}

/**
 * Force refresh currentAnalysisData from project data
 */
export function forceRefreshAnalysisData() {
  console.log('🔄 Force refreshing currentAnalysisData...');
  
  try {
    // Trigger the optimized system update event
    window.dispatchEvent(new CustomEvent('projectDataUpdated'));
    console.log('✅ Project data update event dispatched');
    
    // Also trigger optimized project update
    window.dispatchEvent(new CustomEvent('optimizedProjectUpdated'));
    console.log('✅ Optimized project update event dispatched');
    
    setTimeout(() => {
      console.log('🔍 Checking updated data...');
      testTranslationFix();
    }, 1000);
    
  } catch (error) {
    console.error('❌ Failed to force refresh:', error);
  }
}

/**
 * Debug the complete translation data flow
 */
export function debugTranslationDataFlow(sceneId?: string) {
  console.log('🔍 DEBUGGING TRANSLATION DATA FLOW...');

  // 1. Check localStorage currentAnalysisData
  const currentAnalysisData = localStorage.getItem('currentAnalysisData');
  if (currentAnalysisData) {
    try {
      const data = JSON.parse(currentAnalysisData);
      console.log('📊 localStorage currentAnalysisData:', {
        scenes: data.scenes?.length || 0,
        analysisId: data.analysisId
      });

      if (sceneId) {
        const scene = data.scenes?.find((s: any) => s.sceneId === sceneId);
        if (scene) {
          console.log(`🎬 Scene ${sceneId} in localStorage:`, {
            title: scene.title,
            translatedVideoUrl: scene.translatedVideoUrl,
            isTranslated: scene.isTranslated,
            translationInfo: scene.translationInfo
          });
        } else {
          console.log(`❌ Scene ${sceneId} not found in localStorage`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse localStorage data:', error);
    }
  }

  // 2. Check project data manager
  try {
    // @ts-ignore
    const projectManager = window.projectDataManager;
    if (projectManager) {
      const project = projectManager.getCurrentProject();
      if (project && sceneId) {
        const scene = project.scenes?.find((s: any) => s.sceneId === sceneId);
        if (scene) {
          console.log(`🗂️ Scene ${sceneId} in project manager:`, {
            title: scene.title,
            translatedVideoUrl: (scene as any).translatedVideoUrl,
            isTranslated: (scene as any).isTranslated,
            translationInfo: (scene as any).translationInfo
          });
        } else {
          console.log(`❌ Scene ${sceneId} not found in project manager`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to check project manager:', error);
  }

  // 3. Check React state (if accessible)
  try {
    // @ts-ignore
    const reactFiberNode = document.querySelector('#root')?._reactInternalFiber ||
                          document.querySelector('#root')?._reactInternals;
    if (reactFiberNode) {
      console.log('⚛️ React state accessible - checking for currentAnalysisData...');
      // This is a simplified check - in practice, React state is harder to access
    }
  } catch (error) {
    console.log('⚛️ React state not directly accessible (normal)');
  }

  // 4. Check if NodeTimeline is open and what data it has
  const nodeTimelineElement = document.querySelector('.node-timeline-container');
  if (nodeTimelineElement) {
    console.log('🎬 NodeTimeline is open');

    const translationIndicator = document.querySelector('.node-timeline-translation-indicator');
    console.log('🌐 Translation indicator:', translationIndicator ? 'VISIBLE' : 'NOT VISIBLE');

    const videoElement = document.querySelector('.node-timeline-video') as HTMLVideoElement;
    if (videoElement) {
      console.log('🎥 Video element:', {
        src: videoElement.src,
        isTranslatedVideo: videoElement.src.includes('translated-video')
      });
    }
  } else {
    console.log('🎬 NodeTimeline is not open');
  }

  console.log('🔍 Translation data flow debug complete');
}

/**
 * Simulate a translation completion event for testing
 */
export function simulateTranslationEvent(sceneId: string, translatedVideoUrl?: string) {
  console.log(`🎭 Simulating translation event for scene ${sceneId}...`);

  const mockTranslatedUrl = translatedVideoUrl || `/api/translated-video/translated_${sceneId}_test.mp4`;

  const event = new CustomEvent('video-translation-completed', {
    detail: {
      sceneId,
      translatedVideoUrl: mockTranslatedUrl,
      translationInfo: {
        targetLanguage: 'es',
        originalLanguage: 'en',
        voice: 'Kore',
        translatedAt: Date.now(),
        agentId: 'test-agent',
        processingTime: '10.5s'
      }
    }
  });

  window.dispatchEvent(event);
  console.log(`✅ Translation event dispatched for scene ${sceneId}`);

  // Wait a bit then check if NodeTimeline received it
  setTimeout(() => {
    debugTranslationDataFlow(sceneId);
  }, 1000);
}

// Export for global access
if (typeof window !== 'undefined') {
  (window as any).testTranslationFix = testTranslationFix;
  (window as any).testNodeTimelineIntegration = testNodeTimelineIntegration;
  (window as any).testMainTimelineIntegration = testMainTimelineIntegration;
  (window as any).forceRefreshAnalysisData = forceRefreshAnalysisData;
  (window as any).debugTranslationDataFlow = debugTranslationDataFlow;
  (window as any).simulateTranslationEvent = simulateTranslationEvent;

  console.log('🧪 Translation test functions available:');
  console.log('  - testTranslationFix()');
  console.log('  - testNodeTimelineIntegration()');
  console.log('  - testMainTimelineIntegration()');
  console.log('  - forceRefreshAnalysisData()');
  console.log('  - debugTranslationDataFlow(sceneId?)');
  console.log('  - simulateTranslationEvent(sceneId, translatedVideoUrl?)');
}
