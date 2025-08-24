// src/services/explicitStorageManager.ts
// Explicit Storage Manager - You define exactly where everything goes

import type { 
  OptimizedSceneData, 
  EnhancedSceneData, 
  AIProcessingResult,
  AIAgentType 
} from '../types';

// Explicit Storage Configuration - You define the rules
export interface ExplicitStorageRules {
  // Timeline data storage
  timelineEdits: 'localStorage' | 'indexedDB';
  
  // Scene metadata storage
  sceneMetadata: 'localStorage' | 'indexedDB';
  
  // AI processing results storage
  aiResults: {
    'subtitle-generator': 'localStorage' | 'indexedDB' | 'cloud';
    'video-enhancer': 'localStorage' | 'indexedDB' | 'cloud';
    'audio-processor': 'localStorage' | 'indexedDB' | 'cloud';
    'color-grader': 'localStorage' | 'indexedDB' | 'cloud';
    'object-detector': 'localStorage' | 'indexedDB' | 'cloud';
    'content-analyzer': 'localStorage' | 'indexedDB' | 'cloud';
    'auto-editor': 'localStorage' | 'indexedDB' | 'cloud';
    'scene-classifier': 'localStorage' | 'indexedDB' | 'cloud';
    'transition-suggester': 'localStorage' | 'indexedDB' | 'cloud';
    'noise-reducer': 'localStorage' | 'indexedDB' | 'cloud';
  };
  
  // Video blob storage
  videoBlobs: {
    original: 'indexedDB' | 'cloud';
    processed: 'indexedDB' | 'cloud';
    aiGenerated: 'indexedDB' | 'cloud';
  };
  
  // Processing strategy
  processing: {
    'subtitle-generator': 'client' | 'cloud';
    'video-enhancer': 'client' | 'cloud';
    'audio-processor': 'client' | 'cloud';
    'color-grader': 'client' | 'cloud';
    'object-detector': 'client' | 'cloud';
    'content-analyzer': 'client' | 'cloud';
    'auto-editor': 'client' | 'cloud';
    'scene-classifier': 'client' | 'cloud';
    'transition-suggester': 'client' | 'cloud';
    'noise-reducer': 'client' | 'cloud';
  };
}

// Default rules - you can override these
export const DEFAULT_STORAGE_RULES: ExplicitStorageRules = {
  timelineEdits: 'localStorage',
  sceneMetadata: 'localStorage',
  aiResults: {
    'subtitle-generator': 'localStorage',
    'video-enhancer': 'indexedDB',
    'audio-processor': 'localStorage',
    'color-grader': 'indexedDB',
    'object-detector': 'indexedDB',
    'content-analyzer': 'localStorage',
    'auto-editor': 'localStorage',
    'scene-classifier': 'localStorage',
    'transition-suggester': 'localStorage',
    'noise-reducer': 'indexedDB'
  },
  videoBlobs: {
    original: 'indexedDB',
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
};

// Explicit Storage Manager
export class ExplicitStorageManager {
  private rules: ExplicitStorageRules;
  private indexedDBName = 'StoryboardExplicitStorage';
  private indexedDBVersion = 1;

  constructor(rules: Partial<ExplicitStorageRules> = {}) {
    this.rules = { ...DEFAULT_STORAGE_RULES, ...rules };
    console.log('📋 Explicit Storage Manager initialized with rules:', this.rules);
  }

  // Initialize IndexedDB if needed
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Explicit Storage Manager...');
    
    // Check if any rules require IndexedDB
    const needsIndexedDB = this.checkIfIndexedDBNeeded();
    
    if (needsIndexedDB) {
      await this.initializeIndexedDB();
    }
    
    console.log('✅ Explicit Storage Manager ready');
  }

  // Check if IndexedDB is needed based on rules
  private checkIfIndexedDBNeeded(): boolean {
    return (
      this.rules.timelineEdits === 'indexedDB' ||
      this.rules.sceneMetadata === 'indexedDB' ||
      Object.values(this.rules.aiResults).includes('indexedDB') ||
      Object.values(this.rules.videoBlobs).includes('indexedDB')
    );
  }

  // Initialize IndexedDB with required stores
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.indexedDBName, this.indexedDBVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('✅ IndexedDB initialized');
        resolve();
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Create stores based on rules
        if (!db.objectStoreNames.contains('timeline-edits')) {
          db.createObjectStore('timeline-edits', { keyPath: 'sceneId' });
        }
        if (!db.objectStoreNames.contains('scene-metadata')) {
          db.createObjectStore('scene-metadata', { keyPath: 'sceneId' });
        }
        if (!db.objectStoreNames.contains('ai-results')) {
          db.createObjectStore('ai-results', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('video-blobs')) {
          db.createObjectStore('video-blobs', { keyPath: 'id' });
        }
        
        console.log('🗄️ IndexedDB stores created');
      };
    });
  }

  // Save timeline edits according to rules
  async saveTimelineEdits(sceneId: string, timelineData: any): Promise<void> {
    const storageMethod = this.rules.timelineEdits;
    const key = `timeline-${sceneId}`;
    
    if (storageMethod === 'localStorage') {
      localStorage.setItem(key, JSON.stringify(timelineData));
      console.log(`💾 Timeline edits saved to localStorage: ${key}`);
    } else {
      await this.saveToIndexedDB('timeline-edits', { sceneId, ...timelineData });
      console.log(`💾 Timeline edits saved to IndexedDB: ${sceneId}`);
    }
  }

  // Load timeline edits according to rules
  async loadTimelineEdits(sceneId: string): Promise<any | null> {
    const storageMethod = this.rules.timelineEdits;
    const key = `timeline-${sceneId}`;
    
    if (storageMethod === 'localStorage') {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } else {
      return await this.loadFromIndexedDB('timeline-edits', sceneId);
    }
  }

  // Save scene metadata according to rules
  async saveSceneMetadata(sceneData: OptimizedSceneData): Promise<void> {
    const storageMethod = this.rules.sceneMetadata;
    const key = `scene-${sceneData.sceneId}`;
    
    if (storageMethod === 'localStorage') {
      localStorage.setItem(key, JSON.stringify(sceneData));
      console.log(`💾 Scene metadata saved to localStorage: ${key}`);
    } else {
      await this.saveToIndexedDB('scene-metadata', sceneData);
      console.log(`💾 Scene metadata saved to IndexedDB: ${sceneData.sceneId}`);
    }
  }

  // Load scene metadata according to rules
  async loadSceneMetadata(sceneId: string): Promise<OptimizedSceneData | null> {
    const storageMethod = this.rules.sceneMetadata;
    const key = `scene-${sceneId}`;
    
    if (storageMethod === 'localStorage') {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } else {
      return await this.loadFromIndexedDB('scene-metadata', sceneId);
    }
  }

  // Save AI processing result according to rules
  async saveAIResult(
    sceneId: string, 
    agentType: AIAgentType, 
    result: AIProcessingResult
  ): Promise<void> {
    const storageMethod = this.rules.aiResults[agentType];
    const key = `ai-${sceneId}-${agentType}`;
    
    if (storageMethod === 'localStorage') {
      localStorage.setItem(key, JSON.stringify(result));
      console.log(`💾 AI result saved to localStorage: ${key}`);
    } else if (storageMethod === 'indexedDB') {
      await this.saveToIndexedDB('ai-results', { id: key, ...result });
      console.log(`💾 AI result saved to IndexedDB: ${key}`);
    } else {
      // Cloud storage - would implement cloud save here
      console.log(`☁️ AI result would be saved to cloud: ${key}`);
    }
  }

  // Load AI processing result according to rules
  async loadAIResult(sceneId: string, agentType: AIAgentType): Promise<AIProcessingResult | null> {
    const storageMethod = this.rules.aiResults[agentType];
    const key = `ai-${sceneId}-${agentType}`;
    
    if (storageMethod === 'localStorage') {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } else if (storageMethod === 'indexedDB') {
      return await this.loadFromIndexedDB('ai-results', key);
    } else {
      // Cloud storage - would implement cloud load here
      console.log(`☁️ AI result would be loaded from cloud: ${key}`);
      return null;
    }
  }

  // Save video blob according to rules
  async saveVideoBlob(
    sceneId: string, 
    blobType: 'original' | 'processed' | 'aiGenerated',
    blob: Blob
  ): Promise<void> {
    const storageMethod = this.rules.videoBlobs[blobType];
    const key = `video-${sceneId}-${blobType}`;
    
    if (storageMethod === 'indexedDB') {
      await this.saveToIndexedDB('video-blobs', { id: key, blob, timestamp: Date.now() });
      console.log(`💾 Video blob saved to IndexedDB: ${key} (${Math.round(blob.size / 1024)}KB)`);
    } else {
      // Cloud storage - would implement cloud save here
      console.log(`☁️ Video blob would be saved to cloud: ${key} (${Math.round(blob.size / 1024)}KB)`);
    }
  }

  // Load video blob according to rules
  async loadVideoBlob(
    sceneId: string, 
    blobType: 'original' | 'processed' | 'aiGenerated'
  ): Promise<Blob | null> {
    const storageMethod = this.rules.videoBlobs[blobType];
    const key = `video-${sceneId}-${blobType}`;
    
    if (storageMethod === 'indexedDB') {
      const data = await this.loadFromIndexedDB('video-blobs', key);
      return data ? data.blob : null;
    } else {
      // Cloud storage - would implement cloud load here
      console.log(`☁️ Video blob would be loaded from cloud: ${key}`);
      return null;
    }
  }

  // Get processing strategy for agent
  getProcessingStrategy(agentType: AIAgentType): 'client' | 'cloud' {
    return this.rules.processing[agentType];
  }

  // Update storage rules
  updateRules(newRules: Partial<ExplicitStorageRules>): void {
    this.rules = { ...this.rules, ...newRules };
    console.log('📋 Storage rules updated:', newRules);
  }

  // Get current rules
  getRules(): ExplicitStorageRules {
    return { ...this.rules };
  }

  // Generic IndexedDB save
  private async saveToIndexedDB(storeName: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.indexedDBName, this.indexedDBVersion);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const putRequest = store.put(data);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Generic IndexedDB load
  private async loadFromIndexedDB(storeName: string, key: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.indexedDBName, this.indexedDBVersion);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        const getRequest = store.get(key);
        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => reject(getRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Get storage usage statistics
  async getStorageUsage(): Promise<{
    localStorage: { used: number; keys: number };
    indexedDB: { used: number; stores: string[] };
  }> {
    // Calculate localStorage usage
    let localStorageUsed = 0;
    let localStorageKeys = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          localStorageUsed += key.length + value.length;
          localStorageKeys++;
        }
      }
    }

    // Get IndexedDB info
    const indexedDBStores: string[] = [];
    if (this.checkIfIndexedDBNeeded()) {
      indexedDBStores.push('timeline-edits', 'scene-metadata', 'ai-results', 'video-blobs');
    }

    return {
      localStorage: {
        used: localStorageUsed,
        keys: localStorageKeys
      },
      indexedDB: {
        used: 0, // Would need to calculate actual usage
        stores: indexedDBStores
      }
    };
  }
}

// Singleton instance
export const explicitStorageManager = new ExplicitStorageManager();
