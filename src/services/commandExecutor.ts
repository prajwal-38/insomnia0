// src/services/commandExecutor.ts
import type { ParsedCommand } from './chatbotService';
import type { ApiAnalysisResponse, AIAgentType } from '../types';
import type { AppNodeType } from '../App';
import { projectDataManager } from '../utils/projectDataManager';

export interface ExecutionContext {
  onNodeUpdate: (nodeId: string, updates: any) => void;
  onAddAIAgent: (agentType: AIAgentType) => void;
  onShowToast: (message: string, type: 'info' | 'error' | 'success' | 'warning') => void;
  currentAnalysisData: ApiAnalysisResponse | null;
  nodes: AppNodeType[];
  onRefreshProject?: () => void; // Optional callback to refresh project data
  onAddAIAgentWithConnection?: (agentType: AIAgentType, targetSceneIds: string[]) => Promise<string>; // Returns agent ID
  onCreateConnection?: (sourceId: string, targetId: string) => void | Promise<void>;
}

export interface ExecutionResult {
  success: boolean;
  response: string;
  actions: string[];
  suggestions?: string[];
  error?: string;
  includeSyncButton?: boolean;
}

export class CommandExecutor {
  async executeCommand(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      console.log('Executing command:', command);
      
      switch (command.action) {
        case 'add_agent_to_scene':
          return await this.addAgentToScene(command, context);
        
        case 'create_new_scene':
          return await this.createNewScene(command, context);
        
        case 'delete_scene':
          return await this.deleteScene(command, context);
        
        case 'enhance_video_quality':
          return await this.enhanceVideoQuality(command, context);
        
        case 'analyze_scenes':
          return await this.analyzeScenes(command, context);
        
        case 'display_project_stats':
          return await this.displayProjectStats(command, context);
        
        case 'show_help':
          return await this.showHelp(command, context);
        
        case 'add_subtitles_to_all':
          return await this.addSubtitlesToAll(command, context);

        case 'apply_workflow':
          return await this.applyWorkflow(command, context);

        case 'process_all_scenes':
          return await this.processAllScenes(command, context);

        case 'navigate_to_scene':
          return await this.navigateToScene(command, context);

      case 'trim_beginning':
        return await this.trimSceneBeginning(command, context);

      case 'respond_greeting':
        return await this.respondToGreeting(command, context);

      case 'show_debug_info':
        return await this.showDebugInfo(command, context);

      case 'clear_subtitle_duplicates':
        return await this.clearSubtitleDuplicates(command, context);

      case 'force_refresh_project':
        return await this.forceRefreshProject(command, context);

      case 'general_conversation':
        return await this.handleGeneralConversation(command, context);

        default:
          return this.createErrorResult(`Unknown command action: ${command.action}`, []);
      }
    } catch (error) {
      console.error('Command execution error:', error);
      return this.createErrorResult(
        `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        []
      );
    }
  }
  
  private async addAgentToScene(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    let { agentType, sceneIds, target } = command.parameters;

    if (!agentType) {
      return this.createErrorResult('No agent type specified', []);
    }

    // If no sceneIds provided, default to all scenes
    if (!sceneIds || sceneIds.length === 0) {
      if (context.currentAnalysisData && context.currentAnalysisData.scenes.length > 0) {
        sceneIds = context.currentAnalysisData.scenes.map(s => s.sceneId);
        target = target || 'all';
      } else {
        return this.createErrorResult('No scenes available in the current project', []);
      }
    }

    const actions: string[] = [];

    try {
      // Find target scene nodes
      const targetSceneNodes = context.nodes.filter(node =>
        node.data.type === 'scene' &&
        node.data.videoAnalysisData?.sceneId &&
        sceneIds.includes(node.data.videoAnalysisData.sceneId)
      );

      // Check if scene nodes exist in the story view
      if (targetSceneNodes.length === 0 && sceneIds.length > 0) {
        // Debug: Show what nodes are available
        console.log('🔍 Available nodes in context:', context.nodes.map(n => ({
          id: n.id,
          type: n.data.type,
          sceneId: n.data.videoAnalysisData?.sceneId
        })));
        console.log('🔍 Looking for scene IDs:', sceneIds);

        return this.createErrorResult(
          `No scene nodes found for the requested scenes. Available nodes: ${context.nodes.length}. Looking for scene IDs: ${sceneIds.join(', ')}. Please ensure your video scenes are loaded on the canvas.`,
          []
        );
      }

      // Use the new connection-aware method if available
      if (context.onAddAIAgentWithConnection && context.onCreateConnection && targetSceneNodes.length > 0) {
        console.log('🔧 CommandExecutor: Using connection-aware method with actual connections');

        const agentId = await context.onAddAIAgentWithConnection(agentType, sceneIds);
        console.log('🔧 CommandExecutor: Created agent with ID:', agentId);

        // Now create actual connections to each target scene
        for (const sceneNode of targetSceneNodes) {
          const sceneNodeId = sceneNode.id;
          console.log(`🔗 CommandExecutor: Creating connection ${agentId} → ${sceneNodeId}`);

          try {
            // Create the actual connection using the provided callback
            await context.onCreateConnection(agentId, sceneNodeId);
            actions.push(`Connected ${agentType} agent to scene ${sceneNode.data.videoAnalysisData?.sceneId}`);
            console.log(`✅ CommandExecutor: Successfully connected ${agentId} to ${sceneNodeId}`);
          } catch (error) {
            console.error(`❌ CommandExecutor: Failed to connect ${agentId} to ${sceneNodeId}:`, error);
            actions.push(`Failed to connect ${agentType} agent to scene ${sceneNode.data.videoAnalysisData?.sceneId}`);
          }
        }
      } else {
        console.log('🔧 CommandExecutor: Using fallback method - no connections will be created');
        // Fallback to old method - create one agent per scene
        for (let i = 0; i < sceneIds.length; i++) {
          context.onAddAIAgent(agentType);
          actions.push(`Added ${agentType} agent for scene ${i + 1}`);
        }
      }

      const agentName = this.getAgentDisplayName(agentType);
      const targetDescription = target === 'all' || !target ? `all ${sceneIds.length} scenes` : `scene ${target}`;

      // Check if this is a subtitle agent to include sync button
      const includesSyncButton = agentType === 'subtitle-generator';

      const hasConnections = context.onAddAIAgentWithConnection && context.onCreateConnection;
      const connectionStatus = hasConnections ? 'connected automatically and processing has started' : 'created on the canvas';

      return {
        success: true,
        response: `✅ Successfully added ${agentName} to ${targetDescription}. The agent${sceneIds.length > 1 ? 's' : ''} ${hasConnections ? 'have been' : 'have been'} ${connectionStatus}. ${hasConnections ? 'AI processing is now running!' : 'Connect them to scenes manually to start processing.'}${includesSyncButton ? '\n\n🎬 Once processing is complete, use the sync button below to load the generated subtitles into your timeline:' : ''}`,
        actions,
        suggestions: hasConnections ? [
          'AI processing is running automatically',
          'Monitor progress in the node graph',
          'Check the timeline for AI processing results',
          ...(includesSyncButton ? ['Use the sync button to load generated subtitles'] : [])
        ] : [
          'Connect AI agents to scenes by dragging connections',
          'Check the node graph for new AI agents',
          'Processing will start automatically when connected'
        ],
        includeSyncButton: includesSyncButton
      };
    } catch (error) {
      return this.createErrorResult(`Failed to add ${agentType} agent`, actions);
    }
  }
  
  private async enhanceVideoQuality(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    let { sceneIds } = command.parameters;

    // If no sceneIds provided, default to all scenes
    if (!sceneIds || sceneIds.length === 0) {
      if (context.currentAnalysisData && context.currentAnalysisData.scenes.length > 0) {
        sceneIds = context.currentAnalysisData.scenes.map(s => s.sceneId);
      } else {
        return this.createErrorResult('No scenes available for enhancement', []);
      }
    }

    const actions: string[] = [];

    try {
      // Add video enhancer agents to all specified scenes
      for (let i = 0; i < sceneIds.length; i++) {
        context.onAddAIAgent('video-enhancer');
        actions.push(`Added video enhancer to scene ${i + 1}`);
      }

      const sceneCount = sceneIds.length;

      return {
        success: true,
        response: `🎬 Started video quality enhancement for ${sceneCount} scene${sceneCount > 1 ? 's' : ''}. This includes:\n\n• Resolution upscaling\n• Noise reduction\n• Stabilization\n• Color correction\n\nProcessing will begin automatically.`,
        actions,
        suggestions: [
          'Monitor progress in the AI Agents panel',
          'Add audio enhancement for complete improvement',
          'Consider adding color grading for professional look'
        ]
      };
    } catch (error) {
      return this.createErrorResult('Failed to start video enhancement', actions);
    }
  }
  
  private async analyzeScenes(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    let { sceneIds, specific } = command.parameters;

    // FORCE LOAD PROJECT DATA IF NOT AVAILABLE
    let analysisData = context.currentAnalysisData;

    if (!analysisData) {
      console.log('🔄 No analysis data in context, force loading from localStorage...');

      // Try to load from localStorage
      const storedData = localStorage.getItem('currentAnalysisData');
      if (storedData) {
        try {
          analysisData = JSON.parse(storedData);
          console.log('✅ Loaded analysis data from localStorage:', analysisData);
        } catch (error) {
          console.error('❌ Failed to parse stored analysis data:', error);
        }
      }

      // Try to load from project manager
      if (!analysisData) {
        const { projectDataManager } = await import('../utils/projectDataManager');
        const currentProject = projectDataManager.getCurrentProject();
        if (currentProject && currentProject.scenes && currentProject.scenes.length > 0) {
          analysisData = {
            analysisId: currentProject.analysisId,
            fileName: currentProject.videoFileName,
            videoUrl: currentProject.videoUrl,
            scenes: currentProject.scenes.map(scene => ({
              sceneId: scene.sceneId,
              title: scene.title,
              start: scene.currentStart,
              end: scene.currentEnd,
              duration: scene.currentDuration,
              scene_index: scene.displayOrder,
              tags: scene.tags || [],
              avg_volume: scene.avgVolume || 0,
              high_energy: scene.highEnergy ? 1 : 0,
              transition_type: scene.transitionType || 'cut'
            })),
            metadata: {
              duration: currentProject.videoDuration,
              width: 1920,
              height: 1080,
              fps: 30
            }
          };
          console.log('✅ Created analysis data from project manager:', analysisData);
        }
      }
    }

    if (!analysisData || !analysisData.scenes || analysisData.scenes.length === 0) {
      return this.createErrorResult('No video project loaded or no scenes found. Please upload and analyze a video first.', []);
    }

    // If no sceneIds provided, default to all scenes
    if (!sceneIds || sceneIds.length === 0) {
      sceneIds = analysisData.scenes.map(s => s.sceneId);
    }

    const scenes = analysisData.scenes.filter(s => sceneIds.includes(s.sceneId));
    
    if (specific && scenes.length === 1) {
      const scene = scenes[0];
      const duration = Math.round(scene.duration);
      const tags = scene.tags.length > 0 ? scene.tags.join(', ') : 'No tags';
      
      return {
        success: true,
        response: `📊 Scene ${scene.scene_index + 1} Analysis:\n\n🎬 Title: ${scene.title}\n⏱️ Duration: ${duration}s (${scene.start}s - ${scene.end}s)\n🏷️ Tags: ${tags}\n🔊 Audio Level: ${scene.avg_volume ? 'Normal' : 'Low'}\n⚡ Energy: ${scene.high_energy ? 'High' : 'Low'}\n🔄 Transition: ${scene.transition_type || 'Cut'}`,
        actions: ['Analyzed scene details'],
        suggestions: [
          'Add content analyzer for deeper insights',
          'Enhance this scene with AI agents',
          'Edit scene metadata'
        ]
      };
    } else {
      const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
      const avgDuration = totalDuration / scenes.length;
      const highEnergyScenes = scenes.filter(s => s.high_energy).length;
      
      return {
        success: true,
        response: `📊 Project Analysis:\n\n🎬 Total Scenes: ${scenes.length}\n⏱️ Total Duration: ${Math.round(totalDuration)}s\n📈 Average Scene Length: ${Math.round(avgDuration)}s\n⚡ High Energy Scenes: ${highEnergyScenes}\n🎵 Audio Quality: ${scenes.filter(s => s.avg_volume).length}/${scenes.length} scenes have good audio`,
        actions: ['Analyzed project statistics'],
        suggestions: [
          'Add content analyzers to all scenes',
          'Enhance scenes with low audio quality',
          'Balance scene lengths for better pacing'
        ]
      };
    }
  }
  
  private async displayProjectStats(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    if (!context.currentAnalysisData) {
      return this.createErrorResult('No video project loaded', []);
    }
    
    const { sceneCount, totalDuration } = command.parameters;
    const scenes = context.currentAnalysisData.scenes;
    
    // Calculate additional statistics
    const avgSceneLength = totalDuration / sceneCount;
    const shortScenes = scenes.filter(s => s.duration < 5).length;
    const longScenes = scenes.filter(s => s.duration > 30).length;
    const taggedScenes = scenes.filter(s => s.tags.length > 0).length;
    const aiAgentNodes = context.nodes.filter(n => n.data.type === 'ai-agent').length;
    
    return {
      success: true,
      response: `📊 Project Statistics:\n\n🎬 Video: ${context.currentAnalysisData.fileName}\n📹 Total Scenes: ${sceneCount}\n⏱️ Total Duration: ${Math.round(totalDuration)}s (${Math.round(totalDuration/60)}m)\n📏 Average Scene Length: ${Math.round(avgSceneLength)}s\n\n📊 Scene Breakdown:\n• Short scenes (<5s): ${shortScenes}\n• Long scenes (>30s): ${longScenes}\n• Tagged scenes: ${taggedScenes}/${sceneCount}\n\n🤖 AI Agents: ${aiAgentNodes} active\n\n💡 Recommendations:\n${this.generateRecommendations(scenes, aiAgentNodes)}`,
      actions: ['Generated project statistics'],
      suggestions: [
        'Optimize scene lengths for better pacing',
        'Add more AI agents for enhancement',
        'Tag scenes for better organization'
      ]
    };
  }
  
  private async showHelp(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const helpText = `🎬 AI Video Editing Assistant - Available Commands:

🤖 AI AGENTS:
• "Add subtitle agent to scene 1"
• "Add video enhancer to all scenes"
• "Add audio processor to scene 3"
• "Add content analyzer to every scene"

🎞️ SCENE OPERATIONS:
• "Create new scene after scene 2"
• "Delete scene 3"
• "Analyze scene 1"
• "Show scene statistics"

✨ ENHANCEMENTS:
• "Enhance video quality for all scenes"
• "Add subtitles to all scenes"
• "Improve audio quality"

📊 ANALYSIS:
• "Show project statistics"
• "Analyze all scenes"
• "Tell me about scene 2"

💡 TIPS:
• Use natural language - I understand context!
• Reference scenes by number (e.g., "scene 1")
• Use "all scenes" for batch operations
• Ask "what can you do?" anytime for help`;

    return {
      success: true,
      response: helpText,
      actions: ['Displayed help information'],
      suggestions: [
        'Try: "Add subtitle agent to scene 1"',
        'Try: "Enhance video quality for all scenes"',
        'Try: "Show me project statistics"'
      ]
    };
  }
  
  private async addSubtitlesToAll(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    let { sceneIds } = command.parameters;

    // If no sceneIds provided, default to all scenes
    if (!sceneIds || sceneIds.length === 0) {
      if (context.currentAnalysisData && context.currentAnalysisData.scenes.length > 0) {
        sceneIds = context.currentAnalysisData.scenes.map(s => s.sceneId);
      } else {
        return this.createErrorResult('No scenes available for subtitle generation', []);
      }
    }

    const actions: string[] = [];

    try {
      // Add subtitle generator to all scenes
      for (let i = 0; i < sceneIds.length; i++) {
        context.onAddAIAgent('subtitle-generator');
        actions.push(`Added subtitle generator to scene ${i + 1}`);
      }

      return {
        success: true,
        response: `📝 Started subtitle generation for all ${sceneIds.length} scenes. This will:\n\n• Transcribe audio to text\n• Generate accurate timing\n• Create downloadable SRT files\n• Sync with video playback\n\nProcessing will begin automatically for each scene.`,
        actions,
        suggestions: [
          'Monitor subtitle generation progress',
          'Review and edit subtitles when complete',
          'Download SRT files for external use'
        ]
      };
    } catch (error) {
      return this.createErrorResult('Failed to start subtitle generation', actions);
    }
  }
  
  private async createNewScene(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { position } = command.parameters;

    if (!context.currentAnalysisData) {
      return this.createErrorResult('No video project loaded. Please upload and analyze a video first.', []);
    }

    try {
      // For now, we'll create a conceptual scene since we can't actually split video
      // This would be a placeholder scene that users can later edit
      const currentProject = projectDataManager.getCurrentProject();
      if (!currentProject) {
        return this.createErrorResult('No active project found', []);
      }

      const sceneCount = currentProject.scenes.length;
      const insertPosition = Math.min(Math.max(position || sceneCount + 1, 1), sceneCount + 1);

      // Create a new scene placeholder
      const newSceneId = `scene-${Date.now()}`;
      const duration = 5; // Default 5 second placeholder

      // This is a conceptual implementation - in a real system you'd need video splitting
      const newScene = {
        sceneId: newSceneId,
        analysisId: currentProject.analysisId,
        originalStart: 0,
        originalEnd: duration,
        originalDuration: duration,
        originalVideoFileName: currentProject.videoFileName,
        currentStart: 0,
        currentEnd: duration,
        currentDuration: duration,
        displayOrder: insertPosition - 1,
        title: `New Scene ${insertPosition}`,
        tags: ['user-created'],
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
        position: { x: (insertPosition - 1) * 220, y: 100 }
      };

      // Add to project (this is conceptual - real implementation would need video processing)
      currentProject.scenes.splice(insertPosition - 1, 0, newScene);

      // Update display orders
      currentProject.scenes.forEach((scene, index) => {
        scene.displayOrder = index;
      });

      // Save project
      await projectDataManager.saveProject(currentProject);

      // Refresh the UI if callback provided
      if (context.onRefreshProject) {
        context.onRefreshProject();
      }

      return {
        success: true,
        response: `✅ Created new placeholder scene at position ${insertPosition}. Note: This is a conceptual scene for planning purposes. To create actual video scenes, you would need to split the video at specific timestamps.`,
        actions: [`Created scene "${newScene.title}"`],
        suggestions: [
          'Edit the scene title and add tags',
          'Add AI agents to process this scene',
          'Use timeline editor to set actual video segments'
        ]
      };
    } catch (error) {
      return this.createErrorResult(`Failed to create scene: ${error instanceof Error ? error.message : 'Unknown error'}`, []);
    }
  }
  
  private async deleteScene(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { sceneIndex } = command.parameters;

    console.log('🗑️ DeleteScene: Received parameters:', command.parameters);
    console.log('🗑️ DeleteScene: Scene index:', sceneIndex);

    if (!context.currentAnalysisData) {
      return this.createErrorResult('No video project loaded', []);
    }

    if (isNaN(sceneIndex) || sceneIndex < 0 || sceneIndex >= context.currentAnalysisData.scenes.length) {
      return this.createErrorResult(`❌ Scene ${sceneIndex + 1} not found. Available scenes: 1-${context.currentAnalysisData.scenes.length}`, []);
    }

    try {
      const currentProject = projectDataManager.getCurrentProject();
      if (!currentProject) {
        return this.createErrorResult('No active project found', []);
      }

      const sceneToDelete = currentProject.scenes[sceneIndex];
      if (!sceneToDelete) {
        return this.createErrorResult(`Scene ${sceneIndex + 1} not found`, []);
      }

      const sceneTitle = sceneToDelete.title;
      const sceneId = sceneToDelete.sceneId;

      // Use the optimized system's deleteScene method
      await projectDataManager.deleteScene(sceneId);

      // Refresh the UI if callback provided
      if (context.onRefreshProject) {
        context.onRefreshProject();
      }

      return {
        success: true,
        response: `✅ Successfully deleted scene ${sceneIndex + 1}: "${sceneTitle}". The remaining scenes have been automatically reordered.`,
        actions: [`Deleted scene "${sceneTitle}"`],
        suggestions: [
          'Check the updated scene list',
          'Verify scene numbering is correct',
          'Add new scenes if needed'
        ]
      };
    } catch (error) {
      return this.createErrorResult(`Failed to delete scene: ${error instanceof Error ? error.message : 'Unknown error'}`, []);
    }
  }
  
  private createErrorResult(message: string, actions: string[]): ExecutionResult {
    return {
      success: false,
      response: `❌ ${message}`,
      actions,
      error: message
    };
  }
  
  private getAgentDisplayName(agentType: AIAgentType): string {
    const displayNames: Record<AIAgentType, string> = {
      'subtitle-generator': 'Subtitle Generator',
      'video-enhancer': 'Video Enhancer',
      'audio-processor': 'Audio Processor',
      'content-analyzer': 'Content Analyzer',
      'color-grader': 'Color Grader',
      'object-detector': 'Object Detector',
      'scene-classifier': 'Scene Classifier',
      'transition-suggester': 'Transition Suggester',
      'noise-reducer': 'Noise Reducer',
      'auto-editor': 'Auto Editor'
    };
    
    return displayNames[agentType] || agentType;
  }
  
  private generateRecommendations(scenes: any[], aiAgentCount: number): string {
    const recommendations: string[] = [];

    if (aiAgentCount === 0) {
      recommendations.push('• Add AI agents to enhance your video');
    }

    const untaggedScenes = scenes.filter(s => s.tags.length === 0).length;
    if (untaggedScenes > 0) {
      recommendations.push(`• Tag ${untaggedScenes} scenes for better organization`);
    }

    const shortScenes = scenes.filter(s => s.duration < 3).length;
    if (shortScenes > 0) {
      recommendations.push(`• Consider merging ${shortScenes} very short scenes`);
    }

    const lowAudioScenes = scenes.filter(s => !s.avg_volume).length;
    if (lowAudioScenes > 0) {
      recommendations.push(`• Enhance audio for ${lowAudioScenes} scenes`);
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '• Your project looks well-organized!';
  }

  private async handleGeneralConversation(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const response = command.parameters.response || "I'm here to help you with your video editing project! What would you like to know?";

    // Generate contextual suggestions based on current project state
    const suggestions: string[] = [];

    if (context.currentAnalysisData) {
      const sceneCount = context.currentAnalysisData.scenes.length;
      suggestions.push(
        `Add subtitle agent to scene 1`,
        `Enhance video quality for all ${sceneCount} scenes`,
        `Analyze content in all scenes`,
        `Show me project statistics`
      );
    } else {
      suggestions.push(
        'Upload a video to get started',
        'What can you do?',
        'Show available commands'
      );
    }

    return {
      success: true,
      response,
      actions: ['Provided conversational response'],
      suggestions: suggestions.slice(0, 4)
    };
  }



  private async applyWorkflow(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { workflowType, sceneIds } = command.parameters;

    if (!sceneIds || sceneIds.length === 0) {
      return this.createErrorResult('No scenes available for workflow application', []);
    }

    const actions: string[] = [];

    try {
      switch (workflowType) {
        case 'podcast':
          // Podcast workflow: audio processing + subtitles
          for (let i = 0; i < sceneIds.length; i++) {
            context.onAddAIAgent('audio-processor');
            context.onAddAIAgent('subtitle-generator');
            context.onAddAIAgent('noise-reducer');
            actions.push(`Applied podcast workflow to scene ${i + 1}`);
          }
          return {
            success: true,
            response: `🎙️ Applied podcast workflow to ${sceneIds.length} scenes:\n\n• Audio enhancement and noise reduction\n• Automatic subtitle generation\n• Audio level normalization\n\nOptimal for podcast and interview content.`,
            actions,
            suggestions: [
              'Review audio levels in each scene',
              'Edit subtitles for accuracy',
              'Add intro/outro scenes if needed'
            ]
          };

        case 'social_media':
          // Social media workflow: quick enhancement + subtitles
          for (let i = 0; i < sceneIds.length; i++) {
            context.onAddAIAgent('video-enhancer');
            context.onAddAIAgent('subtitle-generator');
            context.onAddAIAgent('color-grader');
            actions.push(`Applied social media workflow to scene ${i + 1}`);
          }
          return {
            success: true,
            response: `📱 Applied social media workflow to ${sceneIds.length} scenes:\n\n• Video quality enhancement\n• Color grading for engagement\n• Subtitle generation for accessibility\n\nOptimized for social media platforms.`,
            actions,
            suggestions: [
              'Consider adding text overlays',
              'Optimize for vertical format if needed',
              'Add engaging thumbnails'
            ]
          };

        case 'professional':
          // Professional workflow: comprehensive enhancement
          for (let i = 0; i < sceneIds.length; i++) {
            context.onAddAIAgent('video-enhancer');
            context.onAddAIAgent('audio-processor');
            context.onAddAIAgent('color-grader');
            context.onAddAIAgent('noise-reducer');
            context.onAddAIAgent('content-analyzer');
            actions.push(`Applied professional workflow to scene ${i + 1}`);
          }
          return {
            success: true,
            response: `🎬 Applied professional workflow to ${sceneIds.length} scenes:\n\n• Comprehensive video enhancement\n• Professional audio processing\n• Advanced color grading\n• Content analysis and optimization\n\nSuitable for high-quality productions.`,
            actions,
            suggestions: [
              'Review all processing results',
              'Fine-tune color grading settings',
              'Add professional transitions'
            ]
          };

        default:
          return this.createErrorResult(`Unknown workflow type: ${workflowType}`, []);
      }
    } catch (error) {
      return this.createErrorResult(`Failed to apply workflow: ${error instanceof Error ? error.message : 'Unknown error'}`, actions);
    }
  }

  private async processAllScenes(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { sceneIds } = command.parameters;

    if (!sceneIds || sceneIds.length === 0) {
      return this.createErrorResult('No scenes available for processing', []);
    }

    const actions: string[] = [];

    try {
      // Apply comprehensive processing to all scenes
      for (let i = 0; i < sceneIds.length; i++) {
        context.onAddAIAgent('content-analyzer');
        context.onAddAIAgent('video-enhancer');
        context.onAddAIAgent('audio-processor');
        actions.push(`Applied full processing to scene ${i + 1}`);
      }

      return {
        success: true,
        response: `⚡ Started comprehensive processing for all ${sceneIds.length} scenes:\n\n• Content analysis and tagging\n• Video quality enhancement\n• Audio processing and optimization\n• Intelligent scene classification\n\nThis will provide a complete analysis and enhancement of your entire project.`,
        actions,
        suggestions: [
          'Monitor processing progress in AI Agents panel',
          'Review results when processing completes',
          'Apply additional specialized agents as needed'
        ]
      };
    } catch (error) {
      return this.createErrorResult(`Failed to process all scenes: ${error instanceof Error ? error.message : 'Unknown error'}`, actions);
    }
  }

  private async navigateToScene(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { sceneIndex, sceneId } = command.parameters;

    if (!context.currentAnalysisData) {
      return this.createErrorResult('No video project loaded', []);
    }

    if (sceneIndex < 0 || sceneIndex >= context.currentAnalysisData.scenes.length) {
      return this.createErrorResult(`Invalid scene number. Please specify a scene between 1 and ${context.currentAnalysisData.scenes.length}`, []);
    }

    const scene = context.currentAnalysisData.scenes[sceneIndex];

    // This would integrate with timeline/player controls in a real implementation
    return {
      success: true,
      response: `🎯 Navigated to Scene ${sceneIndex + 1}: "${scene.title}"\n\n⏱️ Duration: ${Math.round(scene.duration)}s (${scene.start}s - ${scene.end}s)\n🏷️ Tags: ${scene.tags.length > 0 ? scene.tags.join(', ') : 'No tags'}\n\nNote: Timeline navigation would be implemented with video player integration.`,
      actions: [`Navigated to scene ${sceneIndex + 1}`],
      suggestions: [
        'Edit this scene in timeline',
        'Add AI agents to this scene',
        'Analyze scene content'
      ]
    };
  }

  private async trimSceneBeginning(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { sceneIds, duration = 3 } = command.parameters;

    if (!sceneIds || sceneIds.length === 0) {
      return this.createErrorResult('No scenes specified for trimming', []);
    }

    const actions: string[] = [];

    try {
      // This would integrate with actual video editing functionality
      for (let i = 0; i < sceneIds.length; i++) {
        actions.push(`Trimmed ${duration} seconds from beginning of scene ${i + 1}`);
      }

      return {
        success: true,
        response: `✂️ Trimmed ${duration} seconds from the beginning of ${sceneIds.length} scene${sceneIds.length > 1 ? 's' : ''}.\n\nNote: This is a preview of the trimming operation. In a full implementation, this would modify the actual video timeline.`,
        actions,
        suggestions: [
          'Preview the trimmed scenes',
          'Undo the trimming if needed',
          'Apply similar trimming to other scenes'
        ]
      };
    } catch (error) {
      return this.createErrorResult('Failed to trim scenes', actions);
    }
  }

  private async respondToGreeting(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { hasProject, sceneCount } = command.parameters;

    let response = "👋 Hello! I'm your AI video editing assistant. ";

    if (hasProject && sceneCount > 0) {
      response += `I can see you have a project with ${sceneCount} scene${sceneCount > 1 ? 's' : ''} loaded. `;
      response += "I can help you:\n\n";
      response += "• Add AI agents to enhance your scenes\n";
      response += "• Generate subtitles automatically\n";
      response += "• Analyze content and improve quality\n";
      response += "• Create smooth transitions\n";
      response += "• Optimize your video for different platforms\n\n";
      response += "What would you like to work on first?";
    } else {
      response += "I'm ready to help you edit your videos! ";
      response += "Upload a video to get started, and I can:\n\n";
      response += "• Analyze your content automatically\n";
      response += "• Add AI-powered enhancements\n";
      response += "• Generate subtitles and captions\n";
      response += "• Optimize for different platforms\n\n";
      response += "Just say 'help' if you need to see all available commands!";
    }

    return {
      success: true,
      response,
      actions: ['Responded to greeting'],
      suggestions: hasProject ? [
        'Add subtitle agents to all scenes',
        'Analyze all scenes for content',
        'Enhance video quality'
      ] : [
        'Upload a video to get started',
        'Show me available commands',
        'Help me with video editing'
      ]
    };
  }

  private async showDebugInfo(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { hasProject, sceneCount, nodeCount } = command.parameters;

    // Check localStorage data
    const storedAnalysisData = localStorage.getItem('currentAnalysisData');
    const storedProjectData = localStorage.getItem('storyboard-optimized-project');
    const storedNodes = localStorage.getItem('storyboard-project-nodes');
    const storedEdges = localStorage.getItem('storyboard-project-edges');

    let response = "🔍 **Debug Information:**\n\n";

    response += `**Context Data:**\n`;
    response += `• Has Project: ${hasProject}\n`;
    response += `• Scene Count: ${sceneCount}\n`;
    response += `• Node Count: ${nodeCount}\n\n`;

    response += `**localStorage Data:**\n`;
    response += `• currentAnalysisData: ${storedAnalysisData ? 'EXISTS' : 'MISSING'}\n`;
    response += `• optimized-project: ${storedProjectData ? 'EXISTS' : 'MISSING'}\n`;
    response += `• project-nodes: ${storedNodes ? 'EXISTS' : 'MISSING'}\n`;
    response += `• project-edges: ${storedEdges ? 'EXISTS' : 'MISSING'}\n\n`;

    if (storedAnalysisData) {
      try {
        const parsed = JSON.parse(storedAnalysisData);
        response += `**Stored Analysis Data:**\n`;
        response += `• Analysis ID: ${parsed.analysisId || 'MISSING'}\n`;
        response += `• File Name: ${parsed.fileName || 'MISSING'}\n`;
        response += `• Scenes: ${parsed.scenes?.length || 0}\n`;
        response += `• Duration: ${parsed.metadata?.duration || 'MISSING'}s\n\n`;
      } catch (error) {
        response += `**Stored Analysis Data:** CORRUPTED\n\n`;
      }
    }

    if (storedProjectData) {
      try {
        const parsed = JSON.parse(storedProjectData);
        response += `**Stored Project Data:**\n`;
        response += `• Project ID: ${parsed.projectId || 'MISSING'}\n`;
        response += `• Analysis ID: ${parsed.analysisId || 'MISSING'}\n`;
        response += `• Video File: ${parsed.videoFileName || 'MISSING'}\n`;
        response += `• Scenes: ${parsed.scenes?.length || 0}\n\n`;
      } catch (error) {
        response += `**Stored Project Data:** CORRUPTED\n\n`;
      }
    }

    response += `**Recommendations:**\n`;
    if (!hasProject && !storedAnalysisData && !storedProjectData) {
      response += `• Upload and analyze a video to get started\n`;
    } else if (storedAnalysisData && !hasProject) {
      response += `• Try refreshing the page or clicking the refresh button\n`;
      response += `• The data exists but isn't being loaded properly\n`;
    } else if (hasProject && sceneCount === 0) {
      response += `• The project exists but has no scenes\n`;
      response += `• Try re-analyzing your video\n`;
    }

    return {
      success: true,
      response,
      actions: ['Generated debug information'],
      suggestions: [
        'Refresh project data',
        'Upload a new video',
        'Clear cache and restart'
      ]
    };
  }

  private async clearSubtitleDuplicates(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { hasProject, sceneCount } = command.parameters;

    let response = "🧹 **Clearing Subtitle Duplicates:**\n\n";

    try {
      // Import and use the timeline integration service
      const { timelineIntegrationService } = await import('./timelineIntegrationService');

      // Clear all subtitle duplicate tracking keys
      timelineIntegrationService.clearAllSubtitleDuplicates();

      // Also clear any subtitle items from the timeline state
      const timelineState = localStorage.getItem('timeline-state');
      let clearedItems = 0;

      if (timelineState) {
        try {
          const parsed = JSON.parse(timelineState);
          if (parsed.tracks) {
            for (const track of parsed.tracks) {
              if (track.items) {
                const originalLength = track.items.length;
                track.items = track.items.filter((item: any) => item.type !== 'caption');
                clearedItems += originalLength - track.items.length;
              }
            }

            if (clearedItems > 0) {
              localStorage.setItem('timeline-state', JSON.stringify(parsed));
              response += `✅ Removed ${clearedItems} duplicate subtitle items from timeline\n`;
            }
          }
        } catch (error) {
          response += `⚠️ Could not clean timeline state: ${error}\n`;
        }
      }

      response += `✅ Cleared all subtitle duplicate tracking keys\n`;
      response += `✅ Timeline is now ready for fresh subtitle generation\n\n`;

      if (hasProject && sceneCount > 0) {
        response += `**Next Steps:**\n`;
        response += `• You can now safely add subtitle agents to scenes\n`;
        response += `• Each scene will only get one set of subtitles\n`;
        response += `• Try: "Add subtitle agents to all scenes"\n`;
      } else {
        response += `**Note:** No project data found. Upload and analyze a video first.\n`;
      }

      return {
        success: true,
        response,
        actions: [`Cleared subtitle duplicates (${clearedItems} items removed)`],
        suggestions: [
          'Add subtitle agents to all scenes',
          'Upload a new video',
          'Check debug info'
        ]
      };

    } catch (error) {
      return {
        success: false,
        response: `❌ Failed to clear subtitle duplicates: ${error}`,
        actions: [],
        suggestions: [
          'Try refreshing the page',
          'Check debug info',
          'Upload a new video'
        ]
      };
    }
  }

  private async forceRefreshProject(command: ParsedCommand, context: ExecutionContext): Promise<ExecutionResult> {
    const { hasProject, sceneCount, nodeCount } = command.parameters;

    let response = "🔄 **Force Refreshing Project Data:**\n\n";

    try {
      // Trigger the refresh function from context if available
      if (context.onRefreshProject) {
        await context.onRefreshProject();
        response += `✅ Project refresh triggered successfully\n`;
      } else {
        response += `⚠️ Refresh function not available, trying manual refresh...\n`;
      }

      // Check localStorage for current data
      const storedAnalysisData = localStorage.getItem('currentAnalysisData');
      const storedProjectData = localStorage.getItem('storyboard-optimized-project');

      if (storedAnalysisData) {
        try {
          const parsed = JSON.parse(storedAnalysisData);
          response += `📊 Found analysis data: ${parsed.scenes?.length || 0} scenes\n`;
          if (parsed.scenes?.length > 0) {
            response += `   Scene IDs: ${parsed.scenes.map((s: any) => s.sceneId).join(', ')}\n`;
          }
        } catch (error) {
          response += `❌ Analysis data corrupted\n`;
        }
      }

      if (storedProjectData) {
        try {
          const parsed = JSON.parse(storedProjectData);
          response += `📊 Found project data: ${parsed.scenes?.length || 0} scenes\n`;
          if (parsed.scenes?.length > 0) {
            response += `   Scene IDs: ${parsed.scenes.map((s: any) => s.sceneId).join(', ')}\n`;
          }
        } catch (error) {
          response += `❌ Project data corrupted\n`;
        }
      }

      response += `\n**Current State:**\n`;
      response += `• Context has project: ${hasProject}\n`;
      response += `• Context scene count: ${sceneCount}\n`;
      response += `• Node count: ${nodeCount}\n\n`;

      // Force trigger a window event to refresh data
      window.dispatchEvent(new CustomEvent('projectDataUpdated'));
      response += `🔄 Triggered projectDataUpdated event\n\n`;

      if (!hasProject || sceneCount === 0) {
        response += `**Recommendations:**\n`;
        response += `• Try clicking the refresh button (🔄) in the AI panel header\n`;
        response += `• Check if you have uploaded and analyzed a video\n`;
        response += `• Try: "debug" to see detailed information\n`;
        response += `• If you have video data, try: "clear subtitle duplicates"\n`;
      } else {
        response += `**Success!** Project data is now available.\n`;
      }

      return {
        success: true,
        response,
        actions: ['Triggered project refresh'],
        suggestions: [
          'Check debug info',
          'Analyze all scenes for content',
          'Add subtitle agents to all scenes'
        ]
      };

    } catch (error) {
      return {
        success: false,
        response: `❌ Failed to refresh project: ${error}`,
        actions: [],
        suggestions: [
          'Try refreshing the page',
          'Upload a new video',
          'Check debug info'
        ]
      };
    }
  }
}

// Singleton instance
export const commandExecutor = new CommandExecutor();
