// src/components/AIAgentNode.tsx

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { AIAgentNodeData, AIAgentType } from '../types';

// AI Agent icons and colors
const AI_AGENT_CONFIG: Record<AIAgentType, { icon: string; color: string; name: string }> = {
  'video-enhancer': { icon: '🎬', color: '#4CAF50', name: 'Video Enhancer' },
  'audio-processor': { icon: '🎵', color: '#2196F3', name: 'Audio Processor' },
  'content-analyzer': { icon: '🔍', color: '#FF9800', name: 'Content Analyzer' },
  'auto-editor': { icon: '✂️', color: '#9C27B0', name: 'Auto Editor' },
  'subtitle-generator': { icon: '💬', color: '#607D8B', name: 'Subtitle Generator' },
  'color-grader': { icon: '🎨', color: '#E91E63', name: 'Color Grader' },
  'object-detector': { icon: '👁️', color: '#FF5722', name: 'Object Detector' },
  'scene-classifier': { icon: '🏷️', color: '#795548', name: 'Scene Classifier' },
  'transition-suggester': { icon: '🔄', color: '#00BCD4', name: 'Transition Suggester' },
  'noise-reducer': { icon: '🔇', color: '#8BC34A', name: 'Noise Reducer' },
  'audio-translator': { icon: '🌐', color: '#FF6B35', name: 'Audio Translator' }
};

interface AIAgentNodeProps extends NodeProps {
  data: AIAgentNodeData & {
    onDeleteNode?: (id: string) => void;
    onProcessingStart?: (agentId: string) => void;
    onSettingsChange?: (agentId: string, settings: Record<string, any>) => void;
    isDimmed?: boolean;
    isSearchResultHighlight?: boolean;
  };
}

const AIAgentNode: React.FC<AIAgentNodeProps> = ({ id, data, selected = false }) => {
  // The data structure is different - we need to access aiAgentData
  const agentData = data.aiAgentData || data as any; // Fallback for compatibility
  const agentType = agentData.agentType;

  const config = AI_AGENT_CONFIG[agentType] || {
    icon: '🤖',
    color: '#666',
    name: agentData.agentName || 'Unknown Agent'
  };
  const { icon, color, name } = config;

  const getStatusIcon = () => {
    switch (agentData.status) {
      case 'processing':
        return '⏳';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⚪';
    }
  };

  const getStatusText = () => {
    switch (agentData.status) {
      case 'processing':
        return `Processing... ${agentData.processingProgress || 0}%`;
      case 'completed':
        return `Completed ${agentData.lastProcessed ? new Date(agentData.lastProcessed).toLocaleTimeString() : ''}`;
      case 'error':
        return `Error: ${agentData.error || 'Unknown error'}`;
      default:
        return 'Ready to process';
    }
  };

  const handleDelete = () => {
    if (data.onDeleteNode) {
      data.onDeleteNode(id);
    }
  };

  const handleProcessingStart = () => {
    if (data.onProcessingStart && agentData.status === 'idle') {
      data.onProcessingStart(id);
    }
  };

  const nodeClasses = [
    'ai-agent-node',
    selected ? 'selected' : '',
    data.isDimmed ? 'dimmed' : '',
    data.isSearchResultHighlight ? 'search-highlight' : '',
    agentData.status
  ].filter(Boolean).join(' ');

  return (
    <div className={nodeClasses} style={{ borderColor: color }}>
      {/* Input handle for receiving data from scene nodes */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="ai-agent-handle input-handle"
        style={{ backgroundColor: color }}
      />

      {/* Agent header */}
      <div className="ai-agent-header" style={{ backgroundColor: color }}>
        <span className="ai-agent-icon">{icon}</span>
        <span className="ai-agent-name">{name}</span>
        <button 
          className="ai-agent-delete-btn"
          onClick={handleDelete}
          title="Delete AI Agent"
        >
          ×
        </button>
      </div>

      {/* Agent body */}
      <div className="ai-agent-body">
        <div className="ai-agent-status">
          <span className="status-icon">{getStatusIcon()}</span>
          <span className="status-text">{getStatusText()}</span>
        </div>

        {agentData.status === 'processing' && agentData.processingProgress !== undefined && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${agentData.processingProgress}%`,
                backgroundColor: color
              }}
            />
          </div>
        )}

        {agentData.inputConnections && agentData.inputConnections.length > 0 && (
          <div className="input-connections">
            <small>Connected to {agentData.inputConnections.length} scene(s)</small>
          </div>
        )}

        {/* Translation-specific controls for audio-translator */}
        {agentType === 'audio-translator' && (
          <div className="translation-controls">
            <div className="control-group">
              <label className="control-label">Target Language:</label>
              <select
                className="control-select"
                value={agentData.settings?.targetLanguage || 'es'}
                onChange={(e) => {
                  if (data.onSettingsChange) {
                    data.onSettingsChange(id, { ...agentData.settings, targetLanguage: e.target.value });
                  }
                }}
              >
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="ru">Russian</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
            <div className="control-group">
              <label className="control-label">Voice:</label>
              <select
                className="control-select"
                value={agentData.settings?.voice || 'Kore'}
                onChange={(e) => {
                  if (data.onSettingsChange) {
                    data.onSettingsChange(id, { ...agentData.settings, voice: e.target.value });
                  }
                }}
              >
                <option value="Kore">Kore</option>
                <option value="Puck">Puck</option>
                <option value="Leda">Leda</option>
                <option value="Charon">Charon</option>
                <option value="Fenrir">Fenrir</option>
              </select>
            </div>
          </div>
        )}

        {agentData.status === 'idle' && agentData.inputConnections && agentData.inputConnections.length > 0 && (
          <button
            className="process-btn"
            onClick={handleProcessingStart}
            style={{ backgroundColor: color }}
          >
            Start Processing
          </button>
        )}

        {agentData.status === 'completed' && agentData.outputData && (
          <div className="output-summary">
            <small>✨ Processing complete</small>
            {agentData.outputData.confidence && (
              <div className="confidence">
                Confidence: {Math.round(agentData.outputData.confidence * 100)}%
              </div>
            )}
          </div>
        )}

        {agentData.error && (
          <div className="error-message">
            <small>{agentData.error}</small>
          </div>
        )}
      </div>

      {/* Output handle for passing processed data */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="ai-agent-handle output-handle"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};

export default memo(AIAgentNode);
