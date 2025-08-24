import useStore from "../store/use-store";
import { useEffect, useRef, useState } from "react";
import { Droppable } from "@/components/ui/droppable";
import { DroppableArea } from "./droppable";

const SceneEmpty = () => {
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [desiredSize, setDesiredSize] = useState({ width: 0, height: 0 });
  const { size } = useStore();

  useEffect(() => {
    const container = containerRef.current!;
    const PADDING = 96;
    const containerHeight = container.clientHeight - PADDING;
    const containerWidth = container.clientWidth - PADDING;
    const { width, height } = size;

    const desiredZoom = Math.min(
      containerWidth / width,
      containerHeight / height,
    );

    // Reduce the drop zone size by 40%
    const scaleFactor = 0.6;
    setDesiredSize({
      width: width * desiredZoom * scaleFactor,
      height: height * desiredZoom * scaleFactor,
    });
    setIsLoading(false);
  }, [size]);

  const onSelectFiles = (files: File[]) => {
    console.log({ files });
  };

  return (
    <div ref={containerRef} className="absolute z-50 flex h-full w-full flex-1">
      {!isLoading ? (
        <Droppable
          maxFileCount={4}
          maxSize={4 * 1024 * 1024}
          disabled={false}
          onValueChange={onSelectFiles} 
          className="h-full w-full flex-1 bg-background "
        >
          <DroppableArea
            onDragStateChange={setIsDraggingOver}
            className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center border border-dashed text-center transition-colors duration-200 ease-in-out ${
              isDraggingOver ? "border-white bg-white/40" : "border-white/70"
            }`}
            style={{
              width: desiredSize.width,
              height: desiredSize.height,
            }}
          >
            <div className="flex flex-col items-center justify-center gap-4 pb-12">
              <img
                  src="/plus-icon.gif"
                  alt="Add content"
                  className="h-50 w-50"
                  aria-hidden="true"
                />
                <div>
                <p className="font-bold text-white">Nothing in the timeline</p>
                </div>
            </div>
          </DroppableArea>
        </Droppable>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-background-subtle text-sm text-muted-foreground">
          Loading...
        </div>
      )}
    </div>
  );
};

export default SceneEmpty;
