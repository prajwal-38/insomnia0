// src/CustomSceneNode.tsx
import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { NodeProps, XYPosition } from 'reactflow';
import { Handle, Position } from 'reactflow';
import type { NodeVideoSceneData, AIAgentNodeData } from './types'; // Ensure this includes sceneId
import { formatTime } from './utils';

// Debounce function (can be in utils.ts)
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) { clearTimeout(timeout); timeout = null; }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced as (...args: Parameters<F>) => void; 
};

export interface CustomNodeData {
  label: string;
  content: string;
  type: 'scene' | 'note' | 'entry' | 'intro' | 'outro' | 'ai-agent';
  onDeleteNode?: (id: string) => void;
  onTitleChange?: (id: string, newTitle: string) => void;
  onTitleDoubleClick?: (id: string) => void;
  isEditingTitle?: boolean;
  handleTitleBlur?: () => void;
  handleTitleKeyDown?: (e: React.KeyboardEvent) => void;
  videoAnalysisData?: NodeVideoSceneData; // Includes sceneId
  aiAgentData?: AIAgentNodeData; // For AI agent nodes
  makeSceneMetadataUpdateRequest?: ( // This is the function from App.tsx
    nodeId: string | undefined,
    analysisId: string,
    sceneId: string,
    updates: { title?: string; tags?: string[] }
  ) => Promise<void>;
  hasPendingChanges?: boolean;
  isDimmed?: boolean;
  isSearchResultHighlight?: boolean;
  onOpenInteractivePreview?: (sceneData: NodeVideoSceneData) => void;
  error?: string;
  retryAction?: () => void;
}

const TagBadge: React.FC<{ tag: string; onRemove?: () => void }> = ({ tag, onRemove }) => ( <span className="tag-badge"> {tag} {onRemove && <button onClick={onRemove} className="tag-remove-btn" title={`Remove tag "${tag}"`}>×</button>} </span> );

const CustomSceneNode: React.FC<NodeProps<CustomNodeData>> = ({
  id, data, selected = false, isConnectable = true, xPos, yPos,
}) => {
  const safeData = data || { label: 'Unnamed Node', content: '', type: 'scene' };

  // If this is an AI agent node, render the AI agent component instead
  if (safeData.type === 'ai-agent' && safeData.aiAgentData) {
    // Import and render AIAgentNode component
    // For now, we'll render a placeholder since we need to handle this differently
    return (
      <div className="ai-agent-node-placeholder">
        <div>🤖 {safeData.aiAgentData.agentName}</div>
        <div>{safeData.aiAgentData.status}</div>
      </div>
    );
  }

  const [isEditingSceneTitle, setIsEditingSceneTitle] = useState(false);
  const [currentSceneTitle, setCurrentSceneTitle] = useState(
    safeData.videoAnalysisData?.title || safeData.label.replace(/\s\(.*\)$/, '')
  );
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [currentTags, setCurrentTags] = useState<string[]>(safeData.videoAnalysisData?.tags || []);
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const titleFromData = safeData.videoAnalysisData?.title || safeData.label.replace(/\s\(.*\)$/, '');
    if (!isEditingSceneTitle && titleFromData !== currentSceneTitle) {
      setCurrentSceneTitle(titleFromData);
    }
  }, [safeData.label, safeData.videoAnalysisData?.title, isEditingSceneTitle]);

  useEffect(() => {
    const tagsFromData = safeData.videoAnalysisData?.tags || [];
    if (JSON.stringify(tagsFromData.sort()) !== JSON.stringify(currentTags.sort())) {
      setCurrentTags(tagsFromData);
    }
  }, [safeData.videoAnalysisData?.tags]);

  useEffect(() => { // Focus input when editing starts
    if (isEditingSceneTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingSceneTitle]);

  const callMakeSceneMetadataUpdateRequest = useCallback((updates: { title?: string; tags?: string[] }) => {
    if (safeData.videoAnalysisData && safeData.makeSceneMetadataUpdateRequest) {
      safeData.makeSceneMetadataUpdateRequest(
        id, // nodeId
        safeData.videoAnalysisData.analysisId,
        safeData.videoAnalysisData.sceneId,
        updates
      ).catch(err => console.error("Update request from node failed:", err));
    }
  }, [safeData.videoAnalysisData, safeData.makeSceneMetadataUpdateRequest, id]);

  const debouncedUpdate = useCallback(debounce(callMakeSceneMetadataUpdateRequest, 750), [callMakeSceneMetadataUpdateRequest]);

  const handleSceneTitleDoubleClick = () => {
    if (safeData.type === 'scene' && safeData.videoAnalysisData) setIsEditingSceneTitle(true);
    else if (safeData.onTitleDoubleClick) safeData.onTitleDoubleClick(id);
  };

  const handleSceneTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setCurrentSceneTitle(newTitle);
    // Debounce only if it's a meaningful change from the original video data title
    // The App.tsx's `unsavedMetadataChanges` handles the actual "pending" state determination.
    if (newTitle.trim() !== (safeData.videoAnalysisData?.title || '')) {
        debouncedUpdate({ title: newTitle.trim() || undefined }); // Send undefined if empty to clear
    }
  };

  const saveSceneTitleImmediately = () => {
    setIsEditingSceneTitle(false);
    const trimmedTitle = currentSceneTitle.trim();
    if (!safeData.videoAnalysisData) return;
    
    // If the title hasn't actually changed from what's in videoAnalysisData, don't send an update.
    // Or if it's empty and original was not, this specific check could be more nuanced based on desired UX.
    if (trimmedTitle === safeData.videoAnalysisData.title && !safeData.hasPendingChanges) return; // No change or reverted to saved state

    callMakeSceneMetadataUpdateRequest({ title: trimmedTitle || undefined }); // Send undefined if empty
  };

  const handleSceneTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); saveSceneTitleImmediately(); }
    else if (e.key === 'Escape') {
      setCurrentSceneTitle(safeData.videoAnalysisData?.title || safeData.label.replace(/\s\(.*\)$/, ''));
      setIsEditingSceneTitle(false);
    }
  };

  const handleAddTag = () => {
    if (!newTagInputRef.current || !newTagInputRef.current.value.trim()) return;
    const newTag = newTagInputRef.current.value.trim().toLowerCase();
    if (currentTags.includes(newTag)) { newTagInputRef.current.value = ''; return; } // Avoid duplicates

    const newTagsArray = Array.from(new Set([...currentTags, newTag]));
    setCurrentTags(newTagsArray); // Optimistic UI
    if (newTagInputRef.current) newTagInputRef.current.value = '';
    callMakeSceneMetadataUpdateRequest({ tags: newTagsArray });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = currentTags.filter(tag => tag !== tagToRemove);
    setCurrentTags(updatedTags); // Optimistic UI
    callMakeSceneMetadataUpdateRequest({ tags: updatedTags });
  };
  
  const [currentGenericTitle, setCurrentGenericTitle] = useState(safeData.label);
  useEffect(() => { if (!safeData.isEditingTitle && safeData.label !== currentGenericTitle) setCurrentGenericTitle(safeData.label); }, [safeData.label, safeData.isEditingTitle, currentGenericTitle]);
  const handleGenericTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => setCurrentGenericTitle(e.target.value);
  const handleGenericTitleBlur = () => { if(safeData.onTitleChange && currentGenericTitle !== safeData.label) safeData.onTitleChange(id, currentGenericTitle); if(safeData.handleTitleBlur) safeData.handleTitleBlur(); };
  const handleGenericTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if(e.key === 'Enter' && safeData.onTitleChange && currentGenericTitle !== safeData.label) safeData.onTitleChange(id, currentGenericTitle); if(safeData.handleTitleKeyDown) safeData.handleTitleKeyDown(e); };

  const nodeDisplayTitle = safeData.label;
  const nodeTypeClass = safeData.type || 'scene';
  const pendingChangesClass = safeData.hasPendingChanges ? 'pending-changes-node' : '';
  const dimmedClass = safeData.isDimmed ? 'dimmed-node' : '';
  const searchHighlightClass = safeData.isSearchResultHighlight ? 'search-highlight' : '';
  const errorClass = safeData.error ? 'has-error' : '';

  const handleDelete = useCallback(() => { if (safeData.onDeleteNode) safeData.onDeleteNode(id); }, [safeData.onDeleteNode, id]);
  const handleOpenPreview = useCallback(() => { if (safeData.videoAnalysisData && safeData.onOpenInteractivePreview) safeData.onOpenInteractivePreview(safeData.videoAnalysisData);}, [safeData.videoAnalysisData, safeData.onOpenInteractivePreview]);

  return (
    <div className={`story-node ${selected ? 'selected' : ''} type-${nodeTypeClass} ${pendingChangesClass} ${dimmedClass} ${searchHighlightClass} ${errorClass}`}>
      <Handle type="target" position={Position.Left} className="custom-handle" isConnectable={isConnectable} />
      <div className={`node-type-badge ${nodeTypeClass}`}>{nodeTypeClass}</div>
      
      {safeData.error && (
        <div className="node-error-badge" title={safeData.error}>
            !
            {/* Retry button on node itself could be complex, App.tsx manages retry via toast for now */}
        </div>
      )}

      {safeData.onDeleteNode && <button className="node-delete-button" onClick={handleDelete} title="Delete Node">🗑️</button>}
      {safeData.type === 'scene' && safeData.videoAnalysisData && safeData.onOpenInteractivePreview && (
        <button className="node-preview-button" onClick={handleOpenPreview} title="Open Scene Preview & Editor">🎬</button>
      )}

      {safeData.type === 'scene' && safeData.videoAnalysisData ? (
        isEditingSceneTitle ? (
          <input ref={titleInputRef} className="node-title-input-inline scene-title-edit" value={currentSceneTitle} onChange={handleSceneTitleChange} onBlur={saveSceneTitleImmediately} onKeyDown={handleSceneTitleKeyDown} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
        ) : (
          <h4 className="node-title scene-title-display" onDoubleClick={handleSceneTitleDoubleClick} title={nodeDisplayTitle}>{nodeDisplayTitle}</h4>
        )
      ) : safeData.isEditingTitle ? (
         <input className="node-title-input-inline generic-title-edit" value={currentGenericTitle} onChange={handleGenericTitleChange} onBlur={handleGenericTitleBlur} onKeyDown={handleGenericTitleKeyDown} autoFocus onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
      ) : (
         <h4 className="node-title generic-title-display" onDoubleClick={safeData.onTitleDoubleClick ? () => safeData.onTitleDoubleClick!(id) : undefined} title={nodeDisplayTitle}>{nodeDisplayTitle}</h4>
      )}

      {safeData.type === 'scene' && safeData.videoAnalysisData && (
        <div className="node-tags-container">
          <div className="tags-display-area"> {currentTags.length > 0 ? currentTags.map(tag => <TagBadge key={tag} tag={tag} />) : <span className="no-tags-placeholder">No tags</span>} </div>
          <button className="tag-editor-toggle" onClick={() => setShowTagEditor(!showTagEditor)} title="Edit Tags"> {showTagEditor ? '🏷️-' : '🏷️+'} </button>
        </div>
      )}
      {showTagEditor && safeData.type === 'scene' && safeData.videoAnalysisData && (
        <div className="tag-editor-popover" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <h5>Edit Tags</h5>
          <div className="current-tags-editable"> {currentTags.map(tag => (<TagBadge key={tag} tag={tag} onRemove={() => handleRemoveTag(tag)} /> ))} </div>
          <div className="add-tag-input-group">
            <input type="text" ref={newTagInputRef} placeholder="New tag" className="new-tag-input" onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddTag();}}}/>
            <button onClick={handleAddTag} className="add-tag-btn">Add</button>
          </div>
        </div>
      )}

      {safeData.videoAnalysisData && ( <div className="node-video-info"> {`🎬 ${formatTime(safeData.videoAnalysisData.start)}-${formatTime(safeData.videoAnalysisData.end)}`} {safeData.videoAnalysisData.transitionType && <span className="video-info-transition">{`↳ ${safeData.videoAnalysisData.transitionType}`}</span>} </div> )}

      {safeData.videoAnalysisData?.aiProcessingResults && Object.keys(safeData.videoAnalysisData.aiProcessingResults).length > 0 && (
        <div className="node-ai-results">
          <div className="ai-results-header">🤖 AI Results:</div>
          {Object.entries(safeData.videoAnalysisData.aiProcessingResults).map(([agentType, result]) => (
            <div key={agentType} className="ai-result-item" title={`Processed by ${agentType} at ${new Date(result.processedAt).toLocaleTimeString()}`}>
              <span className="ai-result-type">{agentType.replace('-', ' ')}</span>
              <span className="ai-result-status">✅</span>
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="custom-handle" isConnectable={isConnectable} />
    </div>
  );
};
export default memo(CustomSceneNode);