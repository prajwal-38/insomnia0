// src/services/hybridProcessingEngine.ts
// Intelligent processing engine that decides between client and cloud processing

import type { 
  OptimizedSceneData, 
  AIAgentType, 
  AIProcessingResult,
  AIProcessingStatus 
} from '../types';
import { storageOrchestrator } from './storageOrchestrator';
import { cloudStorageManager } from './cloudStorageManager';
import { aiProcessingManager } from './aiProcessingManager';

// Processing Capability Assessment
export interface ProcessingCapabilities {
  // Client capabilities
  clientCpuCores: number;
  clientMemoryGB: number;
  clientGpuAvailable: boolean;
  clientBandwidth: 'slow' | 'medium' | 'fast';
  
  // Network status
  isOnline: boolean;
  connectionQuality: 'poor' | 'good' | 'excellent';
  
  // Current load
  activeClientJobs: number;
  activeCloudJobs: number;
  
  // User preferences
  preferredStrategy: 'speed' | 'quality' | 'cost';
  cloudProcessingEnabled: boolean;
}

// Processing Decision
export interface ProcessingDecision {
  strategy: 'client' | 'cloud' | 'hybrid';
  reasoning: string[];
  estimatedTime: number; // seconds
  estimatedCost: number; // arbitrary units
  confidence: number; // 0-1
}

// Processing Job
export interface ProcessingJob {
  jobId: string;
  sceneId: string;
  agentType: AIAgentType;
  strategy: 'client' | 'cloud' | 'hybrid';
  status: AIProcessingStatus;
  progress: number;
  startedAt: number;
  estimatedCompletion?: number;
  result?: AIProcessingResult;
  error?: string;
}

// Hybrid Processing Engine
export class HybridProcessingEngine {
  private capabilities: ProcessingCapabilities;
  private activeJobs: Map<string, ProcessingJob> = new Map();
  private jobCounter = 0;
  private performanceHistory: Map<AIAgentType, {
    clientAvgTime: number;
    cloudAvgTime: number;
    clientSuccessRate: number;
    cloudSuccessRate: number;
  }> = new Map();

  constructor() {
    this.capabilities = this.assessCapabilities();
    this.startCapabilityMonitoring();
  }

  // Assess current system capabilities
  private assessCapabilities(): ProcessingCapabilities {
    return {
      clientCpuCores: navigator.hardwareConcurrency || 4,
      clientMemoryGB: (navigator as any).deviceMemory || 4,
      clientGpuAvailable: this.detectGPU(),
      clientBandwidth: this.assessBandwidth(),
      isOnline: navigator.onLine,
      connectionQuality: this.assessConnectionQuality(),
      activeClientJobs: 0,
      activeCloudJobs: 0,
      preferredStrategy: 'speed',
      cloudProcessingEnabled: !!cloudStorageManager
    };
  }

  // Detect GPU availability
  private detectGPU(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch {
      return false;
    }
  }

  // Assess network bandwidth (simplified)
  private assessBandwidth(): 'slow' | 'medium' | 'fast' {
    const connection = (navigator as any).connection;
    if (!connection) return 'medium';
    
    const effectiveType = connection.effectiveType;
    if (effectiveType === '4g') return 'fast';
    if (effectiveType === '3g') return 'medium';
    return 'slow';
  }

  // Assess connection quality
  private assessConnectionQuality(): 'poor' | 'good' | 'excellent' {
    const connection = (navigator as any).connection;
    if (!connection) return 'good';
    
    const rtt = connection.rtt || 100;
    if (rtt < 50) return 'excellent';
    if (rtt < 150) return 'good';
    return 'poor';
  }

  // Start monitoring system capabilities
  private startCapabilityMonitoring(): void {
    // Update online status
    window.addEventListener('online', () => {
      this.capabilities.isOnline = true;
    });
    
    window.addEventListener('offline', () => {
      this.capabilities.isOnline = false;
    });

    // Periodic capability assessment
    setInterval(() => {
      this.capabilities.connectionQuality = this.assessConnectionQuality();
      this.capabilities.clientBandwidth = this.assessBandwidth();
    }, 30000); // Every 30 seconds
  }

  // Make intelligent processing decision
  async makeProcessingDecision(
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    userPreference?: 'client' | 'cloud' | 'auto'
  ): Promise<ProcessingDecision> {
    
    const reasoning: string[] = [];
    let strategy: 'client' | 'cloud' | 'hybrid' = 'client';
    let estimatedTime = 30; // Default 30 seconds
    let estimatedCost = 1; // Arbitrary units
    let confidence = 0.7;

    // User preference override
    if (userPreference && userPreference !== 'auto') {
      strategy = userPreference;
      reasoning.push(`User explicitly chose ${userPreference} processing`);
      confidence = 0.9;
    } else {
      // Intelligent decision making
      const decision = await this.analyzeProcessingRequirements(agentType, sceneData);
      strategy = decision.strategy;
      reasoning.push(...decision.reasoning);
      estimatedTime = decision.estimatedTime;
      estimatedCost = decision.estimatedCost;
      confidence = decision.confidence;
    }

    return {
      strategy,
      reasoning,
      estimatedTime,
      estimatedCost,
      confidence
    };
  }

  // Analyze processing requirements
  private async analyzeProcessingRequirements(
    agentType: AIAgentType,
    sceneData: OptimizedSceneData
  ): Promise<ProcessingDecision> {
    
    const reasoning: string[] = [];
    let strategy: 'client' | 'cloud' | 'hybrid' = 'client';
    let estimatedTime = 30;
    let estimatedCost = 1;
    let confidence = 0.7;

    // Scene complexity analysis
    const sceneDuration = sceneData.currentDuration;
    const isLongScene = sceneDuration > 60; // 1 minute
    const isComplexAgent = this.isComplexAgent(agentType);

    // Network considerations
    if (!this.capabilities.isOnline) {
      strategy = 'client';
      reasoning.push('Offline - must use client processing');
      confidence = 0.9;
    } else if (!this.capabilities.cloudProcessingEnabled) {
      strategy = 'client';
      reasoning.push('Cloud processing not configured');
      confidence = 0.9;
    } else {
      // Decision matrix
      if (isComplexAgent && isLongScene) {
        strategy = 'cloud';
        reasoning.push('Complex agent + long scene = cloud processing recommended');
        estimatedTime = 120; // 2 minutes
        estimatedCost = 5;
      } else if (isComplexAgent && !isLongScene) {
        if (this.capabilities.clientGpuAvailable && this.capabilities.clientCpuCores >= 4) {
          strategy = 'client';
          reasoning.push('Complex agent but short scene + good client hardware = client processing');
          estimatedTime = 45;
        } else {
          strategy = 'cloud';
          reasoning.push('Complex agent + limited client hardware = cloud processing');
          estimatedTime = 90;
          estimatedCost = 3;
        }
      } else if (!isComplexAgent && isLongScene) {
        if (this.capabilities.connectionQuality === 'excellent') {
          strategy = 'cloud';
          reasoning.push('Simple agent but long scene + excellent connection = cloud processing');
          estimatedTime = 60;
          estimatedCost = 2;
        } else {
          strategy = 'client';
          reasoning.push('Simple agent + poor connection = client processing despite long scene');
          estimatedTime = 90;
        }
      } else {
        // Simple agent + short scene
        strategy = 'client';
        reasoning.push('Simple agent + short scene = client processing optimal');
        estimatedTime = 20;
      }
    }

    // Load balancing considerations
    if (strategy === 'client' && this.capabilities.activeClientJobs > 2) {
      if (this.capabilities.cloudProcessingEnabled && this.capabilities.activeCloudJobs < 3) {
        strategy = 'cloud';
        reasoning.push('Client overloaded, switching to cloud');
        estimatedCost += 1;
      }
    }

    // Historical performance adjustment
    const history = this.performanceHistory.get(agentType);
    if (history) {
      if (strategy === 'client' && history.clientSuccessRate < 0.8) {
        strategy = 'cloud';
        reasoning.push('Client has poor success rate for this agent type');
        confidence *= 0.9;
      } else if (strategy === 'cloud' && history.cloudSuccessRate < 0.8) {
        strategy = 'client';
        reasoning.push('Cloud has poor success rate for this agent type');
        confidence *= 0.9;
      }
    }

    return {
      strategy,
      reasoning,
      estimatedTime,
      estimatedCost,
      confidence
    };
  }

  // Check if agent type is computationally complex
  private isComplexAgent(agentType: AIAgentType): boolean {
    const complexAgents: AIAgentType[] = [
      'video-enhancer',
      'color-grader',
      'object-detector',
      'noise-reducer'
    ];
    return complexAgents.includes(agentType);
  }

  // Process scene with intelligent routing
  async processScene(
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    userPreference?: 'client' | 'cloud' | 'auto',
    onProgress?: (progress: number) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<AIProcessingResult> {
    
    const jobId = `job_${++this.jobCounter}_${Date.now()}`;
    
    // Make processing decision
    onStatusUpdate?.('Analyzing processing requirements...');
    const decision = await this.makeProcessingDecision(agentType, sceneData, userPreference);
    
    console.log(`🤖 Processing decision for ${agentType}:`, decision);
    
    // Create job tracking
    const job: ProcessingJob = {
      jobId,
      sceneId: sceneData.sceneId,
      agentType,
      strategy: decision.strategy,
      status: 'processing',
      progress: 0,
      startedAt: Date.now(),
      estimatedCompletion: Date.now() + (decision.estimatedTime * 1000)
    };
    
    this.activeJobs.set(jobId, job);
    this.updateActiveJobCounts();

    try {
      let result: AIProcessingResult;
      
      if (decision.strategy === 'cloud') {
        onStatusUpdate?.('Processing in cloud...');
        result = await this.processInCloud(jobId, agentType, sceneData, onProgress);
      } else {
        onStatusUpdate?.('Processing on client...');
        result = await this.processOnClient(jobId, agentType, sceneData, onProgress);
      }

      // Update job status
      job.status = 'completed';
      job.progress = 100;
      job.result = result;
      
      // Update performance history
      this.updatePerformanceHistory(agentType, decision.strategy, true, Date.now() - job.startedAt);
      
      onStatusUpdate?.('Processing completed successfully');
      return result;
      
    } catch (error) {
      // Update job status
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Update performance history
      this.updatePerformanceHistory(agentType, decision.strategy, false, Date.now() - job.startedAt);
      
      onStatusUpdate?.(`Processing failed: ${job.error}`);
      throw error;
      
    } finally {
      // Cleanup job after delay
      setTimeout(() => {
        this.activeJobs.delete(jobId);
        this.updateActiveJobCounts();
      }, 60000); // Keep job info for 1 minute
    }
  }

  // Process on client
  private async processOnClient(
    jobId: string,
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    
    // Use existing AI processing manager
    return await aiProcessingManager.processScene(
      jobId,
      agentType,
      sceneData,
      onProgress
    );
  }

  // Process in cloud
  private async processInCloud(
    jobId: string,
    agentType: AIAgentType,
    sceneData: OptimizedSceneData,
    onProgress?: (progress: number) => void
  ): Promise<AIProcessingResult> {
    
    if (!cloudStorageManager) {
      throw new Error('Cloud storage manager not initialized');
    }

    // Implementation would involve:
    // 1. Upload scene video to cloud if needed
    // 2. Start cloud processing job
    // 3. Poll for completion
    // 4. Download and cache result
    
    // Placeholder implementation
    throw new Error('Cloud processing not yet implemented');
  }

  // Update performance history
  private updatePerformanceHistory(
    agentType: AIAgentType,
    strategy: 'client' | 'cloud',
    success: boolean,
    processingTime: number
  ): void {
    
    const history = this.performanceHistory.get(agentType) || {
      clientAvgTime: 30000,
      cloudAvgTime: 60000,
      clientSuccessRate: 0.9,
      cloudSuccessRate: 0.9
    };

    if (strategy === 'client') {
      history.clientAvgTime = (history.clientAvgTime + processingTime) / 2;
      history.clientSuccessRate = (history.clientSuccessRate * 0.9) + (success ? 0.1 : 0);
    } else {
      history.cloudAvgTime = (history.cloudAvgTime + processingTime) / 2;
      history.cloudSuccessRate = (history.cloudSuccessRate * 0.9) + (success ? 0.1 : 0);
    }

    this.performanceHistory.set(agentType, history);
  }

  // Update active job counts
  private updateActiveJobCounts(): void {
    let clientJobs = 0;
    let cloudJobs = 0;
    
    for (const job of this.activeJobs.values()) {
      if (job.status === 'processing') {
        if (job.strategy === 'client') clientJobs++;
        else cloudJobs++;
      }
    }
    
    this.capabilities.activeClientJobs = clientJobs;
    this.capabilities.activeCloudJobs = cloudJobs;
  }

  // Get current capabilities
  getCapabilities(): ProcessingCapabilities {
    return { ...this.capabilities };
  }

  // Get active jobs
  getActiveJobs(): ProcessingJob[] {
    return Array.from(this.activeJobs.values());
  }

  // Get performance history
  getPerformanceHistory(): Map<AIAgentType, any> {
    return new Map(this.performanceHistory);
  }
}

// Singleton instance
export const hybridProcessingEngine = new HybridProcessingEngine();
