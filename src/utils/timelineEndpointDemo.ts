// src/utils/timelineEndpointDemo.ts
// Demo script showing how the optimized system works for external timeline developers

import { projectDataManager } from './projectDataManager';
import type { OptimizedSceneData, OptimizedProjectData } from '../types';

/**
 * TIMELINE DEVELOPER API DEMO
 * 
 * This shows exactly how your teammate can interact with the optimized scene data
 * for building their timeline. Everything is clean, efficient, and real-time synced.
 */

export class TimelineEndpointDemo {
  
  /**
   * 🎬 GET ALL SCENES FOR TIMELINE
   * Your teammate calls this to get all scenes in the correct order
   */
  static getAllScenesForTimeline(): OptimizedSceneData[] {
    console.log('📋 Timeline Developer: Getting all scenes...');
    
    const scenes = projectDataManager.getPlaybackOrder();
    
    console.log('✅ Retrieved scenes for timeline:', {
      totalScenes: scenes.length,
      scenesData: scenes.map(scene => ({
        id: scene.sceneId,
        title: scene.title,
        order: scene.displayOrder,
        duration: scene.currentDuration,
        startTime: scene.currentStart,
        endTime: scene.currentEnd,
        hasEdits: scene.timelineEdits.clips.length > 0,
        hasAIResults: Object.keys(scene.aiResults).length > 0
      }))
    });
    
    return scenes;
  }

  /**
   * 🎯 GET SINGLE SCENE BY ID
   * Your teammate can load individual scenes efficiently
   */
  static getSceneById(sceneId: string): OptimizedSceneData | null {
    console.log(`🔍 Timeline Developer: Loading scene ${sceneId}...`);
    
    const project = projectDataManager.getCurrentProject();
    if (!project) {
      console.log('❌ No project loaded');
      return null;
    }

    const scene = project.scenes.find(s => s.sceneId === sceneId);
    
    if (scene) {
      console.log('✅ Scene loaded:', {
        id: scene.sceneId,
        title: scene.title,
        videoFile: scene.originalVideoFileName,
        currentTiming: {
          start: scene.currentStart,
          end: scene.currentEnd,
          duration: scene.currentDuration
        },
        originalTiming: {
          start: scene.originalStart,
          end: scene.originalEnd,
          duration: scene.originalDuration
        },
        timelineEdits: {
          clips: scene.timelineEdits.clips.length,
          effects: scene.timelineEdits.effects.length,
          playhead: scene.timelineEdits.playhead,
          lastModified: new Date(scene.timelineEdits.lastModified).toLocaleString()
        },
        aiResults: Object.keys(scene.aiResults).map(agentId => ({
          agentId,
          status: scene.aiResults[agentId].status,
          processedAt: new Date(scene.aiResults[agentId].processedAt).toLocaleString()
        }))
      });
    } else {
      console.log('❌ Scene not found');
    }
    
    return scene;
  }

  /**
   * ⚡ REAL-TIME SCENE UPDATES
   * When AI agents or users modify scenes, your teammate gets instant updates
   */
  static async simulateSceneUpdate(sceneId: string): Promise<void> {
    console.log(`🔄 Simulating AI agent updating scene ${sceneId}...`);
    
    // Simulate an AI agent adding subtitles
    const aiResult = {
      result: {
        subtitles: [
          { start: 0, end: 5, text: "Welcome to our video" },
          { start: 5, end: 10, text: "This is automatically generated" }
        ],
        confidence: 0.95
      },
      processedAt: Date.now(),
      agentId: 'subtitle-ai-agent',
      status: 'completed' as const
    };

    // Simulate timeline edits (like trimming)
    const timelineEdits = {
      clips: [
        {
          id: 'clip-1',
          start: 2, // Trimmed 2 seconds from start
          end: 28,  // Trimmed 2 seconds from end
          effects: ['fade-in', 'color-correction']
        }
      ],
      playhead: 15,
      effects: ['brightness-boost'],
      volume: 0.8,
      brightness: 10,
      contrast: 5,
      saturation: 0,
      textOverlays: [],
      fadeIn: 1,
      fadeOut: 1,
      lastModified: Date.now()
    };

    // Update the scene with new data
    await projectDataManager.updateScene(sceneId, {
      aiResults: { 'subtitle-ai-agent': aiResult },
      timelineEdits: timelineEdits,
      currentStart: 2,  // Updated based on timeline edits
      currentEnd: 28,   // Updated based on timeline edits
      currentDuration: 26 // New duration after edits
    });

    console.log('✅ Scene updated! Your teammate\'s timeline will see these changes instantly');
    
    // Show what the timeline developer would see
    const updatedScene = this.getSceneById(sceneId);
    if (updatedScene) {
      console.log('📊 Updated scene data available for timeline:', {
        newDuration: updatedScene.currentDuration,
        hasSubtitles: !!updatedScene.aiResults['subtitle-ai-agent'],
        hasTimelineEdits: updatedScene.timelineEdits.clips.length > 0,
        trimmedStart: updatedScene.currentStart,
        trimmedEnd: updatedScene.currentEnd
      });
    }
  }

  /**
   * 🔄 SCENE REORDERING
   * Your teammate can change scene order and it's instantly saved
   */
  static async reorderScenes(newOrder: string[]): Promise<void> {
    console.log('🔄 Timeline Developer: Reordering scenes...', newOrder);
    
    await projectDataManager.reorderScenes(newOrder);
    
    console.log('✅ Scenes reordered! New order saved automatically');
    
    // Show the new order
    const reorderedScenes = this.getAllScenesForTimeline();
    console.log('📋 New scene order:', 
      reorderedScenes.map(s => ({ id: s.sceneId, title: s.title, order: s.displayOrder }))
    );
  }

  /**
   * 📊 GET PROJECT METADATA
   * Your teammate can get overall project info
   */
  static getProjectMetadata(): any {
    console.log('📊 Timeline Developer: Getting project metadata...');
    
    const project = projectDataManager.getCurrentProject();
    if (!project) {
      console.log('❌ No project loaded');
      return null;
    }

    const metadata = {
      projectId: project.projectId,
      videoFileName: project.videoFileName,
      videoUrl: project.videoUrl,
      totalDuration: project.videoDuration,
      totalScenes: project.scenes.length,
      lastModified: new Date(project.metadata.lastModified).toLocaleString(),
      version: project.metadata.version,
      saveCount: project.metadata.saveCount
    };

    console.log('✅ Project metadata:', metadata);
    return metadata;
  }

  /**
   * 🎯 COMPLETE DEMO WORKFLOW
   * This shows the entire workflow your teammate would use
   */
  static async runCompleteDemo(): Promise<void> {
    console.log('\n🚀 STARTING COMPLETE TIMELINE DEVELOPER DEMO\n');
    
    try {
      // Step 1: Get project info
      console.log('=== STEP 1: GET PROJECT INFO ===');
      this.getProjectMetadata();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 2: Load all scenes
      console.log('\n=== STEP 2: LOAD ALL SCENES ===');
      const allScenes = this.getAllScenesForTimeline();
      
      if (allScenes.length === 0) {
        console.log('⚠️ No scenes found. Creating sample data...');
        await this.createSampleData();
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 3: Load individual scene
      console.log('\n=== STEP 3: LOAD INDIVIDUAL SCENE ===');
      const firstScene = allScenes[0];
      this.getSceneById(firstScene.sceneId);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 4: Simulate AI processing
      console.log('\n=== STEP 4: SIMULATE AI PROCESSING ===');
      await this.simulateSceneUpdate(firstScene.sceneId);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 5: Reorder scenes
      if (allScenes.length > 1) {
        console.log('\n=== STEP 5: REORDER SCENES ===');
        const currentOrder = allScenes.map(s => s.sceneId);
        const newOrder = [currentOrder[1], currentOrder[0], ...currentOrder.slice(2)]; // Swap first two
        await this.reorderScenes(newOrder);
      }
      
      console.log('\n🎉 DEMO COMPLETE! Your teammate has everything needed for timeline development.');
      
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }

  /**
   * 🎬 CREATE SAMPLE DATA FOR TESTING
   */
  static async createSampleData(): Promise<void> {
    console.log('🎬 Creating sample data for demo...');
    
    // This would normally come from video analysis
    const sampleAnalysis = {
      analysisId: 'demo-analysis-' + Date.now(),
      fileName: 'demo-video.mp4',
      videoUrl: 'blob:demo-url',
      duration: 120,
      scenes: [
        {
          scene_index: 0,
          sceneId: 'scene-demo-1',
          start: 0,
          end: 40,
          duration: 40,
          title: 'Opening Scene',
          tags: ['intro', 'welcome'],
          avg_volume: 0.6,
          high_energy: 1,
          transition_type: 'fade'
        },
        {
          scene_index: 1,
          sceneId: 'scene-demo-2',
          start: 40,
          end: 80,
          duration: 40,
          title: 'Main Content',
          tags: ['main', 'content'],
          avg_volume: 0.8,
          high_energy: 1,
          transition_type: 'cut'
        },
        {
          scene_index: 2,
          sceneId: 'scene-demo-3',
          start: 80,
          end: 120,
          duration: 40,
          title: 'Conclusion',
          tags: ['outro', 'summary'],
          avg_volume: 0.4,
          high_energy: 0,
          transition_type: 'fade'
        }
      ]
    };

    const newProject = await projectDataManager.createProjectFromAnalysis(sampleAnalysis);
    console.log('✅ Sample data created! Running demo with new data...');
    
    // Run the demo again with sample data
    setTimeout(() => this.runCompleteDemo(), 1000);
  }
}

// Make it available in browser console for testing
if (import.meta.env.DEV) {
  (window as any).TimelineDemo = TimelineEndpointDemo;
  console.log('🎬 Timeline Demo available: window.TimelineDemo.runCompleteDemo()');
}
