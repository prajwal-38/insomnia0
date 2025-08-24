import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IVideo } from "@designcombo/types";
import { VIDEOS as STOCK_VIDEOS } from "../data/video";

export interface VideoItem {
  id: string;
  type: "video";
  details: {
    src: string;
    width?: number;
    height?: number;
    blur?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
  };
  preview?: string;
  duration?: number;
  name?: string;
  isUploaded?: boolean;
  uploadedAt?: number;
  metadata?: {
    previewUrl?: string;
  };
}

interface VideosState {
  videos: VideoItem[];
  uploadedVideos: VideoItem[];
  
  // Actions
  addUploadedVideo: (video: Omit<VideoItem, 'isUploaded' | 'uploadedAt'>) => void;
  removeUploadedVideo: (videoId: string) => void;
  getAllVideos: () => VideoItem[];
  getUploadedVideos: () => VideoItem[];
  getStockVideos: () => VideoItem[];
  clearUploadedVideos: () => void;
}

const useVideosStore = create<VideosState>()(
  persist(
    (set, get) => ({
      videos: STOCK_VIDEOS.map(video => ({
        ...video,
        id: video.id || `stock_${Date.now()}_${Math.random()}`,
        type: "video" as const,
        details: video.details || { src: "" },
        isUploaded: false,
      })) as VideoItem[],
      
      uploadedVideos: [],

      addUploadedVideo: (video) => {
        const newVideo: VideoItem = {
          ...video,
          isUploaded: true,
          uploadedAt: Date.now(),
        };
        
        set((state) => ({
          uploadedVideos: [...state.uploadedVideos, newVideo],
          videos: [...state.videos, newVideo],
        }));
      },

      removeUploadedVideo: (videoId) => {
        set((state) => ({
          uploadedVideos: state.uploadedVideos.filter(v => v.id !== videoId),
          videos: state.videos.filter(v => v.id !== videoId),
        }));
      },

      getAllVideos: () => {
        const state = get();
        return state.videos;
      },

      getUploadedVideos: () => {
        const state = get();
        return state.uploadedVideos;
      },

      getStockVideos: () => {
        const state = get();
        return state.videos.filter(v => !v.isUploaded);
      },

      clearUploadedVideos: () => {
        set((state) => ({
          uploadedVideos: [],
          videos: state.videos.filter(v => !v.isUploaded),
        }));
      },
    }),
    {
      name: "videos-storage",
      partialize: (state) => ({
        uploadedVideos: state.uploadedVideos,
      }),
    }
  )
);

export default useVideosStore;
