// src/services/explicitStorageInit.ts
// Simple initialization for explicit storage system - YOU control everything

import { explicitStorageManager, type ExplicitStorageRules } from './explicitStorageManager';
import { explicitProcessingManager } from './explicitProcessingManager';
import { initializeCloudStorage } from './cloudStorageManager';

// Your explicit configuration - define exactly what goes where
export interface ExplicitConfig {
  // Storage rules - YOU decide where each type of data goes
  storage: ExplicitStorageRules;
  
  // Cloud configuration (optional)
  cloud?: {
    enabled: boolean;
    projectId: string;
    bucketName: string;
    apiEndpoint: string;
  };
  
  // Debug settings
  debug?: {
    logAllOperations: boolean;
    showStorageUsage: boolean;
  };
}

// Predefined configurations for common scenarios
export const STORAGE_CONFIGS = {
  // Everything in localStorage (fastest, limited space)
  ALL_LOCALSTORAGE: {
    storage: {
      timelineEdits: 'localStorage',
      sceneMetadata: 'localStorage',
      aiResults: {
        'subtitle-generator': 'localStorage',
        'video-enhancer': 'localStorage',
        'audio-processor': 'localStorage',
        'color-grader': 'localStorage',
        'object-detector': 'localStorage',
        'content-analyzer': 'localStorage',
        'auto-editor': 'localStorage',
        'scene-classifier': 'localStorage',
        'transition-suggester': 'localStorage',
        'noise-reducer': 'localStorage'
      },
      videoBlobs: {
        original: 'indexedDB', // Videos too big for localStorage
        processed: 'indexedDB',
        aiGenerated: 'indexedDB'
      },
      processing: {
        'subtitle-generator': 'client',
        'video-enhancer': 'client',
        'audio-processor': 'client',
        'color-grader': 'client',
        'object-detector': 'client',
        'content-analyzer': 'client',
        'auto-editor': 'client',
        'scene-classifier': 'client',
        'transition-suggester': 'client',
        'noise-reducer': 'client'
      }
    }
  } as ExplicitConfig,

  // Balanced approach (recommended)
  BALANCED: {
    storage: {
      timelineEdits: 'localStorage',      // Fast access
      sceneMetadata: 'localStorage',      // Fast access
      aiResults: {
        'subtitle-generator': 'localStorage',  // Small text data
        'video-enhancer': 'indexedDB',        // Larger results
        'audio-processor': 'localStorage',     // Small audio data
        'color-grader': 'indexedDB',          // Color data can be large
        'object-detector': 'indexedDB',       // Detection data can be large
        'content-analyzer': 'localStorage',    // Analysis text
        'auto-editor': 'localStorage',        // Edit suggestions
        'scene-classifier': 'localStorage',    // Classification text
        'transition-suggester': 'localStorage', // Suggestion text
        'noise-reducer': 'indexedDB'          // Audio processing data
      },
      videoBlobs: {
        original: 'indexedDB',
        processed: 'indexedDB',
        aiGenerated: 'indexedDB'
      },
      processing: {
        'subtitle-generator': 'client',    // Fast on client
        'video-enhancer': 'client',       // Can be heavy, but doable
        'audio-processor': 'client',      // Good on client
        'color-grader': 'client',         // Good on client
        'object-detector': 'client',      // Can be heavy
        'content-analyzer': 'client',     // Good on client
        'auto-editor': 'client',          // Good on client
        'scene-classifier': 'client',     // Good on client
        'transition-suggester': 'client', // Good on client
        'noise-reducer': 'client'         // Can be heavy
      }
    }
  } as ExplicitConfig,

  // Cloud-heavy approach (for when you have cloud setup)
  CLOUD_HEAVY: {
    storage: {
      timelineEdits: 'localStorage',      // Keep fast
      sceneMetadata: 'localStorage',      // Keep fast
      aiResults: {
        'subtitle-generator': 'localStorage',  // Keep local
        'video-enhancer': 'cloud',            // Heavy results to cloud
        'audio-processor': 'localStorage',     // Keep local
        'color-grader': 'cloud',              // Heavy results to cloud
        'object-detector': 'cloud',           // Heavy results to cloud
        'content-analyzer': 'localStorage',    // Keep local
        'auto-editor': 'localStorage',        // Keep local
        'scene-classifier': 'localStorage',    // Keep local
        'transition-suggester': 'localStorage', // Keep local
        'noise-reducer': 'cloud'              // Heavy results to cloud
      },
      videoBlobs: {
        original: 'cloud',        // Store originals in cloud
        processed: 'indexedDB',   // Cache processed locally
        aiGenerated: 'cloud'      // Store generated in cloud
      },
      processing: {
        'subtitle-generator': 'client',    // Fast on client
        'video-enhancer': 'cloud',        // Heavy processing in cloud
        'audio-processor': 'client',      // Good on client
        'color-grader': 'cloud',          // Heavy processing in cloud
        'object-detector': 'cloud',       // Heavy processing in cloud
        'content-analyzer': 'client',     // Good on client
        'auto-editor': 'client',          // Good on client
        'scene-classifier': 'client',     // Good on client
        'transition-suggester': 'client', // Good on client
        'noise-reducer': 'cloud'          // Heavy processing in cloud
      }
    }
  } as ExplicitConfig
};

// Initialization status
export interface ExplicitInitStatus {
  storageManager: boolean;
  processingManager: boolean;
  cloudStorage: boolean;
  indexedDB: boolean;
  errors: string[];
}

// Initialize explicit storage system
export async function initializeExplicitStorage(
  config: ExplicitConfig
): Promise<ExplicitInitStatus> {
  
  const status: ExplicitInitStatus = {
    storageManager: false,
    processingManager: false,
    cloudStorage: false,
    indexedDB: false,
    errors: []
  };

  console.log('🚀 Initializing Explicit Storage System...');
  console.log('📋 Your configuration:', config);

  try {
    // 1. Update storage manager with your rules
    console.log('⚙️ Configuring storage manager with your rules...');
    explicitStorageManager.updateRules(config.storage);
    
    // 2. Initialize storage manager
    await explicitStorageManager.initialize();
    status.storageManager = true;
    status.indexedDB = true; // Will be true if IndexedDB was needed and initialized
    console.log('✅ Storage manager initialized');

  } catch (error) {
    status.errors.push(`Storage Manager: ${error}`);
    console.error('❌ Storage manager initialization failed:', error);
  }

  try {
    // 3. Initialize processing manager
    console.log('🤖 Initializing processing manager...');
    // Processing manager initializes automatically
    status.processingManager = true;
    console.log('✅ Processing manager initialized');

  } catch (error) {
    status.errors.push(`Processing Manager: ${error}`);
    console.error('❌ Processing manager initialization failed:', error);
  }

  try {
    // 4. Initialize cloud storage if enabled
    if (config.cloud?.enabled) {
      console.log('☁️ Initializing cloud storage...');
      const cloudManager = initializeCloudStorage({
        projectId: config.cloud.projectId,
        bucketName: config.cloud.bucketName,
        region: 'us-central1',
        apiEndpoint: config.cloud.apiEndpoint
      });
      
      const cloudInitialized = await cloudManager.initialize();
      status.cloudStorage = cloudInitialized;
      
      if (cloudInitialized) {
        console.log('✅ Cloud storage initialized');
      } else {
        status.errors.push('Cloud Storage: Initialization failed');
        console.warn('⚠️ Cloud storage initialization failed');
      }
    } else {
      console.log('ℹ️ Cloud storage disabled in configuration');
      status.cloudStorage = true; // Not an error, just disabled
    }

  } catch (error) {
    status.errors.push(`Cloud Storage: ${error}`);
    console.error('❌ Cloud storage initialization failed:', error);
  }

  // 5. Setup debug logging if enabled
  if (config.debug?.logAllOperations) {
    console.log('🐛 Debug logging enabled');
    setupDebugLogging();
  }

  if (config.debug?.showStorageUsage) {
    console.log('📊 Storage usage monitoring enabled');
    showStorageUsage();
  }

  // 6. Final status report
  const successCount = Object.values(status).filter(v => v === true).length;
  const totalComponents = 4;
  
  if (status.errors.length === 0) {
    console.log('🎉 Explicit Storage System fully initialized!');
    console.log(`✅ All ${totalComponents} components operational`);
    console.log('📋 Your storage rules are now active');
  } else {
    console.log(`⚠️ Storage System partially initialized (${successCount}/${totalComponents} components)`);
    console.log('❌ Errors encountered:', status.errors);
  }

  return status;
}

// Quick setup functions for common scenarios
export async function quickSetupAllLocalStorage(): Promise<ExplicitInitStatus> {
  console.log('🚀 Quick Setup: All localStorage (fastest, limited space)');
  return await initializeExplicitStorage(STORAGE_CONFIGS.ALL_LOCALSTORAGE);
}

export async function quickSetupBalanced(): Promise<ExplicitInitStatus> {
  console.log('🚀 Quick Setup: Balanced approach (recommended)');
  return await initializeExplicitStorage(STORAGE_CONFIGS.BALANCED);
}

export async function quickSetupCloudHeavy(cloudConfig: {
  projectId: string;
  bucketName: string;
  apiEndpoint: string;
}): Promise<ExplicitInitStatus> {
  console.log('🚀 Quick Setup: Cloud-heavy approach');
  const config = {
    ...STORAGE_CONFIGS.CLOUD_HEAVY,
    cloud: {
      enabled: true,
      ...cloudConfig
    }
  };
  return await initializeExplicitStorage(config);
}

// Debug logging setup
function setupDebugLogging(): void {
  // Override console methods to add storage operation logging
  const originalLog = console.log;
  console.log = (...args) => {
    if (args[0]?.includes('💾') || args[0]?.includes('📂') || args[0]?.includes('☁️')) {
      originalLog('🐛 [STORAGE DEBUG]', ...args);
    } else {
      originalLog(...args);
    }
  };
}

// Show storage usage
async function showStorageUsage(): Promise<void> {
  const usage = await explicitStorageManager.getStorageUsage();
  console.log('📊 Storage Usage:', {
    localStorage: `${Math.round(usage.localStorage.used / 1024)}KB (${usage.localStorage.keys} keys)`,
    indexedDB: `${usage.indexedDB.stores.length} stores: ${usage.indexedDB.stores.join(', ')}`
  });
  
  // Show usage every 30 seconds
  setInterval(async () => {
    const currentUsage = await explicitStorageManager.getStorageUsage();
    console.log('📊 Storage Usage Update:', {
      localStorage: `${Math.round(currentUsage.localStorage.used / 1024)}KB`,
      indexedDB: `${currentUsage.indexedDB.stores.length} stores`
    });
  }, 30000);
}

// Export managers for direct use
export {
  explicitStorageManager as storage,
  explicitProcessingManager as processing
};
