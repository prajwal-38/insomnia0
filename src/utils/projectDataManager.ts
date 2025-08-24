// src/utils/projectDataManager.ts
// Safe migration-based project data manager

import type { OptimizedProjectData, OptimizedSceneData, AnalyzedVideoData, ApiAnalysisResponse } from '../types';

const PROJECT_DATA_KEY = 'storyboard-project-v2';
const PROJECT_BACKUP_KEY = 'storyboard-project-backup-v2';
const MIGRATION_FLAG_KEY = 'storyboard-migration-completed';

// Legacy keys for migration
const LEGACY_KEYS = {
  NODES: 'storyboard-project-nodes',
  EDGES: 'storyboard-project-edges', 
  ANALYSIS: 'storyboard-current-analysis',
  VIEWPORT: 'storyboard-project-viewport',
  UNSAVED: 'storyboard-unsaved-metadata'
};

export class ProjectDataManager {
  private static instance: ProjectDataManager;
  private currentProject: OptimizedProjectData | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isInitialized = false;

  static getInstance(): ProjectDataManager {
    if (!ProjectDataManager.instance) {
      ProjectDataManager.instance = new ProjectDataManager();
    }
    return ProjectDataManager.instance;
  }

  // Initialize and load project data
  async initialize(): Promise<OptimizedProjectData | null> {
    if (this.isInitialized) {
      return this.currentProject;
    }

    try {
      console.log('🔄 Initializing ProjectDataManager...');
      
      // Check if migration was already completed
      const migrationCompleted = localStorage.getItem(MIGRATION_FLAG_KEY);
      
      if (!migrationCompleted) {
        console.log('🔄 Running first-time migration...');
        await this.runMigration();
      }

      // Load project data
      const project = await this.loadProject();
      this.currentProject = project;
      this.isInitialized = true;

      console.log('✅ ProjectDataManager initialized', {
        hasProject: !!project,
        scenes: project?.scenes.length || 0
      });

      return project;
    } catch (error) {
      console.error('❌ Failed to initialize ProjectDataManager:', error);
      this.isInitialized = true; // Mark as initialized even on error to prevent loops
      return null;
    }
  }

  // Load project with fallback to legacy system
  async loadProject(): Promise<OptimizedProjectData | null> {
    try {
      // Try new format first
      const newData = localStorage.getItem(PROJECT_DATA_KEY);
      if (newData) {
        const project = JSON.parse(newData) as OptimizedProjectData;

        // Validate and repair project data
        const repairedProject = this.validateAndRepairProject(project);

        // If repairs were made, save the repaired version
        if (repairedProject !== project) {
          console.log('🔧 Project data repaired, saving updated version');
          await this.saveProject(repairedProject);
        }

        console.log('📂 Loaded project from optimized format');
        return repairedProject;
      }

      // If no new format, check if legacy data exists
      const legacyAnalysis = localStorage.getItem(LEGACY_KEYS.ANALYSIS);
      if (legacyAnalysis) {
        console.log('⚠️ Legacy data found but migration not completed, running migration...');
        return await this.runMigration();
      }

      console.log('ℹ️ No project data found');
      return null;
    } catch (error) {
      console.error('❌ Failed to load project:', error);
      return null;
    }
  }

  // Validate and repair project data to ensure all required properties exist
  private validateAndRepairProject(project: OptimizedProjectData): OptimizedProjectData {
    let needsRepair = false;

    // Repair scenes that might be missing required properties
    const repairedScenes = project.scenes.map((scene, index) => {
      const repairedScene = { ...scene };

      // Ensure analysisId exists
      if (!repairedScene.analysisId) {
        repairedScene.analysisId = project.analysisId;
        needsRepair = true;
        console.log(`🔧 Repaired missing analysisId for scene ${scene.sceneId}`);
      }

      // Ensure originalVideoFileName exists
      if (!repairedScene.originalVideoFileName) {
        repairedScene.originalVideoFileName = project.videoFileName;
        needsRepair = true;
        console.log(`🔧 Repaired missing originalVideoFileName for scene ${scene.sceneId}`);
      }

      // Ensure sceneIndex exists
      if (repairedScene.sceneIndex === undefined) {
        repairedScene.sceneIndex = index;
        needsRepair = true;
        console.log(`🔧 Repaired missing sceneIndex for scene ${scene.sceneId}`);
      }

      // Ensure other optional properties have defaults
      if (!repairedScene.tags) repairedScene.tags = [];
      if (!repairedScene.aiResults) repairedScene.aiResults = {};
      if (repairedScene.avgVolume === undefined) repairedScene.avgVolume = 0;
      if (repairedScene.highEnergy === undefined) repairedScene.highEnergy = false;
      if (!repairedScene.transitionType) repairedScene.transitionType = 'cut';

      return repairedScene;
    });

    if (needsRepair) {
      console.log('🔧 Project data validation found and repaired issues');
      return {
        ...project,
        scenes: repairedScenes
      };
    }

    return project;
  }

  // Save project with debouncing and backup
  async saveProject(projectData: OptimizedProjectData): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        // Update metadata
        projectData.metadata.lastSaved = Date.now();
        projectData.metadata.saveCount++;

        // Create backup of current data
        const currentData = localStorage.getItem(PROJECT_DATA_KEY);
        if (currentData) {
          localStorage.setItem(PROJECT_BACKUP_KEY, currentData);
        }

        // Save new data
        const dataStr = JSON.stringify(projectData);
        localStorage.setItem(PROJECT_DATA_KEY, dataStr);

        console.log('💾 Project saved successfully', {
          scenes: projectData.scenes.length,
          size: Math.round(dataStr.length / 1024) + 'KB',
          saveCount: projectData.metadata.saveCount
        });

        this.currentProject = projectData;

        // Emit event for real-time updates
        this.emitProjectUpdate();
      } catch (error) {
        console.error('❌ Failed to save project:', error);
      }
    }, 1000); // Debounce saves by 1 second
  }

  // Update single scene efficiently
  async updateScene(sceneId: string, updates: Partial<OptimizedSceneData>): Promise<void> {
    if (!this.currentProject) {
      console.warn('⚠️ No current project to update scene');
      return;
    }

    const sceneIndex = this.currentProject.scenes.findIndex(s => s.sceneId === sceneId);
    if (sceneIndex === -1) {
      console.warn('⚠️ Scene not found:', sceneId);
      return;
    }

    // Update scene data
    this.currentProject.scenes[sceneIndex] = {
      ...this.currentProject.scenes[sceneIndex],
      ...updates
    };

    // Update project metadata
    this.currentProject.metadata.lastModified = Date.now();

    // Save project
    await this.saveProject(this.currentProject);
  }

  // Delete scene from project
  async deleteScene(sceneId: string): Promise<void> {
    if (!this.currentProject) {
      console.warn('⚠️ No current project to delete scene from');
      return;
    }

    const originalLength = this.currentProject.scenes.length;
    this.currentProject.scenes = this.currentProject.scenes.filter(scene => scene.sceneId !== sceneId);

    if (this.currentProject.scenes.length < originalLength) {
      // Update project metadata
      this.currentProject.metadata.lastModified = Date.now();

      // Save project
      await this.saveProject(this.currentProject);

      console.log(`✅ Scene ${sceneId} deleted from optimized system`);

      // Emit scene deletion event for timeline synchronization
      try {
        window.dispatchEvent(new CustomEvent('projectSceneDeleted', {
          detail: {
            sceneId,
            remainingScenes: this.currentProject.scenes.map(s => s.sceneId),
            timestamp: Date.now()
          }
        }));
        console.log(`📡 Emitted scene deletion event for ${sceneId}`);
      } catch (error) {
        console.warn('⚠️ Failed to emit scene deletion event:', error);
      }

      // Also emit general project update event
      this.emitProjectUpdate();
    } else {
      console.warn(`⚠️ Scene ${sceneId} not found for deletion`);
    }
  }

  // Reorder scenes by scene IDs
  async reorderScenes(sceneIds: string[]): Promise<void> {
    if (!this.currentProject) {
      console.warn('⚠️ No current project to reorder scenes');
      return;
    }

    // Update display order based on new arrangement
    sceneIds.forEach((sceneId, index) => {
      const scene = this.currentProject!.scenes.find(s => s.sceneId === sceneId);
      if (scene) {
        scene.displayOrder = index;
      }
    });

    // Update project metadata
    this.currentProject.metadata.lastModified = Date.now();

    // Save project
    await this.saveProject(this.currentProject);

    console.log(`✅ Scenes reordered in optimized system`);
  }

  // Create new project from video analysis data
  async createFromAnalysis(analysisData: ApiAnalysisResponse): Promise<OptimizedProjectData> {
    console.log('🚀 Creating optimized project from analysis data...');

    // Convert AnalyzedScene to OptimizedSceneData
    const scenes: OptimizedSceneData[] = analysisData.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      analysisId: analysisData.analysisId, // Ensure analysisId is set
      title: scene.title,
      originalStart: scene.start,
      originalEnd: scene.end,
      originalDuration: scene.duration,
      originalVideoFileName: analysisData.fileName, // Add required property
      currentStart: scene.start,
      currentEnd: scene.end,
      currentDuration: scene.duration,
      tags: scene.tags || [],
      displayOrder: scene.scene_index,
      timelineData: {
        clips: [{
          id: `clip-${scene.sceneId}`,
          start: 0,
          end: scene.duration,
          originalStart: scene.start,
          originalEnd: scene.end,
          trimStart: 0,
          trimEnd: scene.duration
        }],
        totalDuration: scene.duration
      },
      aiResults: {},
      position: {
        x: 400 + Math.cos((index / analysisData.scenes.length) * 2 * Math.PI) * Math.max(200, analysisData.scenes.length * 30),
        y: 300 + Math.sin((index / analysisData.scenes.length) * 2 * Math.PI) * Math.max(200, analysisData.scenes.length * 30)
      },
      sceneIndex: scene.scene_index,
      avgVolume: scene.avgVolume || 0,
      highEnergy: scene.highEnergy || false,
      transitionType: scene.transitionType || 'cut'
    }));

    const newProject: OptimizedProjectData = {
      projectId: analysisData.analysisId,
      analysisId: analysisData.analysisId,
      videoFileName: analysisData.fileName,
      videoUrl: analysisData.videoUrl,
      videoDuration: analysisData.metadata.duration,
      scenes,
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {
        created: Date.now(),
        lastSaved: Date.now(),
        lastModified: Date.now(),
        version: '2.0.0',
        saveCount: 1
      }
    };

    // Note: Scene connections (edges) are now handled by the React Flow component
    // to avoid duplicate edge creation. The App.tsx handles edge creation.

    // Save the new project
    await this.saveProject(newProject);

    console.log('✅ Optimized project created and saved:', {
      projectId: newProject.projectId,
      scenes: newProject.scenes.length,
      fileName: newProject.videoFileName
    });

    return newProject;
  }

  // Emit project update event for real-time synchronization
  private emitProjectUpdate(): void {
    try {
      window.dispatchEvent(new CustomEvent('optimizedProjectUpdated', {
        detail: {
          project: this.currentProject,
          timestamp: Date.now()
        }
      }));
    } catch (error) {
      console.warn('⚠️ Failed to emit project update event:', error);
    }
  }

  // Get scenes in playback order
  getPlaybackOrder(): OptimizedSceneData[] {
    if (!this.currentProject) return [];

    return this.currentProject.scenes
      .filter(scene => scene.currentDuration > 0)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  // Note: Scene connections (edges) are now handled by the React Flow component
  // in App.tsx to avoid duplicate edge creation and ensure proper React Flow integration.



  // Migration from old localStorage format
  private async runMigration(): Promise<OptimizedProjectData | null> {
    try {
      console.log('🔄 Starting migration from legacy format...');

      const oldNodes = localStorage.getItem(LEGACY_KEYS.NODES);
      const oldAnalysis = localStorage.getItem(LEGACY_KEYS.ANALYSIS);
      const oldViewport = localStorage.getItem(LEGACY_KEYS.VIEWPORT);

      if (!oldNodes || !oldAnalysis) {
        console.log('ℹ️ No legacy data to migrate');
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        return null;
      }

      // Validate and parse JSON data with better error handling
      let nodes, analysis, viewport;

      try {
        nodes = JSON.parse(oldNodes);
      } catch (error) {
        console.error('❌ Failed to parse legacy nodes data:', error);
        console.log('🧹 Clearing corrupted nodes data');
        localStorage.removeItem(LEGACY_KEYS.NODES);
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        return null;
      }

      try {
        analysis = JSON.parse(oldAnalysis) as AnalyzedVideoData;
      } catch (error) {
        console.error('❌ Failed to parse legacy analysis data:', error);
        console.log('🧹 Clearing corrupted analysis data');
        localStorage.removeItem(LEGACY_KEYS.ANALYSIS);
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        return null;
      }

      try {
        viewport = oldViewport ? JSON.parse(oldViewport) : { x: 0, y: 0, zoom: 1 };
      } catch (error) {
        console.warn('⚠️ Failed to parse legacy viewport data, using default:', error);
        viewport = { x: 0, y: 0, zoom: 1 };
      }

      // Convert old node data to optimized scene data
      const scenes: OptimizedSceneData[] = [];

      // Get scene nodes only
      const sceneNodes = nodes.filter((node: any) =>
        node.data?.type === 'scene' && node.data?.videoAnalysisData
      );

      // If we have scene nodes, use them. Otherwise, create from analysis data directly
      if (sceneNodes.length > 0) {
        console.log(`🔄 Migrating from ${sceneNodes.length} scene nodes`);
        sceneNodes.forEach((node: any, index: number) => {
        const sceneData = node.data.videoAnalysisData;
        
        // Load existing timeline data if available
        const timelineKey = `timeline-${sceneData.sceneId}`;
        const timelineData = localStorage.getItem(timelineKey);
        let timelineEdits = {
          clips: [],
          playhead: 0,
          effects: [],
          volume: 1,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          textOverlays: [],
          fadeIn: 0,
          fadeOut: 0,
          lastModified: Date.now()
        };

        if (timelineData) {
          try {
            const parsed = JSON.parse(timelineData);
            timelineEdits = { 
              ...timelineEdits, 
              clips: parsed.clips || [],
              playhead: parsed.playhead || 0,
              effects: parsed.edits || parsed.effects || [],
              lastModified: parsed.lastSaved || Date.now()
            };
          } catch (e) {
            console.warn('⚠️ Failed to parse timeline data for scene:', sceneData.sceneId);
          }
        }

        scenes.push({
          sceneId: sceneData.sceneId,
          analysisId: sceneData.analysisId || analysis.analysisId, // Fallback to analysis ID
          originalStart: sceneData.start,
          originalEnd: sceneData.end,
          originalDuration: sceneData.duration,
          originalVideoFileName: sceneData.originalVideoFileName || analysis.fileName,
          currentStart: sceneData.start,
          currentEnd: sceneData.end,
          currentDuration: sceneData.duration,
          displayOrder: sceneData.sceneIndex || index,
          title: sceneData.title,
          tags: sceneData.tags || [],
          timelineEdits,
          aiResults: sceneData.aiProcessingResults || {},
          position: node.position || { x: index * 220, y: 100 },
          // Legacy compatibility
          sceneIndex: sceneData.sceneIndex || index,
          avgVolume: sceneData.avgVolume || 0,
          highEnergy: sceneData.highEnergy || false,
          transitionType: sceneData.transitionType || 'cut'
        });
      });
      } else {
        // No scene nodes found, create scenes directly from analysis data
        console.log(`🔄 No scene nodes found, creating from analysis data (${analysis.scenes?.length || 0} scenes)`);

        if (analysis.scenes && analysis.scenes.length > 0) {
          analysis.scenes.forEach((scene: any, index: number) => {
            // Load existing timeline data if available
            const timelineKey = `timeline-${scene.sceneId}`;
            const timelineData = localStorage.getItem(timelineKey);
            let timelineEdits = {
              clips: [],
              playhead: 0,
              effects: [],
              volume: 1,
              brightness: 0,
              contrast: 0,
              saturation: 0,
              textOverlays: [],
              fadeIn: 0,
              fadeOut: 0,
              lastModified: Date.now()
            };

            if (timelineData) {
              try {
                const parsed = JSON.parse(timelineData);
                timelineEdits = {
                  ...timelineEdits,
                  clips: parsed.clips || [],
                  playhead: parsed.playhead || 0,
                  effects: parsed.edits || parsed.effects || [],
                  lastModified: parsed.lastSaved || Date.now()
                };
              } catch (e) {
                console.warn('⚠️ Failed to parse timeline data for scene:', scene.sceneId);
              }
            }

            scenes.push({
              sceneId: scene.sceneId,
              analysisId: analysis.analysisId,
              originalStart: scene.start,
              originalEnd: scene.end,
              originalDuration: scene.duration,
              originalVideoFileName: analysis.fileName,
              currentStart: scene.start,
              currentEnd: scene.end,
              currentDuration: scene.duration,
              displayOrder: scene.scene_index || index,
              title: scene.title,
              tags: scene.tags || [],
              timelineEdits,
              aiResults: {},
              position: { x: index * 220, y: 100 },
              // Legacy compatibility
              sceneIndex: scene.scene_index || index,
              avgVolume: scene.avg_volume,
              highEnergy: scene.high_energy === 1,
              transitionType: scene.transition_type
            });
          });
        }
      }

      const migratedProject: OptimizedProjectData = {
        projectId: analysis.analysisId,
        analysisId: analysis.analysisId,
        videoFileName: analysis.fileName,
        videoUrl: analysis.videoUrl,
        videoDuration: analysis.duration,
        scenes,
        viewport,
        metadata: {
          created: Date.now(),
          lastSaved: Date.now(),
          lastModified: Date.now(),
          version: '2.0.0',
          saveCount: 1
        }
      };

      // Save migrated project
      await this.saveProject(migratedProject);
      
      // Mark migration as completed
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

      console.log('✅ Migration completed successfully:', {
        scenes: scenes.length,
        analysisId: analysis.analysisId,
        videoFileName: analysis.fileName
      });

      // Keep legacy data for now as backup (don't delete immediately)
      console.log('ℹ️ Legacy data preserved as backup');

      return migratedProject;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return null;
    }
  }

  getCurrentProject(): OptimizedProjectData | null {
    return this.currentProject;
  }

  // Clear current project and all related data
  async clearProject(): Promise<void> {
    try {
      console.log('🧹 Clearing current project and related data...');

      // Clear in-memory project
      this.currentProject = null;

      // Clear localStorage data
      localStorage.removeItem(PROJECT_DATA_KEY);
      localStorage.removeItem(PROJECT_BACKUP_KEY);
      localStorage.removeItem(MIGRATION_FLAG_KEY);

      // Clear legacy data as well
      Object.values(LEGACY_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      // Clear any timeline data that might be associated with the project
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('timeline-') ||
          key.startsWith('storyboard_timeline_') ||
          key.includes('scene-')
        )) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      console.log(`✅ Cleared project data and ${keysToRemove.length} timeline entries`);

      // Emit project cleared event
      this.emitProjectUpdate();

    } catch (error) {
      console.error('❌ Error clearing project:', error);
      throw error;
    }
  }

  // Clear corrupted localStorage data that might cause migration issues
  static clearCorruptedData(): void {
    try {
      console.log('🧹 Checking for and clearing corrupted localStorage data...');

      const keysToCheck = [
        LEGACY_KEYS.NODES,
        LEGACY_KEYS.ANALYSIS,
        LEGACY_KEYS.VIEWPORT,
        LEGACY_KEYS.UNSAVED,
        PROJECT_DATA_KEY,
        PROJECT_BACKUP_KEY
      ];

      let clearedCount = 0;

      keysToCheck.forEach(key => {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            JSON.parse(data);
          } catch (error) {
            console.warn(`🧹 Removing corrupted data for key: ${key}`, error);
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      });

      if (clearedCount > 0) {
        console.log(`✅ Cleared ${clearedCount} corrupted localStorage entries`);
        // Mark migration as completed to prevent further attempts
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      } else {
        console.log('✅ No corrupted localStorage data found');
      }
    } catch (error) {
      console.error('❌ Error checking for corrupted data:', error);
    }
  }

  // Create new project from analysis data
  async createProjectFromAnalysis(analysisData: AnalyzedVideoData): Promise<OptimizedProjectData> {
    const scenes: OptimizedSceneData[] = analysisData.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      analysisId: analysisData.analysisId,
      originalStart: scene.start,
      originalEnd: scene.end,
      originalDuration: scene.duration,
      originalVideoFileName: analysisData.fileName,
      currentStart: scene.start,
      currentEnd: scene.end,
      currentDuration: scene.duration,
      displayOrder: index,
      title: scene.title,
      tags: scene.tags || [],
      timelineEdits: {
        clips: [],
        playhead: 0,
        effects: [],
        volume: 1,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        textOverlays: [],
        fadeIn: 0,
        fadeOut: 0,
        lastModified: Date.now()
      },
      aiResults: {},
      position: { x: index * 220, y: 100 },
      sceneIndex: scene.scene_index,
      avgVolume: scene.avg_volume,
      highEnergy: scene.high_energy === 1,
      transitionType: scene.transition_type
    }));

    const newProject: OptimizedProjectData = {
      projectId: analysisData.analysisId,
      analysisId: analysisData.analysisId,
      videoFileName: analysisData.fileName,
      videoUrl: analysisData.videoUrl,
      videoDuration: analysisData.duration,
      scenes,
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {
        created: Date.now(),
        lastSaved: Date.now(),
        lastModified: Date.now(),
        version: '2.0.0',
        saveCount: 1
      }
    };

    await this.saveProject(newProject);
    this.currentProject = newProject;

    console.log('✅ Created new project from analysis:', {
      scenes: scenes.length,
      analysisId: analysisData.analysisId
    });

    return newProject;
  }
}

// Export singleton instance
export const projectDataManager = ProjectDataManager.getInstance();
