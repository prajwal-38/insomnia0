import React from "react"
import { type MediaBinItem } from "./types"

interface MediaBinProps {
  mediaBinItems: MediaBinItem[]
  onAddMedia: (file: File) => Promise<void>
  onAddText: () => void
}

export const MediaBin: React.FC<MediaBinProps> = ({
  mediaBinItems,
  onAddMedia,
  onAddText,
}) => {
  return (
   <div className="w-1/4 bg-card p-6 rounded-2xl shadow-2xl border border-border overflow-y-auto max-h-[90vh] flex flex-col">
  <h3 className="text-xl font-bold text-card-foreground mb-6 pb-2 border-b border-border tracking-wide">
    📁 Media Bin
  </h3>
  
  <div className="space-y-5 flex-1 overflow-y-auto pr-1">
    {mediaBinItems.map(item => (
      <div
        key={item.id}
        className="p-4 bg-secondary border border-border rounded-lg shadow-sm text-secondary-foreground cursor-grab hover:bg-accent transition duration-150 ease-in-out"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", JSON.stringify(item));
          console.log("Dragging item:", item.name);
        }}
      >
        <div className="flex flex-col space-y-1">
          <span className="text-lg">
            {item.mediaType === "video" ? "🎥" : item.mediaType === "image" ? "🖼️" : "📝"} {item.name}
          </span>
          {item.durationInSeconds && (
            <span className="text-muted-foreground text-sm">
              Duration: {item.durationInSeconds.toFixed(1)}s
            </span>
          )}
        </div>
      </div>
    ))}

    {mediaBinItems.length === 0 && (
      <p className="text-sm text-muted-foreground text-center">Add media or text elements.</p>
    )}
  </div>
</div>

  )
} 