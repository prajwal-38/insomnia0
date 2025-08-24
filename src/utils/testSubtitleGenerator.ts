// Test script for subtitle generator functionality
// This can be run in the browser console to test the subtitle generator

import { subtitleGenerator } from '../services/subtitleGenerator';
import { aiProcessingManager } from '../services/aiProcessingManager';
import type { NodeVideoSceneData } from '../types';

// Test function to verify subtitle generator is working
export async function testSubtitleGenerator() {
  console.log('🧪 Testing Subtitle Generator...');

  try {
    // Create a test video element with a real video URL
    const testVideo = document.createElement('video');

    // Use a real video URL from your backend
    // Replace this with an actual video ID from your system
    const { buildApiUrl } = await import('../config/environment');
    testVideo.src = buildApiUrl('/api/video/76daf835-847d-4301-b169-4f844f562a8d');
    testVideo.crossOrigin = 'anonymous';
    testVideo.muted = true;

    console.log('📹 Created test video element with URL:', testVideo.src);

    // Test subtitle generation
    const result = await subtitleGenerator.generateSubtitles(testVideo, {
      language: 'en-US',
      confidence: 0.7
    });

    console.log('✅ Subtitle generation completed:', result);
    console.log(`📝 Generated ${result.subtitles.length} subtitle segments`);
    console.log(`🎯 Confidence: ${result.confidence}`);
    console.log(`🔧 Method: ${result.method}`);

    if (result.subtitles.length > 0) {
      console.log('📋 First few subtitles:');
      result.subtitles.slice(0, 3).forEach((sub, i) => {
        console.log(`  ${i + 1}. [${sub.startTime}s-${sub.endTime}s]: "${sub.text}"`);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Subtitle generation test failed:', error);
    throw error;
  }
}

// Test function to verify AI processing manager integration
export async function testAIProcessingManager() {
  console.log('🧪 Testing AI Processing Manager for Subtitles...');
  
  try {
    // Create mock scene data
    const mockSceneData: NodeVideoSceneData = {
      sceneId: 'test-scene-123',
      analysisId: 'test-analysis-456',
      title: 'Test Scene',
      start: 0,
      end: 30,
      duration: 30,
      startTime: 0,
      endTime: 30,
      sceneIndex: 0,
      tags: ['test'],
      avgVolume: 0.5,
      highEnergy: false,
      transitionType: 'cut',
      originalVideoFileName: 'test-video.mp4'
    };
    
    console.log('📊 Created mock scene data:', mockSceneData);
    
    // Test AI processing
    const result = await aiProcessingManager.processScene(
      'test-agent-789',
      'subtitle-generator',
      mockSceneData,
      (progress) => {
        console.log(`⏳ Processing progress: ${progress}%`);
      }
    );
    
    console.log('✅ AI processing completed:', result);
    console.log(`📝 Generated ${result.result?.subtitles?.length || 0} subtitle segments`);
    
    return result;
    
  } catch (error) {
    console.error('❌ AI processing test failed:', error);
    throw error;
  }
}

// Test function to verify AssemblyAI API connection
export async function testAssemblyAIConnection() {
  console.log('🧪 Testing AssemblyAI API Connection...');
  
  try {
    // Test API key availability
    const { hasApiKey } = await import('../config/apiKeys');
    const hasAssemblyAI = hasApiKey('assemblyai');
    
    console.log(`🔑 AssemblyAI API key available: ${hasAssemblyAI}`);
    
    if (!hasAssemblyAI) {
      throw new Error('AssemblyAI API key not configured');
    }
    
    // Test API endpoint (simple health check)
    const { getApiKey } = await import('../config/apiKeys');
    const apiKey = getApiKey('assemblyai');
    
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'GET',
      headers: {
        'authorization': apiKey,
      }
    });
    
    console.log(`🌐 AssemblyAI API response status: ${response.status}`);
    
    if (response.status === 401) {
      throw new Error('Invalid AssemblyAI API key');
    }
    
    if (response.status === 200 || response.status === 404) {
      console.log('✅ AssemblyAI API connection successful');
      return true;
    }
    
    throw new Error(`Unexpected API response: ${response.status}`);
    
  } catch (error) {
    console.error('❌ AssemblyAI connection test failed:', error);
    throw error;
  }
}

// Combined test function
export async function runAllSubtitleTests() {
  console.log('🚀 Running all subtitle generator tests...');
  
  const results = {
    assemblyAI: false,
    subtitleGenerator: false,
    aiProcessingManager: false
  };
  
  try {
    // Test 1: AssemblyAI Connection
    console.log('\n--- Test 1: AssemblyAI Connection ---');
    results.assemblyAI = await testAssemblyAIConnection();
    
    // Test 2: Subtitle Generator (only if AssemblyAI works)
    if (results.assemblyAI) {
      console.log('\n--- Test 2: Subtitle Generator ---');
      await testSubtitleGenerator();
      results.subtitleGenerator = true;
    }
    
    // Test 3: AI Processing Manager
    console.log('\n--- Test 3: AI Processing Manager ---');
    await testAIProcessingManager();
    results.aiProcessingManager = true;
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('Results:', results);
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.log('Results so far:', results);
    throw error;
  }
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).testSubtitleGenerator = testSubtitleGenerator;
  (window as any).testAIProcessingManager = testAIProcessingManager;
  (window as any).testAssemblyAIConnection = testAssemblyAIConnection;
  (window as any).runAllSubtitleTests = runAllSubtitleTests;
  
  console.log('🧪 Subtitle generator test functions available:');
  console.log('- testSubtitleGenerator()');
  console.log('- testAIProcessingManager()');
  console.log('- testAssemblyAIConnection()');
  console.log('- runAllSubtitleTests()');
}
