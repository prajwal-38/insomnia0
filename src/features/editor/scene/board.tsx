import { useState } from "react";
import { DroppableArea } from "./droppable";
import useStore from "../store/use-store";

const SceneBoard = ({
  size,
  children,
}: {
  size: { width: number; height: number };
  children: React.ReactNode;
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { backgroundColor } = useStore();

  return (
    <DroppableArea
      id="artboard"
      onDragStateChange={setIsDraggingOver}
      style={{
        width: size.width,
        height: size.height,
      }}
      className="pointer-events-auto"
    >
      <div
        style={{
          width: size.width,
          height: size.height,
          boxShadow: `0 0 0 5000px ${backgroundColor}`,
        }}
        className={`pointer-events-none absolute z-50 border border-white/15 transition-colors duration-200 ease-in-out ${isDraggingOver ? "border-4 border-dashed border-white bg-white/[0.075]" : "bg-transparent"}`}
      />
      {children}
    </DroppableArea>
  );
};

export default SceneBoard;
