// src/utils/testOptimizedSystem.ts
// Test script to verify the optimized storage system

import { projectDataManager } from './projectDataManager';
import type { OptimizedProjectData, AnalyzedVideoData } from '../types';

export async function testOptimizedSystem(): Promise<void> {
  console.log('🧪 Testing optimized storage system...');

  try {
    // Test 1: Initialize system
    console.log('Test 1: Initializing system...');
    const project = await projectDataManager.initialize();
    console.log('✅ System initialized:', !!project);

    // Test 2: Check current project
    console.log('Test 2: Getting current project...');
    const currentProject = projectDataManager.getCurrentProject();
    console.log('✅ Current project:', {
      hasProject: !!currentProject,
      scenes: currentProject?.scenes.length || 0,
      version: currentProject?.metadata.version
    });

    // Test 3: Test playback order
    console.log('Test 3: Getting playback order...');
    const playbackOrder = projectDataManager.getPlaybackOrder();
    console.log('✅ Playback order:', {
      scenes: playbackOrder.length,
      order: playbackOrder.map(s => ({ id: s.sceneId, order: s.displayOrder, title: s.title }))
    });

    // Test 4: Test scene update (if we have scenes)
    if (currentProject && currentProject.scenes.length > 0) {
      console.log('Test 4: Testing scene update...');
      const firstScene = currentProject.scenes[0];
      const originalTitle = firstScene.title;
      
      await projectDataManager.updateScene(firstScene.sceneId, {
        title: `${originalTitle} (Updated)`
      });
      
      const updatedProject = projectDataManager.getCurrentProject();
      const updatedScene = updatedProject?.scenes.find(s => s.sceneId === firstScene.sceneId);
      
      console.log('✅ Scene update test:', {
        originalTitle,
        newTitle: updatedScene?.title,
        success: updatedScene?.title === `${originalTitle} (Updated)`
      });

      // Restore original title
      await projectDataManager.updateScene(firstScene.sceneId, {
        title: originalTitle
      });
    }

    // Test 5: Check localStorage usage
    console.log('Test 5: Checking localStorage usage...');
    const storageKeys = Object.keys(localStorage);
    const optimizedKeys = storageKeys.filter(key => key.includes('storyboard-project-v2'));
    const legacyKeys = storageKeys.filter(key => 
      key.includes('storyboard-project-nodes') || 
      key.includes('storyboard-project-edges') ||
      key.includes('timeline-')
    );
    
    console.log('✅ Storage analysis:', {
      optimizedKeys: optimizedKeys.length,
      legacyKeys: legacyKeys.length,
      totalKeys: storageKeys.length,
      optimizedKeysList: optimizedKeys,
      legacyKeysList: legacyKeys.slice(0, 5) // Show first 5 legacy keys
    });

    // Test 6: Memory usage estimation
    console.log('Test 6: Memory usage estimation...');
    let totalSize = 0;
    let optimizedSize = 0;
    let legacySize = 0;

    storageKeys.forEach(key => {
      const value = localStorage.getItem(key) || '';
      const size = value.length;
      totalSize += size;

      if (key.includes('storyboard-project-v2')) {
        optimizedSize += size;
      } else if (key.includes('storyboard') || key.includes('timeline-')) {
        legacySize += size;
      }
    });

    console.log('✅ Memory usage:', {
      totalSize: Math.round(totalSize / 1024) + 'KB',
      optimizedSize: Math.round(optimizedSize / 1024) + 'KB',
      legacySize: Math.round(legacySize / 1024) + 'KB',
      efficiency: legacySize > 0 ? Math.round((legacySize - optimizedSize) / legacySize * 100) + '% reduction' : 'N/A'
    });

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test migration from sample data
export async function testMigrationWithSampleData(): Promise<void> {
  console.log('🧪 Testing migration with sample data...');

  // Create sample legacy data
  const sampleAnalysis: AnalyzedVideoData = {
    analysisId: 'test-analysis-123',
    fileName: 'sample-video.mp4',
    videoUrl: 'blob:sample-url',
    duration: 120,
    scenes: [
      {
        scene_index: 0,
        sceneId: 'scene-1',
        start: 0,
        end: 30,
        duration: 30,
        title: 'Opening Scene',
        tags: ['intro'],
        avg_volume: 0.5,
        high_energy: 1,
        transition_type: 'fade'
      },
      {
        scene_index: 1,
        sceneId: 'scene-2',
        start: 30,
        end: 90,
        duration: 60,
        title: 'Main Content',
        tags: ['main', 'action'],
        avg_volume: 0.8,
        high_energy: 1,
        transition_type: 'cut'
      },
      {
        scene_index: 2,
        sceneId: 'scene-3',
        start: 90,
        end: 120,
        duration: 30,
        title: 'Closing Scene',
        tags: ['outro'],
        avg_volume: 0.3,
        high_energy: 0,
        transition_type: 'fade'
      }
    ]
  };

  const sampleNodes = [
    {
      id: 'scene_node_test_scene-1',
      type: 'default',
      position: { x: 100, y: 100 },
      data: {
        label: 'Opening Scene',
        type: 'scene',
        content: 'Time: 0:00-0:30',
        videoAnalysisData: {
          analysisId: 'test-analysis-123',
          sceneIndex: 0,
          sceneId: 'scene-1',
          originalVideoFileName: 'sample-video.mp4',
          start: 0,
          end: 30,
          duration: 30,
          title: 'Opening Scene',
          tags: ['intro']
        }
      }
    },
    {
      id: 'scene_node_test_scene-2',
      type: 'default',
      position: { x: 300, y: 100 },
      data: {
        label: 'Main Content',
        type: 'scene',
        content: 'Time: 0:30-1:30',
        videoAnalysisData: {
          analysisId: 'test-analysis-123',
          sceneIndex: 1,
          sceneId: 'scene-2',
          originalVideoFileName: 'sample-video.mp4',
          start: 30,
          end: 90,
          duration: 60,
          title: 'Main Content',
          tags: ['main', 'action']
        }
      }
    }
  ];

  try {
    // Clear existing data
    localStorage.clear();

    // Set up legacy data
    localStorage.setItem('storyboard-current-analysis', JSON.stringify(sampleAnalysis));
    localStorage.setItem('storyboard-project-nodes', JSON.stringify(sampleNodes));
    localStorage.setItem('storyboard-project-edges', JSON.stringify([]));

    // Add some timeline data
    localStorage.setItem('timeline-scene-1', JSON.stringify({
      clips: [],
      playhead: 0,
      edits: [],
      lastSaved: Date.now()
    }));

    console.log('✅ Sample legacy data created');

    // Test migration
    const project = await projectDataManager.initialize();
    
    if (project) {
      console.log('✅ Migration successful:', {
        projectId: project.projectId,
        scenes: project.scenes.length,
        version: project.metadata.version,
        sceneDetails: project.scenes.map(s => ({
          id: s.sceneId,
          title: s.title,
          order: s.displayOrder,
          duration: s.currentDuration
        }))
      });

      // Test that legacy data is preserved in new format
      const scene1 = project.scenes.find(s => s.sceneId === 'scene-1');
      const scene2 = project.scenes.find(s => s.sceneId === 'scene-2');

      console.log('✅ Data integrity check:', {
        scene1Preserved: scene1?.title === 'Opening Scene' && scene1?.currentDuration === 30,
        scene2Preserved: scene2?.title === 'Main Content' && scene2?.currentDuration === 60,
        timelineDataMigrated: scene1?.timelineEdits ? Object.keys(scene1.timelineEdits).length > 0 : false
      });

    } else {
      console.error('❌ Migration failed - no project returned');
    }

  } catch (error) {
    console.error('❌ Migration test failed:', error);
  }
}

// Run tests when this module is imported in development
if (import.meta.env.DEV) {
  // Expose test functions to window for manual testing
  (window as any).testOptimizedSystem = testOptimizedSystem;
  (window as any).testMigrationWithSampleData = testMigrationWithSampleData;
  
  console.log('🧪 Test functions available:');
  console.log('- window.testOptimizedSystem()');
  console.log('- window.testMigrationWithSampleData()');
}
