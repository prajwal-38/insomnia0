import Draggable from "@/components/shared/draggable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dispatch } from "@designcombo/events";
import { ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { IVideo } from "@designcombo/types";
import React, { useState, useCallback, useEffect } from "react";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
// FileUploader and Upload removed - upload functionality moved to project creation
import { Button } from "@/components/ui/button";
import { X, Video as VideoIcon, Trash2, MoreVertical } from "lucide-react";
// createUploadsDetails removed - upload functionality moved to project creation
import { cn } from "@/lib/utils";
import { timeToString } from "../utils/time";
import useVideosStore from "../store/use-videos-store";
import type { VideoItem } from "../store/use-videos-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Interface for uploaded video data during upload process
interface UploadingVideo {
  id: string;
  name: string;
  url: string;
  preview?: string;
  duration?: number;
  width?: number;
  height?: number;
  uploading?: boolean;
  progress?: number;
}

export const Videos = () => {
  const isDraggingOverTimeline = useIsDraggingOverTimeline();
  const {
    getUploadedVideos,
    addUploadedVideo,
    removeUploadedVideo,
    clearUploadedVideos
  } = useVideosStore();

  // Upload functionality removed - videos are now uploaded during project creation
  // const [uploadingVideos, setUploadingVideos] = useState<UploadingVideo[]>([]);
  // const [showUploader, setShowUploader] = useState(false);

  const uploadedVideos = getUploadedVideos();

  // Handle unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection in Videos component:', event.reason);
      event.preventDefault(); // Prevent the default browser behavior
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Handle clearing uploaded videos with confirmation
  const handleClearUploadedVideos = () => {
    if (uploadedVideos.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to clear all ${uploadedVideos.length} uploaded video${uploadedVideos.length > 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        clearUploadedVideos();
        console.log('Uploaded videos cleared successfully');
      } catch (error) {
        console.error('Error clearing uploaded videos:', error);
      }
    }
  };

  // Handle clearing all video data (including localStorage)
  const handleClearAllVideoData = () => {
    if (uploadedVideos.length === 0) {
      alert('No uploaded videos to clear.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete all uploaded videos and clear all video data? This will:\n\n• Remove all ${uploadedVideos.length} uploaded videos\n• Clear video storage data\n• This action cannot be undone\n\nClick OK to proceed or Cancel to abort.`
    );

    if (confirmed) {
      try {
        // Clear the store
        clearUploadedVideos();

        // Clear localStorage data
        localStorage.removeItem('videos-storage');

        // Clear any uploading videos - functionality removed
        // setUploadingVideos([]);

        console.log('All video data cleared successfully');
        alert('All video data has been cleared successfully.');
      } catch (error) {
        console.error('Error clearing all video data:', error);
        alert('Error occurred while clearing video data. Please try again.');
      }
    }
  };

  const handleAddVideo = (payload: Partial<IVideo>) => {
    try {
      // payload.details.src = "https://cdn.designcombo.dev/videos/timer-20s.mp4";
      dispatch(ADD_VIDEO, {
        payload,
        options: {
          resourceId: "main",
          scaleMode: "fit",
        },
      });
    } catch (error) {
      console.error('Error adding video to timeline:', error);
    }
  };

  // extractVideoMetadata function removed - upload functionality moved to project creation

  // Upload functionality removed - videos are now uploaded during project creation
  // const handleVideoUpload = useCallback(async (files: File[]) => {

  // Upload functionality removed - videos are now uploaded during project creation
  // }, [extractVideoMetadata, addUploadedVideo]);



  return (
    <div className="flex flex-1 flex-col">
      <div className="text-text-primary flex h-12 flex-none items-center justify-between px-4 text-sm font-medium">
        <span>Videos</span>
        <div className="flex items-center gap-1">
          {/* Upload button removed - video upload now happens during project creation */}

          {/* Clear Videos Dropdown */}
          {uploadedVideos.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleClearUploadedVideos}
                  className="text-orange-600 hover:text-orange-700 focus:text-orange-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Uploaded Videos ({uploadedVideos.length})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClearAllVideoData}
                  className="text-red-600 hover:text-red-700 focus:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Video Data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ScrollArea>
        <div className="px-4 space-y-4">
          {/* Upload Section removed - video upload now happens during project creation */}

          {/* Uploading Videos Section removed - upload functionality moved to project creation */}

          {/* Videos Section (Uploaded only, since stock videos are removed) */}
          {uploadedVideos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <div className="text-xs font-medium text-muted-foreground">
                  My Videos ({uploadedVideos.length})
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearUploadedVideos}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              </div>
              <div className="masonry-sm">
                {/* Render uploaded videos */}
                {uploadedVideos.map((video) => (
                  <UploadedVideoItem
                    key={video.id}
                    video={video}
                    shouldDisplayPreview={!isDraggingOverTimeline}
                    handleAddVideo={handleAddVideo}
                    onRemove={removeUploadedVideo}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no videos */}
          {uploadedVideos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <VideoIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground mb-2">No videos yet</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Videos are uploaded during project creation
              </p>
              <p className="text-xs text-muted-foreground/70">
                Create a new project to upload and analyze your video
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const VideoItem = ({
  handleAddImage,
  video,
  shouldDisplayPreview,
}: {
  handleAddImage: (payload: Partial<IVideo>) => void;
  video: Partial<IVideo>;
  shouldDisplayPreview: boolean;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: `url(${video.preview})`,
      backgroundSize: "cover",
      width: "80px",
      height: "80px",
    }),
    [video.preview],
  );

  return (
    <Draggable
      data={{
        ...video,
        metadata: {
          previewUrl: video.preview,
        },
      }}
      renderCustomPreview={<div style={style} className="draggable" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      <div
        onClick={() => {
          try {
            handleAddImage({
              id: generateId(),
              details: {
                src: video.details!.src,
              },
              metadata: {
                previewUrl: video.preview,
              },
            } as any);
          } catch (error) {
            console.error('Error adding stock video to timeline:', error);
          }
        }}
        className="flex w-full items-center justify-center overflow-hidden bg-background pb-2"
      >
        <img
          draggable={false}
          src={video.preview}
          className="h-full w-full rounded-md object-cover"
          alt="image"
        />
      </div>
    </Draggable>
  );
};

// UploadingVideoItem component removed - upload functionality moved to project creation

const UploadedVideoItem = ({
  video,
  shouldDisplayPreview,
  handleAddVideo,
  onRemove,
}: {
  video: VideoItem;
  shouldDisplayPreview: boolean;
  handleAddVideo: (payload: Partial<IVideo>) => void;
  onRemove: (videoId: string) => void;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: video.preview ? `url(${video.preview})` : 'none',
      backgroundSize: "cover",
      width: "80px",
      height: "80px",
    }),
    [video.preview],
  );

  const handleClick = () => {
    try {
      handleAddVideo({
        id: generateId(),
        details: {
          src: video.details.src,
        },
        metadata: {
          previewUrl: video.preview,
        },
        duration: video.duration,
      } as any);
    } catch (error) {
      console.error('Error adding uploaded video to timeline:', error);
    }
  };

  const dragData = {
    id: video.id,
    type: "video",
    details: { src: video.details.src },
    metadata: { previewUrl: video.preview },
    duration: video.duration,
  };

  const content = (
    <div className="relative">
      <div
        onClick={handleClick}
        className="flex w-full items-center justify-center overflow-hidden bg-background pb-2 relative cursor-pointer"
      >
        {video.preview ? (
          <img
            draggable={false}
            src={video.preview}
            className="h-full w-full rounded-md object-cover"
            alt={video.name || "Uploaded video"}
          />
        ) : (
          <div className="h-20 w-full rounded-md bg-muted flex items-center justify-center">
            <VideoIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Remove Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(video.id);
          }}
          className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70"
        >
          <X className="h-3 w-3 text-white" />
        </Button>
      </div>

      {/* Video Name and Duration */}
      <div className="text-xs text-muted-foreground truncate px-1 mt-1">
        <div className="truncate">{video.name || "Uploaded Video"}</div>
        {video.duration && (
          <div className="text-xs opacity-75">
            {timeToString({ time: video.duration })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Draggable
      data={dragData}
      renderCustomPreview={<div style={style} className="draggable" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      {content}
    </Draggable>
  );
};
