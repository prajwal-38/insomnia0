// src/services/geminiService.ts

import type { AIAgentType, AIProcessingResult } from '../types';

// Gemini API configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

interface GeminiRequest {
  contents: {
    parts: {
      text: string;
    }[];
  }[];
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
    finishReason: string;
  }[];
}

// AI Agent processing prompts for different agent types
const AI_AGENT_PROMPTS: Record<AIAgentType, string> = {
  'video-enhancer': `You are a video enhancement AI agent. Analyze the provided video scene data and suggest specific enhancements like:
- Resolution upscaling recommendations
- Stabilization needs
- Noise reduction requirements
- Frame rate optimization
- Quality improvement suggestions
Provide actionable recommendations in JSON format.`,

  'audio-processor': `You are an audio processing AI agent. Analyze the provided audio/video scene data and suggest:
- Noise reduction techniques
- Audio enhancement methods
- Volume normalization
- Audio quality improvements
- Background noise removal
Provide specific audio processing recommendations in JSON format.`,

  'content-analyzer': `You are a content analysis AI agent. Analyze the provided video scene and identify:
- Objects and people in the scene
- Scene composition and framing
- Visual elements and themes
- Emotional tone and mood
- Key visual features
Provide detailed content analysis in JSON format.`,

  'auto-editor': `You are an automated video editing AI agent. Analyze the provided scene and suggest:
- Optimal cut points
- Transition recommendations
- Pacing improvements
- Scene arrangement suggestions
- Editing techniques
Provide editing recommendations in JSON format.`,

  'subtitle-generator': `This agent will use Web Speech API or Whisper to transcribe actual audio from the video and generate real subtitles with accurate timing.`,

  'color-grader': `You are a color grading AI agent. Analyze the provided video scene and suggest:
- Color correction recommendations
- Grading techniques
- Mood enhancement through color
- Lighting adjustments
- Visual style improvements
Provide color grading recommendations in JSON format.`,

  'object-detector': `You are an object detection AI agent. Analyze the provided video scene and identify:
- All visible objects
- People and their positions
- Text elements
- Brands or logos
- Important visual elements
Provide object detection results in JSON format.`,

  'scene-classifier': `You are a scene classification AI agent. Analyze the provided video scene and classify:
- Scene type (indoor/outdoor, setting)
- Activity or action taking place
- Genre or category
- Mood and atmosphere
- Technical characteristics
Provide scene classification in JSON format.`,

  'transition-suggester': `You are a transition suggestion AI agent. Analyze the provided video scenes and suggest:
- Optimal transition types between scenes
- Transition timing
- Creative transition ideas
- Smooth flow recommendations
- Professional transition techniques
Provide transition suggestions in JSON format.`,

  'noise-reducer': `You are a noise reduction AI agent. Analyze the provided video/audio scene and suggest:
- Video noise reduction techniques
- Audio noise removal methods
- Quality enhancement strategies
- Artifact removal suggestions
- Clean-up recommendations
Provide noise reduction recommendations in JSON format.`
};

export class GeminiService {
  private apiKey: string;

  constructor() {
    this.apiKey = GEMINI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Gemini API key not found. AI agent processing will be limited.');
    }
  }

  async processWithAI(
    agentType: AIAgentType,
    sceneData: any,
    agentId: string,
    sourceSceneId: string
  ): Promise<AIProcessingResult> {
    const startTime = Date.now();

    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const prompt = this.buildPrompt(agentType, sceneData);
      const response = await this.callGeminiAPI(prompt);
      const result = this.parseResponse(response);

      const processingTime = Date.now() - startTime;

      return {
        agentId,
        agentType,
        sourceSceneId,
        result,
        metadata: {
          processedAt: Date.now(),
          processingTime,
          model: 'gemini-1.5-flash-latest',
          confidence: this.calculateConfidence(result)
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        agentId,
        agentType,
        sourceSceneId,
        result: null,
        metadata: {
          processedAt: Date.now(),
          processingTime,
          model: 'gemini-1.5-flash-latest'
        },
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private buildPrompt(agentType: AIAgentType, sceneData: any): string {
    let basePrompt = AI_AGENT_PROMPTS[agentType];

    // For subtitle generator, customize the prompt with scene data
    if (agentType === 'subtitle-generator') {
      const duration = sceneData?.endTime - sceneData?.startTime || 5;
      const title = sceneData?.title || 'Video scene';

      basePrompt = `Generate realistic subtitles for this video scene:
Scene duration: ${duration} seconds
Scene title: ${title}

Create 3-5 subtitle cues with natural speech patterns. Each subtitle should be 1-3 seconds long.

Return ONLY a JSON object with this exact structure:
{
  "subtitles": [
    {"startTime": 0, "endTime": 2.5, "text": "Welcome to this video"},
    {"startTime": 3, "endTime": 5.5, "text": "Let's explore the content"}
  ],
  "language": "en",
  "confidence": 0.95,
  "type": "subtitle-generation"
}`;
    }

    const sceneInfo = JSON.stringify(sceneData, null, 2);

    return `${basePrompt}

Scene Data:
${sceneInfo}

Please analyze this scene data and provide your recommendations in valid JSON format. Ensure your response is structured and actionable.`;
  }

  private async callGeminiAPI(prompt: string): Promise<GeminiResponse> {
    const request: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  private parseResponse(response: GeminiResponse): any {
    try {
      const text = response.candidates[0]?.content?.parts[0]?.text;
      if (!text) {
        throw new Error('No response text from Gemini API');
      }

      // Try to extract JSON from the response with better error handling
      const jsonMatches = [
        text.match(/```json\s*([\s\S]*?)\s*```/), // Markdown JSON blocks
        text.match(/```\s*([\s\S]*?)\s*```/),     // Generic code blocks
        text.match(/\{[\s\S]*\}/),                // Any JSON-like content
      ];

      for (const match of jsonMatches) {
        if (match) {
          const jsonText = match[1] || match[0];
          try {
            return JSON.parse(jsonText);
          } catch (parseError) {
            console.log('Failed to parse JSON match:', jsonText.substring(0, 100));
          }
        }
      }

      // If no JSON found, return the raw text in a structured format
      return {
        analysis: text,
        summary: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        confidence: 0.8,
        type: 'text_response'
      };
    } catch (error) {
      console.warn('Failed to parse Gemini response:', error);
      return {
        analysis: response.candidates[0]?.content?.parts[0]?.text || 'No analysis available',
        parseError: true,
        confidence: 0.3
      };
    }
  }

  private calculateConfidence(result: any): number {
    // Simple confidence calculation based on result completeness
    if (!result || result.parseError) return 0.3;
    
    const keys = Object.keys(result);
    if (keys.length === 0) return 0.2;
    if (keys.length < 3) return 0.6;
    if (keys.length < 5) return 0.8;
    return 0.9;
  }

  // New method specifically for chatbot intent recognition
  async parseIntent(prompt: string): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      console.log('🧠 Calling Gemini API for intent recognition...');
      const response = await this.callGeminiAPI(prompt);
      const result = this.parseResponse(response);

      console.log('✅ Gemini API response received:', result);
      return { result, success: true };
    } catch (error) {
      console.error('❌ Gemini API intent parsing failed:', error);
      return {
        result: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Test connection to Gemini API
  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }

      const testPrompt = 'Respond with "OK" if you can process this request.';
      await this.callGeminiAPI(testPrompt);
      return true;
    } catch (error) {
      console.error('Gemini API connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const geminiService = new GeminiService();
