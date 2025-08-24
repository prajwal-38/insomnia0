'use client';

import React, { useCallback, useState, useEffect } from 'react';
import CustomSceneNode from './CustomSceneNode';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Define a custom node type if needed, or use default
// For now, we'll use default nodes and pass data through them.

// Function to convert scene data to React Flow nodes
const scenesToNodes = (scenes: SceneData[] | undefined | null): Node[] => {
  if (!scenes || !Array.isArray(scenes)) {
    console.error("scenes prop is not a valid array:", scenes);
    return []; // Return an empty array of nodes if scenes is not valid
  }
  return scenes.map((scene) => ({
    id: scene.id,
    type: 'default',
    position: scene.position || { x: 0, y: 0 }, // Use position from scene data, provide default if missing
    data: { label: scene.title, type: scene.type, description: scene.description },
  }));
};

// Function to convert scene data to React Flow edges (linear for now)
const scenesToEdges = (scenes: SceneData[]): Edge[] => {
  const edges: Edge[] = [];
  for (let i = 0; i < scenes.length - 1; i++) {
    edges.push({
      id: `e${scenes[i].id}-${scenes[i + 1].id}`,
      source: scenes[i].id,
      target: scenes[i + 1].id,
      animated: true,
    });
  }
  return edges;
};

// If you have custom node components, define them here
const nodeTypes: NodeTypes = { default: CustomSceneNode }; // Use CustomSceneNode for 'default' type

interface SceneData {
  id: string;
  title: string;
  description: string;
  duration: number;
  type?: string;
}

interface StoryGraphProps {
  scenes: SceneData[];
}

const StoryGraph: React.FC<StoryGraphProps> = ({ scenes }) => {
  // Use state to manage nodes and edges, initialized from props
  const [nodes, setNodes] = React.useState<Node[]>(() => scenesToNodes(scenes));
  const [edges, setEdges] = React.useState<Edge[]>(() => scenesToEdges(scenes));

  // Update nodes and edges when the scenes prop changes
  useEffect(() => {
    setNodes(scenesToNodes(scenes));
    setEdges(scenesToEdges(scenes));
  }, [scenes]);

  // Update nodes and edges when the scenes prop changes
  // sceneCounter is no longer needed here as scene IDs come from the scenes prop
  // let sceneCounter = initialNodes.length; // To generate unique IDs for new scenes

  // The handleAutoGenerateScene and handlePromptSubmit logic will be moved to the parent component (app/page.tsx)
  // as the scene data is now managed there.

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}> {/* Ensure container has height */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};

export default StoryGraph;