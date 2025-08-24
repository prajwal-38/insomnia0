import React, { memo, useState, useEffect, useCallback } from 'react';
// Import NodeProps as a type
import type { NodeProps, XYPosition } from 'reactflow';
import { Handle, Position } from 'reactflow';


// Define the NodeData interface that CustomSceneNode expects
export interface CustomNodeData {
  label: string;
  content: string;
  type: 'scene' | 'note' | 'entry' | 'intro' | 'outro'; // Added intro & outro
  onDeleteNode?: (id: string) => void;
  onAddConnectedNode?: (id: string, position: XYPosition) => void; // Expects position
  onTitleChange?: (id: string, newTitle: string) => void;
  onTitleDoubleClick?: (id: string) => void; // For App.tsx to manage isEditingTitle
  isEditingTitle?: boolean; // Controlled by App.tsx
  handleTitleBlur?: () => void; // Controlled by App.tsx
  handleTitleKeyDown?: (e: React.KeyboardEvent) => void; // Controlled by App.tsx
}

// Define the props interface for the component, extending NodeProps
interface CustomNodeProps extends NodeProps<CustomNodeData> {
  // id, data, selected, isConnectable, xPos, yPos, zIndex, dragging are from NodeProps
}

const CustomSceneNode: React.FC<CustomNodeProps> = ({
  id,
  data, // data can still be undefined if not passed correctly by React Flow
  selected = false,
  isConnectable = true,
  xPos,
  yPos,
}) => {
  // Provide a default for data and its properties if it's missing
  const safeData = data || { label: 'Unnamed Node', content: '', type: 'scene' };

  // Local title state for editing, synced with safeData.label
  const [currentTitle, setCurrentTitle] = useState(safeData.label);

  useEffect(() => {
    // If not editing, and the prop label changes, update local title
    // Use safeData here as well
    if (!safeData.isEditingTitle && safeData.label !== currentTitle) {
      setCurrentTitle(safeData.label);
    }
  }, [safeData.label, safeData.isEditingTitle, currentTitle]); // Use safeData properties in dependencies

  const handleLocalTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTitle(e.target.value);
  };

  const handleLocalTitleBlur = () => {
    // Use safeData for callbacks
    if (safeData.onTitleChange && currentTitle !== safeData.label) {
      safeData.onTitleChange(id, currentTitle);
    }
    if (safeData.handleTitleBlur) {
      safeData.handleTitleBlur();
    }
  };
  
  const handleLocalTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Use safeData for callbacks
    if (e.key === 'Enter' && safeData.onTitleChange && currentTitle !== safeData.label) {
      safeData.onTitleChange(id, currentTitle);
    }
    if (safeData.handleTitleKeyDown) {
      safeData.handleTitleKeyDown(e);
    }
  };

  const handleDelete = useCallback(() => {
    if (safeData.onDeleteNode) { // Use safeData
      safeData.onDeleteNode(id);
    }
  }, [safeData.onDeleteNode, id]); // Use safeData property in dependency

  const handleAddConnected = useCallback(() => {
    if (safeData.onAddConnectedNode) { // Use safeData
      safeData.onAddConnectedNode(id, { x: xPos, y: yPos });
    }
  }, [safeData.onAddConnectedNode, id, xPos, yPos]); // Use safeData property in dependency

  const handleDoubleClick = useCallback(() => {
    if (safeData.onTitleDoubleClick) { // Use safeData
      safeData.onTitleDoubleClick(id);
    }
  }, [safeData.onTitleDoubleClick, id]); // Use safeData property in dependency

  // Fallback for type if somehow safeData.type is invalid (though TS should catch this)
  const nodeType = safeData.type || 'scene';

  return (
    <div className={`story-node ${selected ? 'selected' : ''} type-${nodeType}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="custom-handle"
        isConnectable={isConnectable}
      />

      <div className={`node-type-badge ${nodeType}`}>{nodeType}</div>

      <button className="node-delete-button" onClick={handleDelete} title="Delete Node">
        🗑️
      </button>

      <button className="node-connect-button" onClick={handleAddConnected} title="Create Connected Node">
        ➕
      </button>

      {safeData.isEditingTitle ? ( // Use safeData
        <input
          className="node-title-input-inline"
          value={currentTitle}
          onChange={handleLocalTitleChange}
          onBlur={handleLocalTitleBlur}
          onKeyDown={handleLocalTitleKeyDown}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <h4
          className="node-title"
          onDoubleClick={handleDoubleClick}
          title={safeData.label} // Use safeData
        >
          {safeData.label} {/* Use safeData */}
        </h4>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="custom-handle"
        isConnectable={isConnectable}
      />
    </div>
  );
};

export default memo(CustomSceneNode);