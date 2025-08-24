import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDownloadState } from "./store/use-download-state";
import { Button } from "@/components/ui/button";
import { CircleCheckIcon, XIcon, Download, Video, Clapperboard, Sparkles } from "lucide-react";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { download } from "@/utils/download";
import { Progress } from "@/components/ui/progress";

const DownloadProgressModal = () => {
  const { progress, displayProgressModal, output, actions, exportType } =
    useDownloadState();
  const isCompleted = progress === 100;

  const handleDownload = async () => {
    if (output?.url) {
      await download(output.url, `timeline-export.${exportType}`);
      console.log("downloading");
    }
  };

  // Determine current stage based on progress
  const getProgressStage = () => {
    if (progress < 30) return { icon: Clapperboard, text: "Generating composition...", color: "text-blue-400" };
    if (progress < 50) return { icon: Video, text: "Bundling timeline...", color: "text-purple-400" };
    if (progress < 70) return { icon: Sparkles, text: "Processing effects...", color: "text-pink-400" };
    return { icon: Download, text: "Rendering video...", color: "text-cyan-400" };
  };

  const currentStage = getProgressStage();
  return (
    <Dialog
      open={displayProgressModal}
      onOpenChange={actions.setDisplayProgressModal}
    >
      <DialogContent className="flex h-[627px] flex-col gap-0 bg-background p-0 sm:max-w-[844px]">
        <DialogTitle className="hidden" />
        <DialogDescription className="hidden" />
        <XIcon
          onClick={() => actions.setDisplayProgressModal(false)}
          className="absolute right-4 top-5 h-5 w-5 text-zinc-400 hover:cursor-pointer hover:text-zinc-500"
        />
        <div className="flex h-16 items-center border-b px-4 font-medium">
          Download
        </div>
        {isCompleted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
            <div className="relative">
              <div className="w-32 h-32 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <CircleCheckIcon className="h-16 w-16 text-white" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                Export Complete!
              </div>
              <div className="text-gray-400 text-lg">
                Your professional video is ready for download
              </div>
            </div>

            <Button
              onClick={handleDownload}
              className="w-full max-w-md h-14 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-xl shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-green-400"
            >
              <Download width={24} className="mr-3" />
              Download Video
            </Button>

            <div className="text-center text-gray-400 space-y-1">
              <div className="text-sm font-medium">🎉 Professional quality export complete!</div>
              <div className="text-xs">Includes all timeline elements, effects, and transitions</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
            {/* Progress Circle */}
            <div className="relative">
              <div className="w-32 h-32">
                {/* Background circle */}
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="rgb(55, 65, 81)"
                    strokeWidth="8"
                    fill="none"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgb(6, 182, 212)" />
                      <stop offset="100%" stopColor="rgb(236, 72, 153)" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Icon in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {React.createElement(currentStage.icon, {
                    className: `w-8 h-8 ${currentStage.color} animate-pulse`
                  })}
                </div>
              </div>
            </div>

            {/* Progress Text */}
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
                {Math.floor(progress)}%
              </div>
              <div className={`font-semibold text-lg ${currentStage.color}`}>
                {currentStage.text}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-md space-y-2">
              <Progress
                value={progress}
                className="h-3 bg-gray-700"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>Professional Video Export</span>
                <span>{exportType.toUpperCase()}</span>
              </div>
            </div>

            {/* Info Text */}
            <div className="text-center text-gray-400 space-y-1">
              <div className="font-medium">🎬 Rendering timeline with all effects</div>
              <div className="text-sm">Including subtitles, transitions, and visual elements</div>
              <div className="text-xs">This may take a few minutes for complex timelines</div>
            </div>

            <Button
              variant="outline"
              className="border-gray-600 hover:border-gray-500"
              onClick={() => actions.setDisplayProgressModal(false)}
            >
              Hide Progress
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DownloadProgressModal;
