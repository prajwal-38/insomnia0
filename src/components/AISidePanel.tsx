import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, User, Send, Lightbulb, Zap, Loader2 } from 'lucide-react';
import { chatbotService } from '../services/chatbotService';
import { commandExecutor } from '../services/commandExecutor';
import type { ApiAnalysisResponse } from '../types';
import SyncButton from './SyncButton';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    suggestions?: string[];
    actions?: string[];
    includeSyncButton?: boolean;
  };
}

interface AISidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentAnalysisData: ApiAnalysisResponse | null;
  nodes: any[];
  onAddAIAgent: (agentType: string) => void;
  onAddAIAgentWithConnection?: (agentType: string, targetSceneIds: string[]) => Promise<string>;
  onCreateConnection?: (sourceId: string, targetId: string) => void;
  onNodeUpdate: (nodeId: string, updates: any) => void;
  onRefreshProject?: () => void;
  onShowToast?: (message: string, type: 'info' | 'error' | 'success' | 'warning') => void;

}

const AISidePanel: React.FC<AISidePanelProps> = ({
  isOpen,
  onClose,
  currentAnalysisData,
  nodes,
  onAddAIAgent,
  onAddAIAgentWithConnection,
  onCreateConnection,
  onNodeUpdate,
  onRefreshProject,
  onShowToast
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [panelWidth, setPanelWidth] = useState(384); // Default 384px (w-96)
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Resize functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX; // Negative because we're resizing from the left edge
      const newWidth = Math.max(300, Math.min(800, startWidth + deltaX)); // Min 300px, max 800px
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  // Cleanup resize listeners on unmount
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  // Generate contextual suggestions based on current state
  useEffect(() => {
    const generateSuggestions = () => {
      const newSuggestions: string[] = [];
      
      // Debug: Log current analysis data (only when it changes to reduce spam)
      const currentDataKey = `${!!currentAnalysisData}_${currentAnalysisData?.scenes?.length || 0}_${currentAnalysisData?.fileName}`;
      if ((window as any).__lastAISidePanelDataKey !== currentDataKey) {
        console.log('🔍 AISidePanel currentAnalysisData changed:', {
          hasData: !!currentAnalysisData,
          scenes: currentAnalysisData?.scenes?.length || 0,
          fileName: currentAnalysisData?.fileName
        });
        (window as any).__lastAISidePanelDataKey = currentDataKey;
      }
      
      if (currentAnalysisData && currentAnalysisData.scenes && currentAnalysisData.scenes.length > 0) {
        const sceneCount = currentAnalysisData.scenes.length;
        newSuggestions.push(
          `Analyze all ${sceneCount} scenes for content`,
          'Add subtitle agents to all scenes',
          'Enhance video quality for the entire project'
        );
        
        if (sceneCount > 1) {
          newSuggestions.push('Create smooth transitions between scenes');
        }
      } else {
        newSuggestions.push(
          'Upload and analyze a new video',
          'Show me available AI agents',
          'Help me get started with video editing'
        );
      }
      
      setSuggestions(newSuggestions.slice(0, 3));
    };

    generateSuggestions();
  }, [currentAnalysisData, nodes]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    try {
      // Debug: Log the current analysis data
      console.log('🔍 AISidePanel: Current analysis data:', {
        hasData: !!currentAnalysisData,
        sceneCount: currentAnalysisData?.scenes?.length || 0,
        analysisId: currentAnalysisData?.analysisId,
        fileName: currentAnalysisData?.fileName
      });

      // If no analysis data, try to refresh it
      if (!currentAnalysisData || !currentAnalysisData.scenes || currentAnalysisData.scenes.length === 0) {
        console.log('🔄 No analysis data found, triggering refresh...');
        onRefreshProject?.();

        // Wait a bit for refresh to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // If still no data after refresh, show error
        if (!currentAnalysisData || !currentAnalysisData.scenes || currentAnalysisData.scenes.length === 0) {
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'system',
            content: '⚠️ No video project loaded. Please upload and analyze a video first to use AI commands.',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
          setIsProcessing(false);
          return;
        }
      }

      // Parse the command using the chatbot service
      const parsedCommand = await chatbotService.parseCommand(message, {
        currentAnalysisData,
        nodes,
        selectedScenes: [] // For now, no selected scenes in the chat context
      });

      // Execute the command
      const result = await commandExecutor.executeCommand(parsedCommand, {
        currentAnalysisData,
        nodes,
        onAddAIAgent,
        onAddAIAgentWithConnection,
        onCreateConnection,
        onNodeUpdate,
        onRefreshProject,
        onShowToast: onShowToast || ((message: string, type: 'info' | 'error' | 'success' | 'warning') => {
          console.log(`Toast: ${type} - ${message}`);
        })
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: result.response,
        timestamp: new Date(),
        metadata: {
          suggestions: result.suggestions,
          actions: result.actions,
          includeSyncButton: result.includeSyncButton
        }
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'system',
        content: `Sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  // Handle sync button click - directly trigger the existing timeline sync button
  const handleSyncClick = useCallback(async (forceReload?: boolean) => {
    try {
      console.log('🔄 AI Assistant: Looking for existing timeline sync button');

      // Find the existing sync button in the timeline header
      const syncButton = document.querySelector('button[title*="Smart sync mezzanine scenes"]');

      if (syncButton) {
        console.log('✅ Found existing sync button, triggering click');

        // Create a synthetic click event with shift key if forceReload is true
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          shiftKey: forceReload || false
        });

        syncButton.dispatchEvent(clickEvent);
        onShowToast?.('Timeline sync triggered successfully', 'success');
      } else {
        console.warn('⚠️ Timeline sync button not found - user might not be in timeline view');
        onShowToast?.('Please switch to Timeline view to sync', 'warning');
      }
    } catch (error) {
      console.error('❌ AI Assistant: Failed to trigger sync button:', error);
      onShowToast?.('Failed to trigger sync. Please try manually.', 'error');
    }
  }, [onShowToast]);

  if (!isOpen) return null;

  return (
    <>
      {/* Custom styles for the AI panel */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: var(--bg-light);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--primary-dark);
          border-radius: 3px;
          transition: background 0.2s ease;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--primary-light);
        }
        .message-enter {
          animation: messageSlideIn 0.3s ease-out forwards;
        }
        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .panel-glow {
          box-shadow: 0 0 20px rgba(64, 224, 208, 0.2);
        }
      `}</style>
    <div
      ref={panelRef}
      className={`fixed right-0 top-0 h-full flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{
        width: `${panelWidth}px`,
        backgroundColor: 'rgba(17, 17, 17, 0.95)',
        borderLeft: '1px solid rgba(64, 224, 208, 0.3)',
        zIndex: 1000,
        boxShadow: '0 0 20px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(8px)'
      }}
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 w-2 h-full cursor-ew-resize transition-all duration-200 group z-50"
        onMouseDown={handleMouseDown}
        style={{
          background: isResizing
            ? 'linear-gradient(90deg, var(--primary-light), transparent)'
            : 'transparent',
          zIndex: 1001
        }}
        title="Drag to resize panel"
      >
        {/* Visual resize indicator */}
        <div
          className={`absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-12 rounded-r-lg transition-all duration-300 flex items-center justify-center ${
            isResizing ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-80 scale-100'
          }`}
          style={{
            background: 'rgba(64, 224, 208, 0.6)',
            boxShadow: isResizing ? '0 0 10px rgba(64, 224, 208, 0.4)' : '0 0 5px rgba(64, 224, 208, 0.2)'
          }}
        >
          <div className="flex flex-col gap-0.5">
            <div className="w-0.5 h-2 bg-white/80 rounded-full"></div>
            <div className="w-0.5 h-2 bg-white/60 rounded-full"></div>
            <div className="w-0.5 h-2 bg-white/80 rounded-full"></div>
          </div>
        </div>

        {/* Hover area extension */}
        <div className="absolute -left-2 top-0 w-6 h-full"></div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 relative" style={{
        borderBottom: '1px solid rgba(64, 224, 208, 0.2)',
        background: 'rgba(26, 26, 26, 0.8)'
      }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Bot className="w-5 h-5 flex-shrink-0" style={{ color: '#40E0D0' }} />
          <h2 className="font-semibold truncate" style={{ color: 'var(--text-light)' }}>AI Assistant</h2>
          <span className="text-xs opacity-60 flex-shrink-0">
            ({currentAnalysisData?.scenes?.length || 0} scenes)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              console.log('🔄 Manual refresh triggered');
              onRefreshProject?.();
            }}
            className="p-1 rounded-md transition-colors text-xs"
            style={{
              color: 'var(--text-light)',
              opacity: 0.7
            }}
            title="Refresh project data"
          >
            🔄
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{
              color: 'var(--text-light)',
              opacity: 0.7
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-light)';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.opacity = '0.7';
            }}
            title="Close AI Assistant"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
        style={{
          scrollBehavior: 'smooth'
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 message-enter ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type !== 'user' && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{
                backgroundColor: message.type === 'system' ? 'var(--bg-light)' : 'var(--primary-dark)'
              }}>
                {message.type === 'system' ? (
                  <Lightbulb className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                ) : (
                  <Bot className="w-4 h-4" style={{ color: 'var(--text-light)' }} />
                )}
              </div>
            )}

            <div
              className="rounded-lg p-3"
              style={{
                maxWidth: `${Math.max(200, panelWidth * 0.8)}px`,
              backgroundColor: message.type === 'user'
                ? 'var(--primary)'
                : message.type === 'system'
                ? 'var(--bg-light)'
                : 'var(--bg-light)',
              color: message.type === 'user'
                ? 'white'
                : 'var(--text-light)',
              border: message.type === 'system' ? '1px solid var(--primary-dark)' : 'none'
            }}>
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              
              {message.metadata?.suggestions && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--primary-dark)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-light)', opacity: 0.7 }}>Suggestions:</div>
                  {message.metadata.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="block text-xs mb-1 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--primary-light)' }}
                    >
                      • {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* Sync Button for subtitle generation */}
              {message.metadata?.includeSyncButton && (
                <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--primary-dark)' }}>
                  <div className="text-xs mb-2" style={{ color: 'var(--text-light)', opacity: 0.7 }}>
                    Sync to Timeline:
                  </div>
                  <SyncButton
                    onSync={handleSyncClick}
                    size="sm"
                    variant="default"
                    className="w-full justify-center"
                    title="Sync generated content to timeline"
                    showText={true}
                  />
                </div>
              )}
            </div>

            {message.type === 'user' && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{
                backgroundColor: 'var(--primary)'
              }}>
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
              backgroundColor: 'var(--primary-dark)'
            }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-light)' }} />
            </div>
            <div className="rounded-lg p-3" style={{
              backgroundColor: 'var(--bg-light)'
            }}>
              <div className="text-sm" style={{ color: 'var(--text-light)', opacity: 0.8 }}>Processing your request...</div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="p-4" style={{
          borderTop: '1px solid var(--primary-dark)',
          backgroundColor: 'var(--bg-light)'
        }}>
          <div className="text-xs mb-2 flex items-center gap-1" style={{
            color: 'var(--text-light)',
            opacity: 0.8
          }}>
            <Zap className="w-3 h-3" style={{ color: 'var(--warning)' }} />
            Quick suggestions:
          </div>
          <div className="space-y-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="block w-full text-left text-xs p-2 rounded transition-colors"
                style={{
                  color: 'var(--primary-light)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
                  e.currentTarget.style.color = 'var(--text-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--primary-light)';
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className="p-4 transition-all duration-200"
        style={{
          borderTop: '1px solid var(--primary-dark)',
          background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.05) 0%, transparent 100%)'
        }}
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to help with your video editing..."
            className="flex-1 px-3 py-2 rounded-md text-sm transition-colors"
            style={{
              backgroundColor: 'var(--bg-light)',
              color: 'var(--text-light)',
              border: '1px solid var(--primary-dark)',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-light)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-dark)';
            }}
            disabled={isProcessing}
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isProcessing}
            className="px-3 py-2 rounded-md transition-colors"
            style={{
              backgroundColor: inputValue.trim() && !isProcessing ? 'var(--primary)' : 'var(--bg-light)',
              color: inputValue.trim() && !isProcessing ? 'white' : 'var(--text-light)',
              opacity: inputValue.trim() && !isProcessing ? 1 : 0.5,
              cursor: inputValue.trim() && !isProcessing ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim() && !isProcessing) {
                e.currentTarget.style.backgroundColor = 'var(--primary-light)';
              }
            }}
            onMouseLeave={(e) => {
              if (inputValue.trim() && !isProcessing) {
                e.currentTarget.style.backgroundColor = 'var(--primary)';
              }
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default AISidePanel;
