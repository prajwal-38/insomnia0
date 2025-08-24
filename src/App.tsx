import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './App.css';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnConnect,
  type Connection,
  type NodeDragHandler,
  type SelectionDragHandler,
  type XYPosition,
  type NodeOrigin,
  type NodeChange,
  type FitViewOptions,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomSceneNode, { type CustomNodeData } from './CustomSceneNode.tsx';
import CustomEdge, { type CustomEdgeData } from './CustomEdge.tsx';

interface AppNodeData extends Omit<CustomNodeData, 'type'> {
  label: string;
  content: string;
  type: 'scene' | 'note' | 'entry' | 'intro' | 'outro';
  onDeleteNode?: (id: string) => void;
  onAddConnectedNode?: (id: string, position: XYPosition) => void;
  onTitleChange?: (id: string, newTitle: string) => void;
}

// Define simpler types for nodes and edges
type AppNode = Node<AppNodeData>;
type AppEdge = Edge<CustomEdgeData>;

const nodeOrigin: NodeOrigin = [0.5, 0.5];
const GRID_SIZE = 20;

const initialNodes: AppNode[] = [
  { id: 'intro-1', type: 'default', position: { x: 50, y: 150 }, data: { label: 'Story Intro', content: 'The beginning of everything.', type: 'intro', } },
  { id: 'scene-1', type: 'default', position: { x: 300, y: 100 }, data: { label: 'First Scene', content: 'Something happens here.', type: 'scene', } },
  { id: 'note-1', type: 'default', position: { x: 300, y: 250 }, data: { label: 'A Quick Note', content: 'Remember this detail.', type: 'note', } },
  { id: 'outro-1', type: 'default', position: { x: 550, y: 150 }, data: { label: 'The End', content: 'How it all concludes.', type: 'outro', } },
];

const initialEdges: AppEdge[] = [];

const nodeTypes = { default: CustomSceneNode, };
const edgeTypes = { custom: CustomEdge, };
const fitViewOptions: FitViewOptions = { padding: 0.2, duration: 800, };

function AppContent() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, setViewport, getNodes, getNode, getEdges, deleteElements, fitView } = useReactFlow<AppNodeData, AppEdge>();

  const [nodes, setNodes] = useNodesState(initialNodes);

  const [edges, setEdges, onEdgesChangeInternalOriginal] = useEdgesState(initialEdges);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  const edgesWithDeleteHandler = useMemo(() => {
    return edges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        onDeleteEdge: handleDeleteEdge,
      }
    }));
  }, [edges, handleDeleteEdge]);

  const [isEditingTitle, setIsEditingTitle] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [connectingNode, setConnectingNode] = useState<{ id: string; handleId: string | null } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Use number type for setTimeout return value in browser environment
const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => { setToastMessage(null); toastTimer.current = null; }, 3000);
  }, []);

  // Function to reset app data
  const handleResetAppData = useCallback(() => {
    if (window.confirm("Are you sure you want to reset all Story Web data? This action cannot be undone.")) {
      localStorage.removeItem('storyboard-nodes');
      localStorage.removeItem('storyboard-connections');
      window.location.reload(); // Reload the page to re-initialize state
    }
  }, []); // No dependencies needed if it only interacts with localStorage and reloads

  useEffect(() => {
    const nodesToSave = nodes.map(({ selected, dragging, ...node }) => node);
    localStorage.setItem('storyboard-nodes', JSON.stringify(nodesToSave));
  }, [nodes]);

  useEffect(() => {
    const edgesToSave = edges.map(edge => {
        const { onDeleteEdge, ...restOfData } = edge.data || {};
        return { ...edge, data: restOfData as CustomEdgeData };
    });
    localStorage.setItem('storyboard-connections', JSON.stringify(edgesToSave));
  }, [edges]);

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
      setNodes((nds) => {
        let newNodes = applyNodeChanges(changes, nds);
        if (snapToGrid) {
          newNodes = newNodes.map(node => {
            const change = changes.find(c => c.type === 'position' && c.id === node.id && c.dragging);
            if (change && node.positionAbsolute) {
                return {
                    ...node,
                    position: {
                        x: Math.round(node.positionAbsolute.x / GRID_SIZE) * GRID_SIZE,
                        y: Math.round(node.positionAbsolute.y / GRID_SIZE) * GRID_SIZE,
                    }
                };
            }
            return node;
          });
        }
        return newNodes;
      });
    }, [setNodes, snapToGrid]);
  
  // We're using onEdgesChangeInternalOriginal directly in the ReactFlow component
  
  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, { nodeId, handleId }: { nodeId: string | null, handleId: string | null}) => {
    if (nodeId) setConnectingNode({ id: nodeId, handleId });
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
      if (!connectingNode || !reactFlowWrapper.current) return;
      const targetIsPane = (event.target as HTMLElement).classList.contains('react-flow__pane');
      if (targetIsPane) {
        const { top, left } = reactFlowWrapper.current.getBoundingClientRect();
        const position = project({ x: (event instanceof MouseEvent ? event.clientX : event.touches[0].clientX) - left, y: (event instanceof MouseEvent ? event.clientY : event.touches[0].clientY) - top, });
        const sourceNode = getNode(connectingNode.id);
        if (!sourceNode) return;
        let newNodeType: AppNodeData['type'] = 'scene'; let allowConnection = false;
        if (sourceNode.data.type === 'intro') { newNodeType = 'scene'; allowConnection = true; }
        else if (sourceNode.data.type === 'scene') { newNodeType = 'scene'; allowConnection = true; }
        else if (sourceNode.data.type === 'outro') { showToast("Outro nodes cannot start new connections."); setConnectingNode(null); return; }
        else { allowConnection = true; }
        if (!allowConnection) { showToast("Invalid connection type for new node."); setConnectingNode(null); return; }
        const newNodeId = `node_${Date.now()}`;
        const newNode: AppNode = { id: newNodeId, type: 'default', position, data: { label: `New ${newNodeType} ${newNodeId.substring(5, 9)}`, content: '', type: newNodeType, } };
        setNodes(nds => [...nds, newNode]);
        setEdges(eds => [...eds, { id: `e${connectingNode.id}-${newNodeId}`, source: connectingNode.id, target: newNodeId, sourceHandle: connectingNode.handleId, type: 'custom', animated: true, data: { onDeleteEdge: handleDeleteEdge } }]);
      }
      setConnectingNode(null);
    }, [project, connectingNode, setNodes, setEdges, getNode, showToast, handleDeleteEdge]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
      const sourceNode = getNode(connection.source!); const targetNode = getNode(connection.target!);
      if (!sourceNode || !targetNode) { showToast("Error: Node not found for connection."); return; }
      if (connection.source === connection.target) { showToast("Cannot connect a node to itself."); return; }
      const sourceType = sourceNode.data.type; const targetType = targetNode.data.type;
      if (sourceType === 'intro' && (targetType !== 'scene' && targetType !== 'note')) { showToast("Intro nodes can only connect to Scene or Note nodes."); return; }
      else if (sourceType === 'scene' && (targetType !== 'scene' && targetType !== 'outro')) { showToast("Scene nodes can only connect to other Scene or Outro nodes."); return; }
      else if (sourceType === 'outro') { showToast("Outro nodes cannot start new connections."); return; }
      setEdges((eds) => addEdge({ ...connection, type: 'custom', animated: true, data: { onDeleteEdge: handleDeleteEdge } as CustomEdgeData }, eds));
      setConnectingNode(null);
    }, [setEdges, getNode, showToast, handleDeleteEdge]);

  const handleAddNode = useCallback(() => {
    const newNodeId = `node_${Date.now()}`;
    const { x, y } = reactFlowWrapper.current ? project({ x: reactFlowWrapper.current.clientWidth / 2, y: reactFlowWrapper.current.clientHeight / 2 }) : { x: 150, y: 150 };
    const newNode: AppNode = { id: newNodeId, type: 'default', position: { x, y }, data: { label: `New Scene ${newNodeId.substring(5, 9)}`, content: '', type: 'scene', } };
    setNodes(prevNodes => [...prevNodes, newNode]);
  }, [setNodes, project]);

  const handleDeleteNodeFromApp = useCallback((nodeId: string) => {
    const nodeToDelete = getNode(nodeId);
    if (nodeToDelete) deleteElements({ nodes: [nodeToDelete] });
  }, [getNode, deleteElements]);

  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    const selectedEdges = getEdges().filter((edge) => edge.selected);
    if (selectedNodes.length > 0 || selectedEdges.length > 0) deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  }, [getNodes, getEdges, deleteElements]);

  const handleAddConnectedNodeFromApp = useCallback((sourceNodeId: string, sourceNodePosition: XYPosition) => {
    const sourceNode = getNode(sourceNodeId); if (!sourceNode) return;
    let newNodeType: AppNodeData['type'] = 'scene';
    if (sourceNode.data.type === 'intro') newNodeType = 'scene';
    else if (sourceNode.data.type === 'scene') newNodeType = 'scene';
    else if (sourceNode.data.type === 'outro') { showToast("Outro nodes cannot start new connections."); return; }
    const newNodeId = `node_${Date.now()}`; const newX = sourceNodePosition.x + 200; const newY = sourceNodePosition.y + 50;
    const newNode: AppNode = { id: newNodeId, type: 'default', position: { x: newX, y: newY }, data: { label: `Connected ${newNodeType} ${newNodeId.substring(5,9)}`, content: '', type: newNodeType, }, selected: true };
    const newEdge: AppEdge = { id: `e${sourceNodeId}-${newNodeId}`, source: sourceNodeId, target: newNodeId, type: 'custom', animated: true, data: { onDeleteEdge: handleDeleteEdge } };
    setNodes(prevNodes => [...prevNodes, newNode]);
    setEdges(prevEdges => [...prevEdges, newEdge]);
  }, [setNodes, setEdges, getNode, showToast, handleDeleteEdge]);

  const handleTitleChangeFromApp = useCallback((nodeId: string, newTitle: string) => {
    setNodes((prevNodes) => prevNodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, label: newTitle } } : node ));
    setIsEditingTitle(null); 
  }, [setNodes]);

  const handleTitleDoubleClickFromApp = useCallback((nodeId: string) => setIsEditingTitle(nodeId), []);
  const handleTitleBlurFromApp = useCallback(() => setIsEditingTitle(null), []);
  const handleTitleKeyDownFromApp = useCallback((e: React.KeyboardEvent, nodeId?: string) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); setIsEditingTitle(null);
      if (nodeId && reactFlowWrapper.current) (reactFlowWrapper.current.querySelector('.react-flow__pane') as HTMLElement)?.focus();
    }}, []);
  
  const navigateToRootNode = useCallback(() => {
    const allTargetNodeIds = new Set(getEdges().map((edge) => edge.target));
    const rootNodes = getNodes().filter((node) => !allTargetNodeIds.has(node.id));
    if (rootNodes.length > 0) {
      const rootNodeId = rootNodes[0].id;
      setNodes((prevNodes) => prevNodes.map((node) => ({ ...node, selected: node.id === rootNodeId, })));
      const node = getNode(rootNodeId); if(node) fitView({nodes: [node], duration: 800});
    } else if (getNodes().length > 0) fitView(fitViewOptions);
  }, [getNodes, getEdges, setNodes, getNode, fitView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditingTitle) return; 
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
      let isCanvasFocused = false;
      if(reactFlowWrapper.current && activeElement) isCanvasFocused = reactFlowWrapper.current.contains(activeElement) && !isInputFocused;
      if (!isCanvasFocused && isInputFocused) return; 
      if (event.key === 'Delete' || event.key === 'Backspace') { if (isCanvasFocused || !isInputFocused) handleDeleteSelected(); }
      else if ((event.ctrlKey || event.metaKey) && event.key === 'a') { if (isCanvasFocused || !isInputFocused) { event.preventDefault(); setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))); setEdges((eds) => eds.map((e) => ({ ...e, selected: true }))); }}
      else if (event.key === 'Escape') { if (isCanvasFocused || !isInputFocused) { setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))); setEdges((eds) => eds.map((e) => ({ ...e, selected: false }))); setIsEditingTitle(null); }}
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelected, setNodes, setEdges, isEditingTitle]);

  const PADDING = 50; const PAN_SPEED = 10;
  const handleAutoPan = useCallback((event: MouseEvent | TouchEvent) => {
    if (!reactFlowWrapper.current) return;
    const { clientX, clientY } = event instanceof MouseEvent ? event : event.touches[0];
    const { left, top, width, height } = reactFlowWrapper.current.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (clientX < left + PADDING) dx = PAN_SPEED; else if (clientX > left + width - PADDING) dx = -PAN_SPEED;
    if (clientY < top + PADDING) dy = PAN_SPEED; else if (clientY > top + height - PADDING) dy = -PAN_SPEED;
    if (dx !== 0 || dy !== 0) { 
      project({x:0, y:0}); 
      setViewport({ x: 0, y: 0, zoom: 0 }); // Use a direct object instead of a function
    }
  }, [setViewport, project]);
  
  const onNodeDrag: NodeDragHandler = useCallback((event) => handleAutoPan(event as unknown as MouseEvent), [handleAutoPan]);
  const onSelectionDrag: SelectionDragHandler = useCallback((event) => handleAutoPan(event as unknown as MouseEvent), [handleAutoPan]);
  // Removed unused onConnectDrag function

  const nodesWithHandlers = useMemo(() => {
    return nodes.map(node => {
      const currentNodeData = node.data || {};
      return { ...node, data: { ...currentNodeData, onDeleteNode: handleDeleteNodeFromApp, onAddConnectedNode: (id: string) => handleAddConnectedNodeFromApp(id, node.position), onTitleChange: handleTitleChangeFromApp, onTitleDoubleClick: handleTitleDoubleClickFromApp, isEditingTitle: isEditingTitle === node.id, handleTitleBlur: handleTitleBlurFromApp, handleTitleKeyDown: (e: React.KeyboardEvent) => handleTitleKeyDownFromApp(e, node.id), }};
    });
  }, [nodes, handleDeleteNodeFromApp, handleAddConnectedNodeFromApp, handleTitleChangeFromApp, handleTitleDoubleClickFromApp, isEditingTitle, handleTitleBlurFromApp, handleTitleKeyDownFromApp]);
  
  const handleZoomToFit = useCallback(() => fitView(fitViewOptions), [fitView]);

  const handleExport = useCallback(() => {
    const cleanedNodes = nodes.map(({ selected, dragging, ...node }) => node);
    const cleanedEdges = edges.map(edge => { 
        const { onDeleteEdge, ...restOfData } = edge.data || {};
        return { ...edge, data: restOfData as CustomEdgeData }; 
    });
    const exportData = { nodes: cleanedNodes, edges: cleanedEdges };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'storyboard-export.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }, [nodes, edges]);

  return (
    <div className="app-container">
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}
      <header className="header">Storyboard</header>
      <div className="main-content">
        <aside className="sidebar">
          <nav className="nav-menu">
            <button className="nav-button">Story Web</button>
            <button className="nav-button">Scene Blocks</button>
            <button className="nav-button">Settings</button>
          </nav>
          <div className="sidebar-controls">
            <h4>Controls</h4>
            <button className="control-button" onClick={handleAddNode}>Add Node</button>
            <button className="control-button" onClick={navigateToRootNode}>Back to Root</button>
            {(nodes.some(node => node.selected) || edges.some(edge => edge.selected)) && (
              <button className="control-button delete" onClick={handleDeleteSelected}>Delete Selected</button> )}
            <button className="control-button" onClick={handleZoomToFit}>Zoom to Fit</button>
            <label className="control-label">
              <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /> Snap to Grid ({GRID_SIZE}px) </label>
            <button className="control-button" onClick={handleExport}>Download Story Web</button>
            {/* ADD THE RESET BUTTON HERE */}
            <button 
              className="control-button delete" // Using delete style for a destructive action
              onClick={handleResetAppData}
              title="Resets all nodes and connections to the default state. This cannot be undone."
            >
              Reset Story Web
            </button>
          </div>
        </aside>
        <main className="content">
          <div className="story-web-canvas" ref={reactFlowWrapper} tabIndex={0} >
            <ReactFlow
              nodes={nodesWithHandlers}
              edges={edgesWithDeleteHandler}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChangeInternalOriginal} 
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onNodeDrag={onNodeDrag}
              onSelectionDrag={onSelectionDrag}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes} 
              fitView
              fitViewOptions={fitViewOptions}
              panOnScroll
              selectionOnDrag
              panOnDrag={[1, 2]}
              selectionMode={"partial" as any}
              nodeOrigin={nodeOrigin}
              deleteKeyCode={null} 
            >
              <Controls />
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
              <Background variant={"dots" as any} gap={GRID_SIZE} size={1} />
            </ReactFlow>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return ( <ReactFlowProvider> <AppContent /> </ReactFlowProvider> );
}