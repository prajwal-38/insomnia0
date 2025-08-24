// src/utils/debugCurrentData.ts
// Debug script to check what data is currently in localStorage

export function debugCurrentData(): void {
  console.log('🔍 DEBUGGING CURRENT LOCALSTORAGE DATA');
  console.log('=====================================');

  // Get all localStorage keys
  const allKeys = Object.keys(localStorage);
  console.log('📋 All localStorage keys:', allKeys);

  // Check for optimized data
  const optimizedData = localStorage.getItem('storyboard-project-v2');
  if (optimizedData) {
    try {
      const parsed = JSON.parse(optimizedData);
      console.log('✅ Found optimized project data:', {
        projectId: parsed.projectId,
        videoFileName: parsed.videoFileName,
        totalScenes: parsed.scenes?.length || 0,
        scenes: parsed.scenes?.map((s: any) => ({
          id: s.sceneId,
          title: s.title,
          order: s.displayOrder,
          duration: s.currentDuration
        })) || []
      });
    } catch (e) {
      console.error('❌ Failed to parse optimized data:', e);
    }
  } else {
    console.log('❌ No optimized project data found');
  }

  // Check for legacy data
  const legacyNodes = localStorage.getItem('storyboard-project-nodes');
  if (legacyNodes) {
    try {
      const nodes = JSON.parse(legacyNodes);
      const sceneNodes = nodes.filter((n: any) => n.data?.type === 'scene' && n.data?.videoAnalysisData);
      console.log('📦 Found legacy nodes data:', {
        totalNodes: nodes.length,
        sceneNodes: sceneNodes.length,
        scenes: sceneNodes.map((n: any) => ({
          id: n.data.videoAnalysisData.sceneId,
          title: n.data.videoAnalysisData.title,
          duration: n.data.videoAnalysisData.duration
        }))
      });
    } catch (e) {
      console.error('❌ Failed to parse legacy nodes:', e);
    }
  } else {
    console.log('❌ No legacy nodes data found');
  }

  // Check for analysis data
  const analysisData = localStorage.getItem('storyboard-current-analysis');
  if (analysisData) {
    try {
      const analysis = JSON.parse(analysisData);
      console.log('🎬 Found analysis data:', {
        analysisId: analysis.analysisId,
        fileName: analysis.fileName,
        duration: analysis.duration,
        totalScenes: analysis.scenes?.length || 0,
        scenes: analysis.scenes?.map((s: any) => ({
          index: s.scene_index,
          id: s.sceneId,
          title: s.title,
          start: s.start,
          end: s.end,
          duration: s.duration
        })) || []
      });
    } catch (e) {
      console.error('❌ Failed to parse analysis data:', e);
    }
  } else {
    console.log('❌ No analysis data found');
  }

  // Check migration flag
  const migrationFlag = localStorage.getItem('storyboard-migration-completed');
  console.log('🔄 Migration completed:', !!migrationFlag);

  // Check timeline data
  const timelineKeys = allKeys.filter(key => key.startsWith('timeline-'));
  console.log('⏱️ Timeline keys found:', timelineKeys.length);
  if (timelineKeys.length > 0) {
    console.log('Timeline keys:', timelineKeys.slice(0, 5)); // Show first 5
  }

  // Summary
  console.log('\n📊 SUMMARY:');
  console.log('- Optimized data:', !!optimizedData);
  console.log('- Legacy nodes:', !!legacyNodes);
  console.log('- Analysis data:', !!analysisData);
  console.log('- Migration completed:', !!migrationFlag);
  console.log('- Timeline keys:', timelineKeys.length);
}

export function checkRealVideoData(): void {
  console.log('🎬 CHECKING FOR REAL VIDEO DATA');
  console.log('===============================');

  // Check if we have real video analysis (not demo data)
  const analysisData = localStorage.getItem('storyboard-current-analysis');
  if (analysisData) {
    try {
      const analysis = JSON.parse(analysisData);
      
      // Check if this is demo data
      const isDemoData = analysis.fileName === 'demo-video.mp4' || 
                        analysis.analysisId?.includes('demo-analysis');
      
      if (isDemoData) {
        console.log('⚠️ Current data is DEMO DATA, not real video');
        console.log('Demo analysis:', {
          fileName: analysis.fileName,
          analysisId: analysis.analysisId,
          scenes: analysis.scenes?.length || 0
        });
      } else {
        console.log('✅ Found REAL VIDEO DATA:');
        console.log('Real analysis:', {
          fileName: analysis.fileName,
          analysisId: analysis.analysisId,
          duration: analysis.duration,
          scenes: analysis.scenes?.length || 0,
          sceneDetails: analysis.scenes?.map((s: any) => ({
            index: s.scene_index,
            title: s.title,
            duration: s.duration
          })) || []
        });
      }
    } catch (e) {
      console.error('❌ Failed to parse analysis data:', e);
    }
  } else {
    console.log('❌ No analysis data found at all');
  }

  // Check optimized data too
  const optimizedData = localStorage.getItem('storyboard-project-v2');
  if (optimizedData) {
    try {
      const project = JSON.parse(optimizedData);
      const isDemoProject = project.videoFileName === 'demo-video.mp4' || 
                           project.projectId?.includes('demo-analysis');
      
      if (isDemoProject) {
        console.log('⚠️ Optimized data is also DEMO DATA');
      } else {
        console.log('✅ Optimized data contains REAL VIDEO:');
        console.log('Real project:', {
          fileName: project.videoFileName,
          projectId: project.projectId,
          scenes: project.scenes?.length || 0
        });
      }
    } catch (e) {
      console.error('❌ Failed to parse optimized data:', e);
    }
  }
}

export function restoreRealVideoData(): void {
  console.log('🔄 ATTEMPTING TO RESTORE REAL VIDEO DATA');
  console.log('=========================================');

  // Look for any backup or alternative keys that might have real data
  const allKeys = Object.keys(localStorage);

  // Check for backup keys
  const backupKeys = allKeys.filter(key =>
    key.includes('backup') ||
    key.includes('original') ||
    key.includes('storyboard') && !key.includes('demo')
  );

  console.log('🔍 Found potential backup keys:', backupKeys);

  backupKeys.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        console.log(`📦 Key "${key}":`, {
          type: typeof parsed,
          hasScenes: !!parsed.scenes,
          sceneCount: parsed.scenes?.length || 0,
          fileName: parsed.fileName || parsed.videoFileName || 'unknown'
        });
      }
    } catch (e) {
      console.log(`❌ Failed to parse key "${key}"`);
    }
  });
}

export function clearDemoDataAndRestore(): void {
  console.log('🧹 CLEARING DEMO DATA AND RESTORING REAL DATA');
  console.log('==============================================');

  // Clear demo data
  localStorage.removeItem('storyboard-project-v2');
  localStorage.removeItem('storyboard-migration-completed');

  console.log('✅ Cleared demo data');

  // Check if we have real legacy data
  const legacyAnalysis = localStorage.getItem('storyboard-current-analysis');
  const legacyNodes = localStorage.getItem('storyboard-project-nodes');

  if (legacyAnalysis && legacyNodes) {
    try {
      const analysis = JSON.parse(legacyAnalysis);
      const nodes = JSON.parse(legacyNodes);

      // Check if this is real data (not demo)
      const isRealData = analysis.fileName !== 'demo-video.mp4' &&
                        !analysis.analysisId?.includes('demo-analysis');

      if (isRealData) {
        console.log('✅ Found real legacy data:', {
          fileName: analysis.fileName,
          analysisId: analysis.analysisId,
          scenes: analysis.scenes?.length || 0,
          nodes: nodes.length
        });

        console.log('🔄 Please refresh the page to trigger migration of real data');
        return;
      } else {
        console.log('⚠️ Legacy data is also demo data');
      }
    } catch (e) {
      console.error('❌ Failed to parse legacy data:', e);
    }
  }

  console.log('❌ No real video data found to restore');
}

export function forceRecreateFromLegacy(): void {
  console.log('🔄 FORCING RECREATION FROM LEGACY DATA');
  console.log('======================================');

  // Clear optimized data to force recreation
  localStorage.removeItem('storyboard-project-v2');
  localStorage.removeItem('storyboard-project-backup-v2');
  localStorage.removeItem('storyboard-migration-completed');

  console.log('✅ Cleared all optimized data');
  console.log('🔄 Please refresh the page to trigger fresh migration');
}

// Make functions available in browser console (only in development)
if (import.meta.env.DEV) {
  (window as any).debugCurrentData = debugCurrentData;
  (window as any).checkRealVideoData = checkRealVideoData;
  (window as any).restoreRealVideoData = restoreRealVideoData;
  (window as any).clearDemoDataAndRestore = clearDemoDataAndRestore;
  (window as any).forceRecreateFromLegacy = forceRecreateFromLegacy;

  // Only log debug functions availability once
  if (!(window as any).__debugFunctionsLogged) {
    console.log('🔍 Debug functions available (type in console):');
    console.log('- window.debugCurrentData()');
    console.log('- window.checkRealVideoData()');
    console.log('- window.restoreRealVideoData()');
    console.log('- window.clearDemoDataAndRestore()');
    console.log('- window.forceRecreateFromLegacy()');
    (window as any).__debugFunctionsLogged = true;
  }
}
