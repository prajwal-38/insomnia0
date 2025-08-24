// src/components/AIAgentsPanel.tsx

import React, { useState } from 'react';
import type { AIAgentType } from '../types';
import './AIAgentsPanel.css';

// AI Agent definitions with detailed descriptions
const AI_AGENTS: Array<{
  type: AIAgentType;
  name: string;
  icon: string;
  description: string;
  category: 'enhancement' | 'analysis' | 'editing' | 'audio';
  color: string;
}> = [
  {
    type: 'video-enhancer',
    name: 'Video Enhancer',
    icon: '🎬',
    description: 'Upscale resolution, stabilize footage, and improve video quality',
    category: 'enhancement',
    color: '#4CAF50'
  },
  {
    type: 'audio-processor',
    name: 'Audio Processor',
    icon: '🎵',
    description: 'Enhance audio quality, reduce noise, and normalize volume',
    category: 'audio',
    color: '#2196F3'
  },
  {
    type: 'content-analyzer',
    name: 'Content Analyzer',
    icon: '🔍',
    description: 'Analyze scene content, identify objects, and extract metadata',
    category: 'analysis',
    color: '#FF9800'
  },
  {
    type: 'auto-editor',
    name: 'Auto Editor',
    icon: '✂️',
    description: 'Suggest cuts, transitions, and automated editing improvements',
    category: 'editing',
    color: '#9C27B0'
  },
  {
    type: 'subtitle-generator',
    name: 'Subtitle Generator',
    icon: '💬',
    description: 'Generate accurate subtitles and captions automatically',
    category: 'analysis',
    color: '#607D8B'
  },
  {
    type: 'color-grader',
    name: 'Color Grader',
    icon: '🎨',
    description: 'Enhance colors, adjust lighting, and improve visual aesthetics',
    category: 'enhancement',
    color: '#E91E63'
  },
  {
    type: 'object-detector',
    name: 'Object Detector',
    icon: '👁️',
    description: 'Detect and identify objects, people, and elements in scenes',
    category: 'analysis',
    color: '#FF5722'
  },
  {
    type: 'scene-classifier',
    name: 'Scene Classifier',
    icon: '🏷️',
    description: 'Classify scenes by type, mood, and content characteristics',
    category: 'analysis',
    color: '#795548'
  },
  {
    type: 'transition-suggester',
    name: 'Transition Suggester',
    icon: '🔄',
    description: 'Recommend optimal transitions between video scenes',
    category: 'editing',
    color: '#00BCD4'
  },
  {
    type: 'noise-reducer',
    name: 'Noise Reducer',
    icon: '🔇',
    description: 'Remove video and audio noise for cleaner footage',
    category: 'enhancement',
    color: '#8BC34A'
  },
  {
    type: 'audio-translator',
    name: 'Audio Translator',
    icon: '🌐',
    description: 'Translate video audio to different languages with voice synthesis',
    category: 'audio',
    color: '#FF6B35'
  }
];

const CATEGORIES = {
  enhancement: { name: 'Enhancement', icon: '✨' },
  analysis: { name: 'Analysis', icon: '🔍' },
  editing: { name: 'Editing', icon: '✂️' },
  audio: { name: 'Audio', icon: '🎵' }
};

interface AIAgentsPanelProps {
  onAddAIAgent: (agentType: AIAgentType) => void;
  geminiApiConnected: boolean;
}

const AIAgentsPanel: React.FC<AIAgentsPanelProps> = ({ 
  onAddAIAgent, 
  geminiApiConnected 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAgents = AI_AGENTS.filter(agent => {
    const matchesCategory = !selectedCategory || agent.category === selectedCategory;
    const matchesSearch = !searchTerm || 
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });



  const handleAddAgent = (agentType: AIAgentType) => {
    // Note: Removed API connection check to allow adding AI agents without API connection
    // The API connection will be tested only when actual processing is needed
    onAddAIAgent(agentType);
  };

  return (
    <div className="ai-agents-panel">
      <div className="ai-agents-header">
        <h4>🤖 AI Agents</h4>
        {!geminiApiConnected && (
          <div className="api-warning">
            ℹ️ API will be tested when processing starts
          </div>
        )}
      </div>

      {/* Search */}
      <div className="ai-agents-search">
        <input
          type="text"
          placeholder="Search AI agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Category Filter */}
      <div className="category-filter">
        <button
          className={`category-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {Object.entries(CATEGORIES).map(([key, category]) => (
          <button
            key={key}
            className={`category-btn ${selectedCategory === key ? 'active' : ''}`}
            onClick={() => setSelectedCategory(key)}
          >
            {category.icon} {category.name}
          </button>
        ))}
      </div>

      {/* AI Agents List */}
      <div className="ai-agents-list">
        {filteredAgents.length === 0 ? (
          <div className="no-agents">
            No AI agents match your search criteria.
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <div
              key={agent.type}
              className="ai-agent-item"
              onClick={() => handleAddAgent(agent.type)}
              style={{ borderLeftColor: agent.color }}
            >
              <div className="agent-icon" style={{ color: agent.color }}>
                {agent.icon}
              </div>
              <div className="agent-info">
                <div className="agent-name">{agent.name}</div>
                <div className="agent-description">{agent.description}</div>
              </div>
              <div className="agent-add-btn" style={{ backgroundColor: agent.color }}>
                +
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="ai-agents-instructions">
        <h5>How to use AI Agents:</h5>
        <ol>
          <li>Drag an AI agent to the canvas</li>
          <li>Connect it to video scene nodes</li>
          <li>The agent will automatically process the connected scenes</li>
          <li>View results in the timeline and node details</li>
        </ol>
        
        <div className="edge-purpose-info">
          <h5>🔗 Edge Connections:</h5>
          <p>Edges now represent data flow between video scenes and AI agents. When you connect a scene to an AI agent, the agent will process that scene's video data and apply its specialized analysis or enhancement.</p>
        </div>
      </div>
    </div>
  );
};

export default AIAgentsPanel;
