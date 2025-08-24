import type { IDesign } from "@designcombo/types";
import { create } from "zustand";

// Helper function to extract analysis ID from timeline payload
function extractAnalysisIdFromPayload(payload: IDesign): string | null {
  // First, try to get from global window object (most reliable)
  const globalAnalysisId = (window as any).currentAnalysisId;
  if (globalAnalysisId) {
    console.log('🎯 Found analysis ID from global window:', globalAnalysisId);
    return globalAnalysisId;
  }

  // Second, try to get from localStorage currentAnalysisData
  const storedAnalysisData = localStorage.getItem('currentAnalysisData');
  if (storedAnalysisData) {
    try {
      const analysisData = JSON.parse(storedAnalysisData);
      if (analysisData.analysisId) {
        console.log('🎯 Found analysis ID from localStorage:', analysisData.analysisId);
        return analysisData.analysisId;
      }
    } catch (error) {
      console.warn('Failed to parse stored analysis data:', error);
    }
  }

  // Third, try to extract from current URL
  const currentUrl = window.location.href;
  const urlMatch = currentUrl.match(/analysis\/([a-f0-9-]+)/);
  if (urlMatch) {
    console.log('🎯 Found analysis ID from URL:', urlMatch[1]);
    return urlMatch[1];
  }

  // Fourth, try to extract from trackItemsMap metadata (if segments have analysis info)
  if (payload.trackItemsMap) {
    for (const item of Object.values(payload.trackItemsMap)) {
      if (item.metadata?.sceneId && item.details?.src) {
        // Extract from segment URL pattern: /api/segment/{analysis_id}/...
        const srcMatch = item.details.src.match(/\/api\/segment\/([a-f0-9-]+)\//);
        if (srcMatch) {
          console.log('🎯 Found analysis ID from segment URL:', srcMatch[1]);
          return srcMatch[1];
        }
      }
    }
  }

  // Last resort: try to extract from timeline localStorage keys
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith('timeline-') && key.includes('-')) {
      const parts = key.split('-');
      if (parts.length >= 2 && parts[1].length > 10) {
        console.log('🎯 Found analysis ID from timeline key:', parts[1]);
        return parts[1];
      }
    }
  }

  console.warn('❌ Could not extract analysis ID from any source');
  return null;
}

interface Output {
  url: string;
  type: string;
}

interface DownloadState {
  projectId: string;
  exporting: boolean;
  exportType: "json" | "mp4" | "gif";
  progress: number;
  output?: Output;
  payload?: IDesign;
  displayProgressModal: boolean;
  actions: {
    setProjectId: (projectId: string) => void;
    setExporting: (exporting: boolean) => void;
    setExportType: (exportType: "json" | "mp4" | "gif") => void;
    setProgress: (progress: number) => void;
    setState: (state: Partial<DownloadState>) => void;
    setOutput: (output: Output) => void;
    startExport: () => void;
    setDisplayProgressModal: (displayProgressModal: boolean) => void;
  };
}

export const useDownloadState = create<DownloadState>((set, get) => ({
  projectId: "",
  exporting: false,
  exportType: "mp4",
  progress: 0,
  displayProgressModal: false,
  actions: {
    setProjectId: (projectId) => set({ projectId }),
    setExporting: (exporting) => set({ exporting }),
    setExportType: (exportType) => set({ exportType }),
    setProgress: (progress) => set({ progress }),
    setState: (state) => set({ ...state }),
    setOutput: (output) => set({ output }),
    setDisplayProgressModal: (displayProgressModal) =>
      set({ displayProgressModal }),
    startExport: async () => {
      try {
        set({ exporting: true, displayProgressModal: true, progress: 0 });

        const { payload } = get();
        const exportType = get().exportType;

        if (!payload) throw new Error("Payload is not defined");

        if (exportType === "mp4") {
          // Use new Remotion-based export system
          console.log('🎬 Using Remotion-based MP4 export...');

          // Debug: Log the payload structure
          console.log('📊 Timeline payload keys:', Object.keys(payload));
          console.log('🎞️ trackItemsMap:', payload.trackItemsMap ? Object.keys(payload.trackItemsMap).length + ' items' : 'not found');
          console.log('📝 Sample payload structure:', {
            id: payload.id,
            duration: payload.duration,
            size: payload.size,
            trackItemsMapKeys: payload.trackItemsMap ? Object.keys(payload.trackItemsMap) : [],
            trackItemIds: payload.trackItemIds || 'not found'
          });

          // Use the new /api/render endpoint for Remotion-based export
          const response = await fetch("/api/render", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              design: payload,
              options: {
                fps: 30,
                size: payload.size,
                format: "mp4",
              },
            }),
          });

          if (!response.ok) throw new Error("Failed to submit export request.");

          const jobInfo = await response.json();
          const videoId = jobInfo.video.id;

          console.log(`🎬 Started Remotion render job: ${videoId}`);

          // Polling for status updates
          const checkStatus = async () => {
            const statusResponse = await fetch(
              `/api/render?id=${videoId}&type=VIDEO_RENDERING`,
            );

            if (!statusResponse.ok)
              throw new Error("Failed to fetch export status.");

            const statusInfo = await statusResponse.json();
            const { status, progress, url } = statusInfo.video;

            set({ progress });

            if (status === "COMPLETED") {
              console.log('✅ Remotion export completed!');
              set({
                exporting: false,
                output: { url, type: exportType },
                progress: 100
              });
            } else if (status === "PENDING") {
              setTimeout(checkStatus, 2500);
            } else if (status === "FAILED") {
              throw new Error("Remotion rendering failed");
            }
          };

          checkStatus();
        } else {
          // Original export logic for other formats
          const response = await fetch("/api/render", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              design: payload,
              options: {
                fps: 30,
                size: payload.size,
                format: exportType === "gif" ? "gif" : "mp4",
              },
            }),
          });

          if (!response.ok) throw new Error("Failed to submit export request.");

          const jobInfo = await response.json();
          const videoId = jobInfo.video.id;

          // Polling for status updates
          const checkStatus = async () => {
            const statusResponse = await fetch(
              `/api/render?id=${videoId}&type=VIDEO_RENDERING`,
            );

            if (!statusResponse.ok)
              throw new Error("Failed to fetch export status.");

            const statusInfo = await statusResponse.json();
            const { status, progress, url } = statusInfo.video;

            set({ progress });

            if (status === "COMPLETED") {
              set({ exporting: false, output: { url, type: exportType } });
            } else if (status === "PENDING") {
              setTimeout(checkStatus, 2500);
            }
          };

          checkStatus();
        }
      } catch (error) {
        console.error('❌ Export failed:', error);

        // Fallback: export timeline data as JSON
        const { payload } = get();
        if (payload) {
          const jsonString = JSON.stringify(payload, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const href = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = href;
          link.download = `timeline-fallback-export-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(href);
          console.log('✅ Exported timeline data as JSON fallback');
        }

        set({ exporting: false, displayProgressModal: false });
      }
    },
  },
}));
