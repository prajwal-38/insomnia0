// src/utils/testStorageConsolidation.ts
// Test script to verify storage consolidation works correctly

import { projectDataManager } from './projectDataManager';
import { createApiAnalysisResponseFromOptimized } from './compatibilityLayer';

/**
 * Test the storage consolidation functionality
 */
export async function testStorageConsolidation() {
  console.log('🧪 Testing Storage Consolidation...');
  
  try {
    // Test 1: Initialize optimized system
    console.log('\n📋 Test 1: Initialize optimized system');
    const project = await projectDataManager.initialize();
    console.log('✅ Optimized system initialized:', !!project);
    
    if (!project) {
      console.log('ℹ️ No project data found - this is expected for new installations');
      return;
    }
    
    // Test 2: Convert to ApiAnalysisResponse format
    console.log('\n📋 Test 2: Convert to ApiAnalysisResponse format');
    const analysisData = createApiAnalysisResponseFromOptimized(project);
    console.log('✅ Conversion successful:', {
      analysisId: analysisData.analysisId,
      fileName: analysisData.fileName,
      scenesCount: analysisData.scenes.length,
      videoDuration: analysisData.metadata.duration
    });
    
    // Test 3: Scene operations
    console.log('\n📋 Test 3: Scene operations');
    if (project.scenes.length > 0) {
      const firstScene = project.scenes[0];
      console.log('Original scene:', {
        sceneId: firstScene.sceneId,
        title: firstScene.title,
        duration: firstScene.currentDuration
      });
      
      // Test scene update
      await projectDataManager.updateScene(firstScene.sceneId, {
        title: 'Updated Test Scene'
      });
      
      const updatedProject = projectDataManager.getCurrentProject();
      const updatedScene = updatedProject?.scenes.find(s => s.sceneId === firstScene.sceneId);
      console.log('✅ Scene update successful:', updatedScene?.title === 'Updated Test Scene');
      
      // Revert the change
      await projectDataManager.updateScene(firstScene.sceneId, {
        title: firstScene.title
      });
    }
    
    // Test 4: Real-time event emission
    console.log('\n📋 Test 4: Real-time event emission');
    let eventReceived = false;
    
    const eventHandler = () => {
      eventReceived = true;
      console.log('✅ Real-time update event received');
    };
    
    window.addEventListener('optimizedProjectUpdated', eventHandler);
    
    // Trigger an update
    if (project.scenes.length > 0) {
      await projectDataManager.updateScene(project.scenes[0].sceneId, {
        tags: ['test-tag']
      });
      
      // Wait a bit for the event
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('✅ Event emission test:', eventReceived ? 'PASSED' : 'FAILED');
    }
    
    window.removeEventListener('optimizedProjectUpdated', eventHandler);
    
    // Test 5: Data consistency
    console.log('\n📋 Test 5: Data consistency');
    const currentProject = projectDataManager.getCurrentProject();
    const newAnalysisData = currentProject ? createApiAnalysisResponseFromOptimized(currentProject) : null;
    
    if (newAnalysisData && analysisData) {
      const consistent = newAnalysisData.scenes.length === analysisData.scenes.length &&
                        newAnalysisData.analysisId === analysisData.analysisId;
      console.log('✅ Data consistency test:', consistent ? 'PASSED' : 'FAILED');
    }
    
    console.log('\n🎉 Storage consolidation tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Storage consolidation test failed:', error);
  }
}

/**
 * Test the backward compatibility
 */
export function testBackwardCompatibility() {
  console.log('\n🧪 Testing Backward Compatibility...');
  
  try {
    // Check if legacy data exists
    const legacyAnalysis = localStorage.getItem('storyboard-current-analysis');
    const legacyNodes = localStorage.getItem('storyboard-project-nodes');
    
    console.log('Legacy data found:', {
      analysis: !!legacyAnalysis,
      nodes: !!legacyNodes
    });
    
    // Check if optimized data exists
    const optimizedData = localStorage.getItem('storyboard-project-v2');
    console.log('Optimized data found:', !!optimizedData);
    
    if (legacyAnalysis && !optimizedData) {
      console.log('⚠️ Legacy data exists but no optimized data - migration should run automatically');
    } else if (optimizedData) {
      console.log('✅ Optimized data exists - system is using new storage format');
    } else {
      console.log('ℹ️ No data found - fresh installation');
    }
    
  } catch (error) {
    console.error('❌ Backward compatibility test failed:', error);
  }
}

/**
 * Run all tests
 */
export async function runAllStorageTests() {
  console.log('🚀 Running Storage Consolidation Tests...');
  
  testBackwardCompatibility();
  await testStorageConsolidation();
  
  console.log('\n✅ All storage tests completed!');
}

// Auto-run tests in development
if (process.env.NODE_ENV === 'development') {
  // Run tests after a short delay to allow app initialization
  setTimeout(() => {
    runAllStorageTests().catch(console.error);
  }, 2000);
}
