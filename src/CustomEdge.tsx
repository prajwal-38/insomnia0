import {
    BaseEdge,
    EdgeLabelRenderer,
    type EdgeProps, // <--- Corrected: type-only import
    getBezierPath,
    useReactFlow,
  } from 'reactflow';

// Define the data prop type for the custom edge
export interface CustomEdgeData {
  onDeleteEdge?: (id: string) => void;
}

const CustomEdge: React.FC<EdgeProps<CustomEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = () => {
    if (data?.onDeleteEdge) {
      data.onDeleteEdge(id);
    } else {
      // Fallback if handler not passed, though it should be
      setEdges((es) => es.filter((edge) => edge.id !== id));
    }
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan edge-interaction-wrapper"
        >
          <button className="edge-delete-button" onClick={handleDelete} title="Remove connection">
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default CustomEdge;