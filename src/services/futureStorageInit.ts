// src/services/futureStorageInit.ts
// Simple initialization utility for the future-ready storage system

import { storageIntegrationLayer } from './storageIntegrationLayer';
import { storageOrchestrator } from './storageOrchestrator';
import { initializeCloudStorage, cloudStorageManager } from './cloudStorageManager';
import { hybridProcessingEngine } from './hybridProcessingEngine';

// Configuration interface
export interface FutureStorageConfig {
  // Cloud configuration (optional)
  cloud?: {
    enabled: boolean;
    projectId: string;
    bucketName: string;
    region: string;
    apiEndpoint: string;
  };
  
  // Processing preferences
  processing?: {
    defaultStrategy: 'client' | 'cloud' | 'auto';
    clientAgents: string[];
    cloudAgents: string[];
  };
  
  // Storage preferences
  storage?: {
    localStorageMaxMB: number;
    indexedDBMaxMB: number;
    enableCompression: boolean;
    autoCleanup: boolean;
  };
  
  // Compatibility settings
  compatibility?: {
    maintainLegacyFormat: boolean;
    autoMigrate: boolean;
  };
}

// Default configuration
const DEFAULT_CONFIG: FutureStorageConfig = {
  processing: {
    defaultStrategy: 'auto',
    clientAgents: ['subtitle-generator', 'audio-processor'],
    cloudAgents: ['video-enhancer', 'color-grader', 'object-detector']
  },
  storage: {
    localStorageMaxMB: 5,
    indexedDBMaxMB: 50,
    enableCompression: true,
    autoCleanup: true
  },
  compatibility: {
    maintainLegacyFormat: true,
    autoMigrate: false
  }
};

// Initialization status
export interface InitializationStatus {
  storageOrchestrator: boolean;
  cloudStorage: boolean;
  hybridProcessing: boolean;
  integrationLayer: boolean;
  errors: string[];
}

// Main initialization function
export async function initializeFutureStorage(
  config: Partial<FutureStorageConfig> = {}
): Promise<InitializationStatus> {
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const status: InitializationStatus = {
    storageOrchestrator: false,
    cloudStorage: false,
    hybridProcessing: false,
    integrationLayer: false,
    errors: []
  };

  console.log('🚀 Initializing Future-Ready Storage System...');
  console.log('📋 Configuration:', finalConfig);

  try {
    // 1. Configure Storage Orchestrator
    console.log('⚙️ Configuring Storage Orchestrator...');
    storageOrchestrator.updateConfig({
      localStorageMaxSize: finalConfig.storage!.localStorageMaxMB * 1024 * 1024,
      indexedDBMaxSize: finalConfig.storage!.indexedDBMaxMB * 1024 * 1024,
      cloudEnabled: finalConfig.cloud?.enabled || false,
      gcsBucket: finalConfig.cloud?.bucketName || '',
      cloudRunEndpoint: finalConfig.cloud?.apiEndpoint || '',
      defaultProcessingStrategy: finalConfig.processing!.defaultStrategy,
      clientProcessingTypes: finalConfig.processing!.clientAgents as any,
      cloudProcessingTypes: finalConfig.processing!.cloudAgents as any
    });
    status.storageOrchestrator = true;
    console.log('✅ Storage Orchestrator configured');

  } catch (error) {
    status.errors.push(`Storage Orchestrator: ${error}`);
    console.error('❌ Storage Orchestrator configuration failed:', error);
  }

  try {
    // 2. Initialize Cloud Storage (if enabled)
    if (finalConfig.cloud?.enabled) {
      console.log('☁️ Initializing Cloud Storage...');
      const cloudManager = initializeCloudStorage({
        projectId: finalConfig.cloud.projectId,
        bucketName: finalConfig.cloud.bucketName,
        region: finalConfig.cloud.region,
        apiEndpoint: finalConfig.cloud.apiEndpoint
      });
      
      const cloudInitialized = await cloudManager.initialize();
      status.cloudStorage = cloudInitialized;
      
      if (cloudInitialized) {
        console.log('✅ Cloud Storage initialized');
      } else {
        status.errors.push('Cloud Storage: Initialization failed');
        console.warn('⚠️ Cloud Storage initialization failed');
      }
    } else {
      console.log('ℹ️ Cloud Storage disabled in configuration');
      status.cloudStorage = true; // Not an error, just disabled
    }

  } catch (error) {
    status.errors.push(`Cloud Storage: ${error}`);
    console.error('❌ Cloud Storage initialization failed:', error);
  }

  try {
    // 3. Initialize Hybrid Processing Engine
    console.log('🤖 Initializing Hybrid Processing Engine...');
    // The engine initializes automatically, just verify it's working
    const capabilities = hybridProcessingEngine.getCapabilities();
    status.hybridProcessing = true;
    console.log('✅ Hybrid Processing Engine initialized');
    console.log('📊 System capabilities:', {
      cpuCores: capabilities.clientCpuCores,
      memory: capabilities.clientMemoryGB + 'GB',
      gpu: capabilities.clientGpuAvailable ? 'Available' : 'Not available',
      online: capabilities.isOnline,
      cloudEnabled: capabilities.cloudProcessingEnabled
    });

  } catch (error) {
    status.errors.push(`Hybrid Processing: ${error}`);
    console.error('❌ Hybrid Processing Engine initialization failed:', error);
  }

  try {
    // 4. Initialize Integration Layer
    console.log('🔗 Initializing Storage Integration Layer...');
    storageIntegrationLayer.setCompatibilityMode(finalConfig.compatibility!.maintainLegacyFormat);
    await storageIntegrationLayer.initialize();
    status.integrationLayer = true;
    console.log('✅ Storage Integration Layer initialized');

  } catch (error) {
    status.errors.push(`Integration Layer: ${error}`);
    console.error('❌ Storage Integration Layer initialization failed:', error);
  }

  // 5. Setup automatic cleanup if enabled
  if (finalConfig.storage!.autoCleanup) {
    console.log('🧹 Setting up automatic cleanup...');
    setupAutoCleanup();
  }

  // 6. Final status report
  const successCount = Object.values(status).filter(v => v === true).length;
  const totalComponents = 4;
  
  if (status.errors.length === 0) {
    console.log('🎉 Future-Ready Storage System fully initialized!');
    console.log(`✅ All ${totalComponents} components operational`);
  } else {
    console.log(`⚠️ Storage System partially initialized (${successCount}/${totalComponents} components)`);
    console.log('❌ Errors encountered:', status.errors);
  }

  return status;
}

// Setup automatic cleanup
function setupAutoCleanup(): void {
  // Clean up old data every hour
  setInterval(async () => {
    try {
      await storageIntegrationLayer.cleanupOldData();
      console.log('🧹 Automatic cleanup completed');
    } catch (error) {
      console.warn('⚠️ Automatic cleanup failed:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  // Clean up cloud processing jobs every 6 hours
  setInterval(() => {
    try {
      if (cloudStorageManager) {
        cloudStorageManager.cleanupCompletedJobs();
        console.log('🧹 Cloud jobs cleanup completed');
      }
    } catch (error) {
      console.warn('⚠️ Cloud jobs cleanup failed:', error);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
}

// Quick setup for development
export async function quickSetupForDevelopment(): Promise<InitializationStatus> {
  return await initializeFutureStorage({
    processing: {
      defaultStrategy: 'client', // Use client processing for development
      clientAgents: ['subtitle-generator', 'audio-processor', 'video-enhancer'],
      cloudAgents: []
    },
    storage: {
      localStorageMaxMB: 10, // Increase for development
      indexedDBMaxMB: 100,
      enableCompression: false, // Disable for easier debugging
      autoCleanup: false
    },
    compatibility: {
      maintainLegacyFormat: true,
      autoMigrate: false
    }
  });
}

// Quick setup for production
export async function quickSetupForProduction(cloudConfig: {
  projectId: string;
  bucketName: string;
  apiEndpoint: string;
}): Promise<InitializationStatus> {
  return await initializeFutureStorage({
    cloud: {
      enabled: true,
      projectId: cloudConfig.projectId,
      bucketName: cloudConfig.bucketName,
      region: 'us-central1',
      apiEndpoint: cloudConfig.apiEndpoint
    },
    processing: {
      defaultStrategy: 'auto',
      clientAgents: ['subtitle-generator', 'audio-processor'],
      cloudAgents: ['video-enhancer', 'color-grader', 'object-detector']
    },
    storage: {
      localStorageMaxMB: 5,
      indexedDBMaxMB: 50,
      enableCompression: true,
      autoCleanup: true
    },
    compatibility: {
      maintainLegacyFormat: true,
      autoMigrate: true
    }
  });
}

// Get current system status
export function getSystemStatus(): {
  initialized: boolean;
  components: InitializationStatus;
  capabilities: any;
  storageUsage?: any;
} {
  const components = storageIntegrationLayer.getSystemStatus();
  const capabilities = hybridProcessingEngine.getCapabilities();
  
  return {
    initialized: Object.values(components).every(status => status === true),
    components: {
      storageOrchestrator: components.storageOrchestrator,
      cloudStorage: components.cloudStorage,
      hybridProcessing: components.hybridProcessing,
      integrationLayer: components.compatibilityMode,
      errors: []
    },
    capabilities
  };
}

// Export the main functions for easy use
export {
  storageIntegrationLayer as storage,
  hybridProcessingEngine as processing,
  cloudStorageManager as cloud
};
