/**
 * Translation Integration Test Utilities
 * Validates that translated videos load correctly in NodeTimeline
 */

import type { AnalyzedScene, NodeVideoSceneData } from '../types';
import {
  updateSceneWithTranslation,
  getEffectiveVideoUrl,
  isSceneTranslated,
  getTranslationStatus,
  validateTranslationData,
  createTranslationEvent,
  type TranslationUpdateData
} from './sceneTranslationManager';

/**
 * Test data for translation validation
 */
const mockSceneData: AnalyzedScene = {
  sceneId: 'test-scene-123',
  scene_index: 0,
  title: 'Test Scene',
  tags: ['test'],
  start: 0,
  end: 10,
  duration: 10,
  proxy_video_url: '/api/video/test-proxy.mp4',
  analysisId: 'test-analysis-456'
};

const mockTranslationData: TranslationUpdateData = {
  translatedVideoUrl: '/api/translated-video/translated_test-scene-123_abc123.mp4',
  targetLanguage: 'es',
  originalLanguage: 'en',
  voice: 'Kore',
  processingTime: '45.2s',
  agentId: 'audio-translator-001'
};

/**
 * Test suite for translation integration
 */
export class TranslationIntegrationTester {
  private testResults: Array<{ test: string; passed: boolean; message: string }> = [];

  /**
   * Run all translation integration tests
   */
  public runAllTests(): { passed: number; failed: number; results: Array<{ test: string; passed: boolean; message: string }> } {
    console.log('🧪 Starting Translation Integration Tests...');
    
    this.testResults = [];
    
    // Test 1: Scene translation data validation
    this.testTranslationDataValidation();
    
    // Test 2: Scene update with translation
    this.testSceneUpdateWithTranslation();
    
    // Test 3: Video URL resolution
    this.testVideoUrlResolution();
    
    // Test 4: Translation status detection
    this.testTranslationStatusDetection();
    
    // Test 5: Event creation
    this.testTranslationEventCreation();
    
    // Test 6: Video source priority
    this.testVideoSourcePriority();
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    
    console.log(`🧪 Translation Integration Tests Complete: ${passed} passed, ${failed} failed`);
    
    return { passed, failed, results: this.testResults };
  }

  private addTestResult(test: string, passed: boolean, message: string) {
    this.testResults.push({ test, passed, message });
    console.log(`${passed ? '✅' : '❌'} ${test}: ${message}`);
  }

  private testTranslationDataValidation() {
    try {
      // Valid data should pass
      const validResult = validateTranslationData(mockTranslationData);
      this.addTestResult(
        'Translation Data Validation (Valid)',
        validResult === true,
        validResult ? 'Valid translation data accepted' : 'Valid data rejected'
      );

      // Invalid data should fail
      const invalidData = { ...mockTranslationData, translatedVideoUrl: '' };
      const invalidResult = validateTranslationData(invalidData);
      this.addTestResult(
        'Translation Data Validation (Invalid)',
        invalidResult === false,
        invalidResult ? 'Invalid data incorrectly accepted' : 'Invalid data correctly rejected'
      );
    } catch (error) {
      this.addTestResult('Translation Data Validation', false, `Error: ${error}`);
    }
  }

  private testSceneUpdateWithTranslation() {
    try {
      const originalScene = { ...mockSceneData };
      const updatedScene = updateSceneWithTranslation(originalScene, mockTranslationData);
      
      const hasTranslatedUrl = !!(updatedScene as any).translatedVideoUrl;
      const isMarkedTranslated = !!(updatedScene as any).isTranslated;
      const hasTranslationInfo = !!(updatedScene as any).translationInfo;
      
      const passed = hasTranslatedUrl && isMarkedTranslated && hasTranslationInfo;
      
      this.addTestResult(
        'Scene Update with Translation',
        passed,
        passed ? 'Scene correctly updated with translation data' : 'Scene update failed'
      );
    } catch (error) {
      this.addTestResult('Scene Update with Translation', false, `Error: ${error}`);
    }
  }

  private testVideoUrlResolution() {
    try {
      // Test original scene (should use proxy)
      const originalUrl = getEffectiveVideoUrl(mockSceneData, '/api/video/original.mp4');
      const expectedOriginal = window.location.origin + '/api/video/test-proxy.mp4';
      
      this.addTestResult(
        'Video URL Resolution (Original)',
        originalUrl === expectedOriginal,
        `Expected: ${expectedOriginal}, Got: ${originalUrl}`
      );

      // Test translated scene (should use translated)
      const translatedScene = updateSceneWithTranslation(mockSceneData, mockTranslationData);
      const translatedUrl = getEffectiveVideoUrl(translatedScene, '/api/video/original.mp4');
      const expectedTranslated = window.location.origin + mockTranslationData.translatedVideoUrl;
      
      this.addTestResult(
        'Video URL Resolution (Translated)',
        translatedUrl === expectedTranslated,
        `Expected: ${expectedTranslated}, Got: ${translatedUrl}`
      );
    } catch (error) {
      this.addTestResult('Video URL Resolution', false, `Error: ${error}`);
    }
  }

  private testTranslationStatusDetection() {
    try {
      // Test original scene (not translated)
      const originalStatus = isSceneTranslated(mockSceneData);
      this.addTestResult(
        'Translation Status Detection (Original)',
        originalStatus === false,
        originalStatus ? 'Original scene incorrectly marked as translated' : 'Original scene correctly not translated'
      );

      // Test translated scene
      const translatedScene = updateSceneWithTranslation(mockSceneData, mockTranslationData);
      const translatedStatus = isSceneTranslated(translatedScene);
      this.addTestResult(
        'Translation Status Detection (Translated)',
        translatedStatus === true,
        translatedStatus ? 'Translated scene correctly detected' : 'Translated scene not detected'
      );

      // Test translation status details
      const statusDetails = getTranslationStatus(translatedScene);
      const hasCorrectLanguage = statusDetails.targetLanguage === 'es';
      this.addTestResult(
        'Translation Status Details',
        hasCorrectLanguage,
        hasCorrectLanguage ? 'Translation details correct' : 'Translation details incorrect'
      );
    } catch (error) {
      this.addTestResult('Translation Status Detection', false, `Error: ${error}`);
    }
  }

  private testTranslationEventCreation() {
    try {
      const event = createTranslationEvent(mockSceneData.sceneId, mockTranslationData);
      
      const hasCorrectType = event.type === 'video-translation-completed';
      const hasSceneId = event.detail.sceneId === mockSceneData.sceneId;
      const hasTranslatedUrl = !!event.detail.translatedVideoUrl;
      
      const passed = hasCorrectType && hasSceneId && hasTranslatedUrl;
      
      this.addTestResult(
        'Translation Event Creation',
        passed,
        passed ? 'Translation event created correctly' : 'Translation event creation failed'
      );
    } catch (error) {
      this.addTestResult('Translation Event Creation', false, `Error: ${error}`);
    }
  }

  private testVideoSourcePriority() {
    try {
      // Create scene with all video sources
      const sceneWithAllSources = {
        ...mockSceneData,
        proxy_video_url: '/api/video/proxy.mp4'
      };
      
      // Test priority: original < proxy < translated
      const originalUrl = getEffectiveVideoUrl(sceneWithAllSources, '/api/video/original.mp4');
      const expectedProxy = window.location.origin + '/api/video/proxy.mp4';
      
      this.addTestResult(
        'Video Source Priority (Proxy over Original)',
        originalUrl === expectedProxy,
        `Proxy should be preferred over original. Got: ${originalUrl}`
      );

      // Add translation and test priority
      const translatedScene = updateSceneWithTranslation(sceneWithAllSources, mockTranslationData);
      const translatedUrl = getEffectiveVideoUrl(translatedScene, '/api/video/original.mp4');
      const expectedTranslated = window.location.origin + mockTranslationData.translatedVideoUrl;
      
      this.addTestResult(
        'Video Source Priority (Translated over Proxy)',
        translatedUrl === expectedTranslated,
        `Translated should be preferred over proxy. Got: ${translatedUrl}`
      );
    } catch (error) {
      this.addTestResult('Video Source Priority', false, `Error: ${error}`);
    }
  }
}

/**
 * Quick test function for console usage
 */
export function testTranslationIntegration(): void {
  const tester = new TranslationIntegrationTester();
  const results = tester.runAllTests();
  
  if (results.failed === 0) {
    console.log('🎉 All translation integration tests passed!');
  } else {
    console.warn(`⚠️ ${results.failed} translation integration tests failed. Check the results above.`);
  }
}

// Export for global access in development
if (typeof window !== 'undefined') {
  (window as any).testTranslationIntegration = testTranslationIntegration;
}
