// src/services/chatbotService.ts
import type { ApiAnalysisResponse, AIAgentType } from '../types';
import type { AppNodeType } from '../App';
import { geminiService } from './geminiService';

export interface ChatContext {
  currentAnalysisData: ApiAnalysisResponse | null;
  nodes: AppNodeType[];
  selectedScenes: string[];
}

export interface ParsedCommand {
  intent: string;
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  originalText: string;
}

export interface CommandPattern {
  pattern: RegExp;
  intent: string;
  action: string;
  extractParams: (match: RegExpMatchArray, context: ChatContext) => Record<string, any>;
}

// Command patterns for natural language processing
const COMMAND_PATTERNS: CommandPattern[] = [
  // AI Agent Commands - More flexible patterns
  {
    pattern: /add\s+(subtitle|audio|video|content|color|object|scene|transition|noise)\s*(?:agent|processor|enhancer|analyzer|grader|detector|classifier|suggester|reducer)?s?\s*(?:to|for|on)?\s*(?:scene\s*)?(\d+|all|every|each|scenes)?/i,
    intent: 'add_ai_agent',
    action: 'add_agent_to_scene',
    extractParams: (match, context) => {
      const agentTypeMap: Record<string, AIAgentType> = {
        'subtitle': 'subtitle-generator',
        'audio': 'audio-processor',
        'video': 'video-enhancer',
        'content': 'content-analyzer',
        'color': 'color-grader',
        'object': 'object-detector',
        'scene': 'scene-classifier',
        'transition': 'transition-suggester',
        'noise': 'noise-reducer'
      };

      const agentType = agentTypeMap[match[1].toLowerCase()] || 'content-analyzer';
      const target = match[2] ? match[2].toLowerCase() : 'all';

      let sceneIds: string[] = [];
      if (target === 'all' || target === 'every' || target === 'each' || target === 'scenes' || !target) {
        sceneIds = context.currentAnalysisData?.scenes.map(s => s.sceneId) || [];
      } else if (!isNaN(parseInt(target))) {
        const sceneIndex = parseInt(target) - 1;
        const scene = context.currentAnalysisData?.scenes[sceneIndex];
        if (scene) sceneIds = [scene.sceneId];
      }

      return { agentType, sceneIds, target: target || 'all' };
    }
  },
  
  // Scene Manipulation Commands
  {
    pattern: /(?:create|add|make)\s+(?:a\s+)?(?:new\s+)?scene\s*(?:after|before)?\s*(?:scene\s*)?(\d+)?/i,
    intent: 'create_scene',
    action: 'create_new_scene',
    extractParams: (match, context) => {
      const position = match[1] ? parseInt(match[1]) : (context.currentAnalysisData?.scenes.length || 0) + 1;
      return { position };
    }
  },
  
  {
    pattern: /(?:delete|remove)\s+scene\s*(\d+)/i,
    intent: 'delete_scene',
    action: 'delete_scene',
    extractParams: (match) => {
      const sceneNumber = parseInt(match[1]);
      const sceneIndex = sceneNumber - 1;
      console.log('🗑️ Delete scene pattern matched:', { match: match[0], sceneNumber, sceneIndex });
      return { sceneIndex };
    }
  },
  
  // Enhancement Commands
  {
    pattern: /enhance\s+(?:video\s+)?quality\s*(?:for|of)?\s*(?:all\s+scenes|scene\s*(\d+)|everything)?/i,
    intent: 'enhance_quality',
    action: 'enhance_video_quality',
    extractParams: (match, context) => {
      if (match[1]) {
        const sceneIndex = parseInt(match[1]) - 1;
        const scene = context.currentAnalysisData?.scenes[sceneIndex];
        return { sceneIds: scene ? [scene.sceneId] : [] };
      }
      return { sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || [] };
    }
  },
  
  // Analysis Commands - More flexible patterns
  {
    pattern: /(?:analyze|show|tell me about)\s+(?:all\s+)?(?:(\d+)\s+)?(?:scene|scenes|content|project|video)/i,
    intent: 'analyze_content',
    action: 'analyze_scenes',
    extractParams: (match, context) => {
      if (match[1]) {
        const sceneIndex = parseInt(match[1]) - 1;
        const scene = context.currentAnalysisData?.scenes[sceneIndex];
        return { sceneIds: scene ? [scene.sceneId] : [], specific: true };
      }
      return { sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || [], specific: false };
    }
  },
  
  // Statistics Commands
  {
    pattern: /(?:show|get|display)\s+(?:me\s+)?(?:scene\s+)?(?:statistics|stats|info|information)/i,
    intent: 'show_statistics',
    action: 'display_project_stats',
    extractParams: (match, context) => ({
      sceneCount: context.currentAnalysisData?.scenes.length || 0,
      totalDuration: context.currentAnalysisData?.metadata.duration || 0
    })
  },
  
  // Help Commands
  {
    pattern: /(?:help|what can you do|commands|how to)/i,
    intent: 'help',
    action: 'show_help',
    extractParams: () => ({})
  },
  
  // Batch Operations - More comprehensive patterns
  {
    pattern: /(?:add\s+subtitles?\s+(?:to\s+)?(?:all|every|each)|subtitle\s+(?:all\s+)?scenes?|generate\s+subtitles?\s+(?:for\s+)?(?:everything|all))/i,
    intent: 'batch_subtitles',
    action: 'add_subtitles_to_all',
    extractParams: (match, context) => ({
      sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || []
    })
  },

  // Additional flexible patterns for common commands
  {
    pattern: /(?:subtitle\s+agents?\s+to\s+all|add.*subtitle.*all)/i,
    intent: 'batch_subtitles',
    action: 'add_subtitles_to_all',
    extractParams: (match, context) => ({
      sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || []
    })
  },

  // Workflow automation patterns
  {
    pattern: /(?:prepare|setup|optimize)\s+(?:for\s+)?(podcast|social\s+media|youtube|professional|quick\s+edit)/i,
    intent: 'workflow_automation',
    action: 'apply_workflow',
    extractParams: (match, context) => ({
      workflowType: match[1].toLowerCase().replace(/\s+/g, '_'),
      sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || []
    })
  },

  // Advanced batch operations
  {
    pattern: /(?:process|enhance|improve)\s+(?:all|everything|entire\s+project)/i,
    intent: 'batch_processing',
    action: 'process_all_scenes',
    extractParams: (match, context) => ({
      sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || []
    })
  },

  // Timeline operations
  {
    pattern: /(?:play|start|begin)\s+(?:from\s+)?(?:scene\s*)?(\d+)|(?:jump\s+to|go\s+to)\s+(?:scene\s*)?(\d+)/i,
    intent: 'timeline_control',
    action: 'navigate_to_scene',
    extractParams: (match, context) => {
      const sceneNumber = parseInt(match[1] || match[2]) - 1;
      const scene = context.currentAnalysisData?.scenes[sceneNumber];
      return { sceneIndex: sceneNumber, sceneId: scene?.sceneId };
    }
  },

  // Trimming and editing operations
  {
    pattern: /(?:trim|cut|remove)\s+(?:the\s+)?(?:first|beginning)\s+(?:(\d+)\s+)?(?:few\s+)?seconds?/i,
    intent: 'edit_scene',
    action: 'trim_beginning',
    extractParams: (match, context) => ({
      sceneIds: context.currentAnalysisData?.scenes.map(s => s.sceneId) || [],
      trimType: 'beginning',
      duration: match[1] ? parseInt(match[1]) : 3 // Use specified duration or default 3 seconds
    })
  },

  // Conversational patterns
  {
    pattern: /^(?:hi|hello|hey|greetings?)(?:\s+there)?[!.]?$/i,
    intent: 'greeting',
    action: 'respond_greeting',
    extractParams: (match, context) => ({
      hasProject: !!context.currentAnalysisData,
      sceneCount: context.currentAnalysisData?.scenes.length || 0
    })
  },

  // Debug patterns
  {
    pattern: /^(?:debug|check\s+data|show\s+debug|status)$/i,
    intent: 'debug',
    action: 'show_debug_info',
    extractParams: (match, context) => ({
      hasProject: !!context.currentAnalysisData,
      sceneCount: context.currentAnalysisData?.scenes.length || 0,
      nodeCount: context.nodes.length
    })
  },

  // Clear subtitle duplicates
  {
    pattern: /^(?:clear\s+subtitle\s+duplicates|fix\s+subtitle\s+duplicates|remove\s+duplicate\s+subtitles)$/i,
    intent: 'maintenance',
    action: 'clear_subtitle_duplicates',
    extractParams: (match, context) => ({
      hasProject: !!context.currentAnalysisData,
      sceneCount: context.currentAnalysisData?.scenes.length || 0
    })
  },

  // Force refresh project data
  {
    pattern: /^(?:refresh\s+project|reload\s+project|force\s+refresh|fix\s+scene\s+count)$/i,
    intent: 'maintenance',
    action: 'force_refresh_project',
    extractParams: (match, context) => ({
      hasProject: !!context.currentAnalysisData,
      sceneCount: context.currentAnalysisData?.scenes.length || 0,
      nodeCount: context.nodes.length
    })
  }
];

export class ChatbotService {
  async parseCommand(input: string, context: ChatContext): Promise<ParsedCommand> {
    const normalizedInput = input.trim().toLowerCase();

    console.log('🔍 ChatbotService: Parsing command:', input);
    console.log('🔍 ChatbotService: Context has scenes:', context.currentAnalysisData?.scenes?.length || 0);

    // First try regex patterns for reliable parsing of specific commands
    for (const pattern of COMMAND_PATTERNS) {
      const match = normalizedInput.match(pattern.pattern);
      if (match) {
        const parameters = pattern.extractParams(match, context);
        console.log('📝 Regex pattern matched:', pattern.intent, parameters);
        return {
          intent: pattern.intent,
          action: pattern.action,
          parameters,
          confidence: 0.9, // High confidence for regex matches
          originalText: input
        };
      }
    }

    // Try Gemini AI for general conversation and complex commands
    try {
      console.log('🧠 Using Gemini AI for general conversation...');
      const aiResult = await this.parseWithAI(input, context);
      if (aiResult.confidence > 0.6) {
        return aiResult;
      }
    } catch (error) {
      console.warn('⚠️ Gemini AI failed, using fallback:', error);
    }

    // Final fallback if both regex and AI fail
    console.warn('🤷 No patterns matched, using fallback command');
    return this.createFallbackCommand(input);
  }
  
  private async parseWithAI(input: string, context: ChatContext): Promise<ParsedCommand> {
    const contextInfo = this.buildContextInfo(context);

    const prompt = `You are an AI assistant for "Insomnia" - an advanced AI-powered video editing platform. You help users edit videos, manage scenes, and apply AI enhancements.

PLATFORM CONTEXT:
- This is a professional video editing application called "Insomnia"
- Users can upload videos that get automatically segmented into scenes
- AI agents can be applied to scenes for various enhancements (subtitles, audio processing, video enhancement, etc.)
- The platform has a node-based interface where scenes and AI agents are connected visually
- Users can view their project in both Story (node graph) and Timeline views

CURRENT PROJECT:
${contextInfo}

USER MESSAGE: "${input}"

RESPONSE INSTRUCTIONS:
1. If the user is asking for a SPECIFIC VIDEO EDITING ACTION, respond with a command JSON
2. If the user is having a GENERAL CONVERSATION, respond with a conversational JSON
3. Be helpful, friendly, and knowledgeable about video editing

For COMMANDS, use these actions:
- add_agent_to_scene: Add AI agents (subtitle-generator, video-enhancer, audio-processor, content-analyzer, color-grader, object-detector, scene-classifier, transition-suggester, noise-reducer)
- create_new_scene, delete_scene, enhance_video_quality, analyze_scenes, display_project_stats, show_help, add_subtitles_to_all

For CONVERSATION, use action: "general_conversation"

Return ONLY valid JSON in this exact format:
{
  "intent": "command" or "conversation",
  "action": "string",
  "parameters": {
    "agentType": "string (if applicable)",
    "sceneIds": ["array of scene IDs or 'all'"],
    "targetScenes": "string or array",
    "specific": boolean
  },
  "confidence": number,
  "response": "conversational response for general chat (only if intent is conversation)",
  "reasoning": "brief explanation"
}`;

    const response = await geminiService.parseIntent(prompt);

    if (response.result && typeof response.result === 'object') {
      const result = response.result;

      // Validate and enhance the response
      const intent = result.intent || 'unknown';
      const action = result.action || this.mapIntentToAction(intent);
      const parameters = result.parameters || {};
      const confidence = Math.min(Math.max(result.confidence || 0.5, 0), 1); // Clamp between 0-1

      // Log the AI reasoning for debugging
      if (result.reasoning) {
        console.log('🧠 Gemini reasoning:', result.reasoning);
      }

      // Handle conversational responses
      if (intent === 'conversation' && result.response) {
        return {
          intent: 'conversation',
          action: 'general_conversation',
          parameters: { response: result.response },
          confidence,
          originalText: input
        };
      }

      return {
        intent,
        action,
        parameters,
        confidence,
        originalText: input
      };
    }

    throw new Error('Invalid AI response format');
  }

  private mapIntentToAction(intent: string): string {
    const intentActionMap: Record<string, string> = {
      'add_ai_agent': 'add_agent_to_scene',
      'create_scene': 'create_new_scene',
      'delete_scene': 'delete_scene',
      'enhance_quality': 'enhance_video_quality',
      'analyze_content': 'analyze_scenes',
      'show_statistics': 'display_project_stats',
      'help': 'show_help',
      'batch_subtitles': 'add_subtitles_to_all',
      'apply_workflow': 'apply_workflow',
      'navigate_to_scene': 'navigate_to_scene',
      'conversation': 'general_conversation'
    };

    return intentActionMap[intent] || 'general_conversation';
  }

  private buildContextInfo(context: ChatContext): string {
    const info: string[] = [];
    
    if (context.currentAnalysisData) {
      info.push(`Video: ${context.currentAnalysisData.fileName}`);
      info.push(`Scenes: ${context.currentAnalysisData.scenes.length}`);
      info.push(`Duration: ${Math.round(context.currentAnalysisData.metadata.duration)}s`);
      
      if (context.currentAnalysisData.scenes.length > 0) {
        info.push(`Scene titles: ${context.currentAnalysisData.scenes.map((s, i) => `${i+1}. ${s.title}`).join(', ')}`);
      }
    } else {
      info.push('No video currently loaded');
    }
    
    const aiAgentNodes = context.nodes.filter(n => n.data.type === 'ai-agent');
    if (aiAgentNodes.length > 0) {
      info.push(`Active AI agents: ${aiAgentNodes.length}`);
    }
    
    return info.join('\n');
  }
  
  private createFallbackCommand(input: string): ParsedCommand {
    // Enhanced keyword-based fallback with better pattern matching
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('help') || lowerInput.includes('what can you do') || lowerInput.includes('commands')) {
      return {
        intent: 'help',
        action: 'show_help',
        parameters: {},
        confidence: 0.8,
        originalText: input
      };
    }

    // Handle subtitle commands
    if (lowerInput.includes('subtitle')) {
      const sceneIds = this.extractSceneIdsFromText(lowerInput);
      return {
        intent: 'batch_subtitles',
        action: 'add_subtitles_to_all',
        parameters: { sceneIds },
        confidence: 0.7,
        originalText: input
      };
    }

    // Handle analysis commands
    if (lowerInput.includes('analyze') || lowerInput.includes('analysis')) {
      const sceneIds = this.extractSceneIdsFromText(lowerInput);
      return {
        intent: 'analyze_content',
        action: 'analyze_scenes',
        parameters: { sceneIds, specific: false },
        confidence: 0.7,
        originalText: input
      };
    }

    // Handle enhancement commands
    if (lowerInput.includes('enhance') || lowerInput.includes('improve') || lowerInput.includes('quality')) {
      const sceneIds = this.extractSceneIdsFromText(lowerInput);
      return {
        intent: 'enhance_quality',
        action: 'enhance_video_quality',
        parameters: { sceneIds },
        confidence: 0.7,
        originalText: input
      };
    }

    // Handle statistics commands
    if (lowerInput.includes('statistic') || lowerInput.includes('stats') || lowerInput.includes('info')) {
      return {
        intent: 'show_statistics',
        action: 'display_project_stats',
        parameters: {},
        confidence: 0.7,
        originalText: input
      };
    }

    // For general conversation, try to provide a helpful response
    if (lowerInput.includes('hello') || lowerInput.includes('hi') || lowerInput.includes('hey')) {
      return {
        intent: 'conversation',
        action: 'general_conversation',
        parameters: {
          response: "Hello! I'm your AI video editing assistant for Insomnia. I can help you add AI agents to scenes, enhance video quality, generate subtitles, and much more. What would you like to work on today?"
        },
        confidence: 0.8,
        originalText: input
      };
    }

    if (lowerInput.includes('thank') || lowerInput.includes('thanks')) {
      return {
        intent: 'conversation',
        action: 'general_conversation',
        parameters: {
          response: "You're welcome! I'm here to help make your video editing workflow smoother. Feel free to ask me anything about your project or how to use the AI agents!"
        },
        confidence: 0.8,
        originalText: input
      };
    }

    // Default to help for unclear requests
    return {
      intent: 'help',
      action: 'show_help',
      parameters: {},
      confidence: 0.5,
      originalText: input
    };
  }

  private extractSceneIdsFromText(input: string): string[] {
    // Extract scene IDs from text, defaulting to all scenes if none specified
    const sceneMatch = input.match(/scene\s*(\d+)/);
    if (sceneMatch) {
      const sceneIndex = parseInt(sceneMatch[1]) - 1;
      // We'll need context here, but for fallback, return empty array to be filled later
      return [];
    }

    if (input.includes('all') || input.includes('every') || input.includes('each')) {
      return []; // Will be filled with all scene IDs in the executor
    }

    return []; // Default to all scenes
  }
  
  // Get contextual suggestions based on current state
  getSuggestions(context: ChatContext): string[] {
    const suggestions: string[] = [];
    
    if (context.currentAnalysisData) {
      const sceneCount = context.currentAnalysisData.scenes.length;
      suggestions.push(
        `Add subtitle agent to scene 1`,
        `Enhance video quality for all ${sceneCount} scenes`,
        `Analyze content in all scenes`,
        `Show me project statistics`
      );
      
      if (sceneCount > 1) {
        suggestions.push(`Create smooth transitions between scenes`);
      }
    } else {
      suggestions.push(
        'Help me get started',
        'What can you do?',
        'Show available commands'
      );
    }
    
    return suggestions.slice(0, 5);
  }
}

// Singleton instance
export const chatbotService = new ChatbotService();
