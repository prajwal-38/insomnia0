// src/services/explicitProcessingManager.ts
// Explicit Processing Manager - You define exactly which agents use client vs cloud

import type { 
  OptimizedSceneData, 
  AIAgentType, 
  AIProcessingResult 
} from '../types';
import { explicitStorageManager } from './explicitStorageManager';
import { aiProcessingManager } from './aiProcessingManager';
import { cloudStorageManager } from './cloudStorageManager';

// Processing Job Status
export interface ProcessingJob {
  jobId: string;
  sceneId: string;
  agentType: AIAgentType;
  strategy: 'client' | 'cloud';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: number;
  completedAt?: number;
  result?: AIProcessingResult;
  error?: string;
}

// Explicit Processing Manager
export class ExplicitProcessingManager {
  private activeJobs: Map<string, ProcessingJob> = new Map();
  private jobCounter = 0;

  constructor() {
    console.log('🤖 Explicit Processing Manager initialized');
  }

  // Process scene with explicit strategy (no automatic decisions)
  async processScene(
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    strategy: 'client' | 'cloud', // You must specify
    onProgress?: (progress: number) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<AIProcessingResult> {
    
    const jobId = `job_${++this.jobCounter}_${Date.now()}`;
    
    console.log(`🚀 Starting ${strategy} processing for ${agentType} on scene ${sceneData.sceneId}`);
    
    // Create job tracking
    const job: ProcessingJob = {
      jobId,
      sceneId: sceneData.sceneId,
      agentType,
      strategy,
      status: 'processing',
      progress: 0,
      startedAt: Date.now()
    };
    
    this.activeJobs.set(jobId, job);

    try {
      let result: AIProcessingResult;
      
      if (strategy === 'client') {
        onStatusUpdate?.(`Processing ${agentType} on client...`);
        result = await this.processOnClient(jobId, agentType, sceneData, onProgress);
      } else {
        onStatusUpdate?.(`Processing ${agentType} in cloud...`);
        result = await this.processInCloud(jobId, agentType, sceneData, onProgress);
      }

      // Update job status
      job.status = 'completed';
      job.progress = 100;
      job.result = result;
      job.completedAt = Date.now();
      
      // Save result according to storage rules
      await explicitStorageManager.saveAIResult(sceneData.sceneId, agentType, result);
      
      onStatusUpdate?.(`${agentType} processing completed successfully`);
      console.log(`✅ ${strategy} processing completed for ${agentType}`);
      
      return result;
      
    } catch (error) {
      // Update job status
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = Date.now();
      
      onStatusUpdate?.(`${agentType} processing failed: ${job.error}`);
      console.error(`❌ ${strategy} processing failed for ${agentType}:`, error);
      
      throw error;
      
    } finally {
      // Cleanup job after delay
      setTimeout(() => {
        this.activeJobs.delete(jobId);
      }, 60000); // Keep job info for 1 minute
    }
  }

  // Process on client using existing AI processing manager
  private async processOnClient(
    jobId: string,
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    
    // Convert OptimizedSceneData to NodeVideoSceneData format for compatibility
    const nodeVideoSceneData = {
      sceneId: sceneData.sceneId,
      startTime: sceneData.currentStart,
      endTime: sceneData.currentEnd,
      duration: sceneData.currentDuration,
      videoFileName: sceneData.originalVideoFileName,
      // Add other required fields as needed
    };

    return await aiProcessingManager.processScene(
      jobId,
      agentType,
      nodeVideoSceneData as any, // Type assertion for compatibility
      onProgress
    );
  }

  // Process in cloud using cloud storage manager
  private async processInCloud(
    jobId: string,
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    
    if (!cloudStorageManager) {
      throw new Error('Cloud storage manager not initialized. Cannot process in cloud.');
    }

    // For now, this is a placeholder implementation
    // In a real implementation, you would:
    // 1. Upload scene video to cloud if needed
    // 2. Start cloud processing job
    // 3. Poll for completion
    // 4. Download and cache result
    
    onProgress?.(10);
    
    // Simulate cloud processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    onProgress?.(50);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    onProgress?.(90);
    
    // Create mock result
    const result: AIProcessingResult = {
      agentId: jobId,
      agentType,
      sourceSceneId: sceneData.sceneId,
      result: {
        type: `cloud-${agentType}`,
        message: `Cloud processing completed for ${agentType}`,
        timestamp: Date.now(),
        cloudProcessed: true
      },
      metadata: {
        processedAt: Date.now(),
        processingTime: 4000,
        model: 'cloud-model-v1'
      }
    };
    
    onProgress?.(100);
    return result;
  }

  // Process scene using storage rules (convenience method)
  async processSceneWithStorageRules(
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    onProgress?: (progress: number) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<AIProcessingResult> {
    
    // Get processing strategy from storage rules
    const strategy = explicitStorageManager.getProcessingStrategy(agentType);
    
    console.log(`📋 Using storage rule: ${agentType} → ${strategy} processing`);
    
    return await this.processScene(
      agentType,
      sceneData,
      strategy,
      onProgress,
      onStatusUpdate
    );
  }

  // Batch process multiple scenes
  async batchProcessScenes(
    agentType: AIAgentType,
    sceneDataList: OptimizedSceneData[],
    strategy: 'client' | 'cloud',
    onProgress?: (overallProgress: number, currentScene: string) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<AIProcessingResult[]> {
    
    const results: AIProcessingResult[] = [];
    const total = sceneDataList.length;
    
    onStatusUpdate?.(`Starting batch processing of ${total} scenes with ${strategy}`);
    
    for (let i = 0; i < sceneDataList.length; i++) {
      const sceneData = sceneDataList[i];
      
      onStatusUpdate?.(`Processing scene ${i + 1}/${total}: ${sceneData.sceneId}`);
      
      try {
        const result = await this.processScene(
          agentType,
          sceneData,
          strategy,
          (sceneProgress) => {
            const overallProgress = ((i / total) * 100) + ((sceneProgress / 100) * (100 / total));
            onProgress?.(overallProgress, sceneData.sceneId);
          }
        );
        
        results.push(result);
        
      } catch (error) {
        console.error(`Failed to process scene ${sceneData.sceneId}:`, error);
        // Continue with other scenes
      }
    }
    
    onStatusUpdate?.(`Batch processing completed: ${results.length}/${total} scenes processed`);
    return results;
  }

  // Get active jobs
  getActiveJobs(): ProcessingJob[] {
    return Array.from(this.activeJobs.values());
  }

  // Get job by ID
  getJob(jobId: string): ProcessingJob | undefined {
    return this.activeJobs.get(jobId);
  }

  // Cancel job (if possible)
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return false; // Already finished
    }

    // For client processing, we can't easily cancel
    // For cloud processing, we could call cloud cancel API
    if (job.strategy === 'cloud' && cloudStorageManager) {
      // Would implement cloud job cancellation here
      console.log(`Attempting to cancel cloud job: ${jobId}`);
    }

    // Mark as failed
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = Date.now();

    console.log(`❌ Job cancelled: ${jobId}`);
    return true;
  }

  // Get processing statistics
  getProcessingStats(): {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    activeJobs: number;
    clientJobs: number;
    cloudJobs: number;
  } {
    const jobs = Array.from(this.activeJobs.values());
    
    return {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      activeJobs: jobs.filter(j => j.status === 'processing' || j.status === 'queued').length,
      clientJobs: jobs.filter(j => j.strategy === 'client').length,
      cloudJobs: jobs.filter(j => j.strategy === 'cloud').length
    };
  }

  // Clear completed jobs
  clearCompletedJobs(): void {
    const completedJobs = Array.from(this.activeJobs.entries())
      .filter(([_, job]) => job.status === 'completed' || job.status === 'failed');
    
    completedJobs.forEach(([jobId, _]) => {
      this.activeJobs.delete(jobId);
    });
    
    console.log(`🧹 Cleared ${completedJobs.length} completed jobs`);
  }
}

// Singleton instance
export const explicitProcessingManager = new ExplicitProcessingManager();
