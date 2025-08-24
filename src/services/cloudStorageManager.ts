// src/services/cloudStorageManager.ts
// Google Cloud Storage integration for video processing and AI agents

import type { OptimizedSceneData, AIProcessingResult } from '../types';

// Cloud Storage Configuration
export interface CloudStorageConfig {
  projectId: string;
  bucketName: string;
  region: string;
  apiEndpoint: string;
  apiKey?: string;
}

// Upload Progress Callback
export type UploadProgressCallback = (progress: number) => void;

// Cloud Processing Job
export interface CloudProcessingJob {
  jobId: string;
  sceneId: string;
  agentType: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: number;
  completedAt?: number;
  resultUrl?: string;
  error?: string;
}

// Cloud Storage Manager
export class CloudStorageManager {
  private config: CloudStorageConfig;
  private activeJobs: Map<string, CloudProcessingJob> = new Map();
  private uploadQueue: Map<string, Promise<string>> = new Map();

  constructor(config: CloudStorageConfig) {
    this.config = {
      ...config,
      // Ensure API endpoint is properly configured for deployment
      apiEndpoint: config.apiEndpoint || (typeof window !== 'undefined' ? window.location.origin : '')
    };
  }

  // Initialize cloud storage connection
  async initialize(): Promise<boolean> {
    try {
      console.log('☁️ Initializing Cloud Storage Manager...');
      
      // Test connection to backend
      const healthCheck = await fetch(`${this.config.apiEndpoint}/health`);
      if (!healthCheck.ok) {
        throw new Error('Backend health check failed');
      }

      console.log('✅ Cloud Storage Manager initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Cloud Storage Manager:', error);
      return false;
    }
  }

  // Get signed URL for direct client upload to GCS
  async getSignedUploadUrl(
    fileName: string, 
    contentType: string,
    folder: 'original-uploads' | 'processed-clips' | 'ai-generated' = 'original-uploads'
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    
    const response = await fetch(`${this.config.apiEndpoint}/storage/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName,
        contentType,
        folder,
        bucketName: this.config.bucketName
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      uploadUrl: data.signedUrl,
      fileUrl: data.fileUrl
    };
  }

  // Upload file directly to GCS using signed URL
  async uploadFile(
    file: File | Blob,
    signedUrl: string,
    onProgress?: UploadProgressCallback
  ): Promise<void> {
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
  }

  // Upload scene video to cloud storage
  async uploadSceneVideo(
    sceneData: OptimizedSceneData,
    videoBlob: Blob,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    
    const uploadKey = `scene-${sceneData.sceneId}`;
    
    // Check if already uploading
    if (this.uploadQueue.has(uploadKey)) {
      return this.uploadQueue.get(uploadKey)!;
    }

    const uploadPromise = this.performSceneVideoUpload(sceneData, videoBlob, onProgress);
    this.uploadQueue.set(uploadKey, uploadPromise);

    try {
      const result = await uploadPromise;
      this.uploadQueue.delete(uploadKey);
      return result;
    } catch (error) {
      this.uploadQueue.delete(uploadKey);
      throw error;
    }
  }

  private async performSceneVideoUpload(
    sceneData: OptimizedSceneData,
    videoBlob: Blob,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    
    const fileName = `scene_${sceneData.sceneId}_${Date.now()}.mp4`;
    
    // Get signed URL for upload
    const { uploadUrl, fileUrl } = await this.getSignedUploadUrl(
      fileName, 
      'video/mp4', 
      'original-uploads'
    );

    // Upload file
    await this.uploadFile(videoBlob, uploadUrl, onProgress);

    console.log(`✅ Scene video uploaded: ${fileName}`);
    return fileUrl;
  }

  // Start cloud processing job
  async startCloudProcessing(
    sceneId: string,
    agentType: string,
    sourceVideoUrl: string,
    parameters: Record<string, any> = {}
  ): Promise<string> {
    
    const response = await fetch(`${this.config.apiEndpoint}/processing/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sceneId,
        agentType,
        sourceVideoUrl,
        parameters,
        outputBucket: this.config.bucketName,
        outputFolder: 'processed-clips'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to start cloud processing: ${response.statusText}`);
    }

    const data = await response.json();
    const jobId = data.jobId;

    // Track the job
    this.activeJobs.set(jobId, {
      jobId,
      sceneId,
      agentType,
      status: 'queued',
      progress: 0,
      startedAt: Date.now()
    });

    console.log(`🚀 Started cloud processing job: ${jobId}`);
    return jobId;
  }

  // Check job status
  async checkJobStatus(jobId: string): Promise<CloudProcessingJob | null> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/processing/status/${jobId}`);
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      const job: CloudProcessingJob = {
        jobId,
        sceneId: data.sceneId,
        agentType: data.agentType,
        status: data.status,
        progress: data.progress || 0,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        resultUrl: data.resultUrl,
        error: data.error
      };

      // Update local tracking
      this.activeJobs.set(jobId, job);

      return job;
    } catch (error) {
      console.error(`Failed to check job status for ${jobId}:`, error);
      return null;
    }
  }

  // Poll job until completion
  async waitForJobCompletion(
    jobId: string,
    onProgress?: (job: CloudProcessingJob) => void,
    timeoutMs: number = 300000 // 5 minutes default
  ): Promise<CloudProcessingJob> {
    
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          // Check timeout
          if (Date.now() - startTime > timeoutMs) {
            clearInterval(pollInterval);
            reject(new Error('Job polling timeout'));
            return;
          }

          const job = await this.checkJobStatus(jobId);
          if (!job) {
            clearInterval(pollInterval);
            reject(new Error('Job not found'));
            return;
          }

          // Notify progress
          if (onProgress) {
            onProgress(job);
          }

          // Check if completed
          if (job.status === 'completed') {
            clearInterval(pollInterval);
            resolve(job);
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(job.error || 'Job failed'));
          }
          
        } catch (error) {
          clearInterval(pollInterval);
          reject(error);
        }
      }, 2000); // Poll every 2 seconds
    });
  }

  // Download processed result and cache to IndexedDB
  async downloadAndCacheResult(
    resultUrl: string,
    sceneId: string,
    agentType: string
  ): Promise<Blob> {
    
    console.log(`📥 Downloading result for scene ${sceneId}...`);
    
    const response = await fetch(resultUrl);
    if (!response.ok) {
      throw new Error(`Failed to download result: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Cache to IndexedDB for future use
    await this.cacheToIndexedDB(`processed_${sceneId}_${agentType}`, blob);
    
    console.log(`✅ Result downloaded and cached for scene ${sceneId}`);
    return blob;
  }

  // Cache blob to IndexedDB
  private async cacheToIndexedDB(key: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StoryboardCache', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['processed-clips'], 'readwrite');
        const store = transaction.objectStore('processed-clips');
        
        const putRequest = store.put({
          key,
          blob,
          timestamp: Date.now()
        });
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('processed-clips')) {
          db.createObjectStore('processed-clips', { keyPath: 'key' });
        }
      };
    });
  }

  // Get active jobs
  getActiveJobs(): CloudProcessingJob[] {
    return Array.from(this.activeJobs.values());
  }

  // Cancel job (if supported by backend)
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/processing/cancel/${jobId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.activeJobs.delete(jobId);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  // Cleanup completed jobs
  cleanupCompletedJobs(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        if (job.completedAt && (now - job.completedAt) > maxAge) {
          this.activeJobs.delete(jobId);
        }
      }
    }
  }
}

// Singleton instance (will be configured during app initialization)
export let cloudStorageManager: CloudStorageManager | null = null;

// Initialize cloud storage manager
export function initializeCloudStorage(config: CloudStorageConfig): CloudStorageManager {
  cloudStorageManager = new CloudStorageManager(config);
  return cloudStorageManager;
}
