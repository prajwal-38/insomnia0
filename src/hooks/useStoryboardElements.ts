// src/hooks/useStoryboardElements.ts
import { useState, useCallback } from 'react';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeChange,
  type EdgeChange,
  type NodeOrigin,
} from 'reactflow';
import type { AppNodeType, AppEdgeType, AppNodeData } from '../App'; // Adjust path if necessary
import type { CustomEdgeData } from '../CustomEdge'; // Adjust path if necessary

// Helper to ensure we get an array, whether a function or an array is passed
const getInitialElements = <T extends Node | Edge>(
  initialElementsOrFn: T[] | (() => T[])
): T[] => {
  return typeof initialElementsOrFn === 'function'
    ? initialElementsOrFn()
    : initialElementsOrFn;
};

export function useStoryboardElements(
  initialNodesParam: AppNodeType[] | (() => AppNodeType[]),
  initialEdgesParam: AppEdgeType[] | (() => AppEdgeType[]),
  defaultNodeOrigin: NodeOrigin = [0, 0]
) {
  const [nodes, setNodes] = useState<AppNodeType[]>(() => {
    const resolvedInitialNodes = getInitialElements(initialNodesParam);
    // Ensure nodeOrigin is set for all initial nodes
    return resolvedInitialNodes.map((node) => ({
      ...node,
      nodeOrigin: node.nodeOrigin || defaultNodeOrigin,
      // Ensure data object exists, even if empty, to prevent errors downstream
      data: node.data || ({} as AppNodeData),
    }));
  });

  const [edges, setEdges] = useState<AppEdgeType[]>(() => {
    const resolvedInitialEdges = getInitialElements(initialEdgesParam);
    // You might want to ensure data exists for edges too if CustomEdge expects it
    return resolvedInitialEdges.map(edge => ({
        ...edge,
        data: edge.data || ({} as CustomEdgeData),
    }));
  });

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,
  };
}