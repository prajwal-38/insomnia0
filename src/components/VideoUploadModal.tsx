import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { X } from 'lucide-react';
import type { ApiAnalysisResponse, SegmentationMethod } from '../types';
import VideoUploader from '../VideoUploader';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (result: ApiAnalysisResponse) => void;
  onUploadError?: (error: string) => void;
}

export function VideoUploadModal({ isOpen, onClose, onUploadComplete, onUploadError }: VideoUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [segmentationMethod, setSegmentationMethod] = useState<SegmentationMethod>('cut-based');
  const [triggerProcessing, setTriggerProcessing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to validate video duration
  const validateVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;

        if (duration > 30) {
          setError(`Video duration (${Math.round(duration)}s) exceeds the 30-second limit. Please upload a shorter video.`);
          resolve(false);
        } else {
          resolve(true);
        }
      };

      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        setError('Unable to read video file. Please try a different file.');
        resolve(false);
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      const isValidDuration = await validateVideoDuration(file);
      if (isValidDuration) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    }
  };

  // Delegate to VideoUploader for processing
  const handleSubmit = () => {
    if (selectedFile) {
      console.log('🎯 VideoUploadModal: Delegating to VideoUploader with file:', selectedFile.name, 'method:', segmentationMethod);
      setIsProcessing(true);
      setTriggerProcessing(true);
    }
  };

  // Handle successful analysis from VideoUploader
  const handleAnalysisComplete = (result: ApiAnalysisResponse) => {
    console.log('✅ VideoUploadModal: Received analysis result from VideoUploader:', {
      analysisId: result.analysisId,
      fileName: result.fileName,
      sceneCount: result.scenes?.length || 0
    });

    // Pass result to parent and close modal
    onUploadComplete(result);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsProcessing(false);
    setTriggerProcessing(false);
    handleClose();
  };

  // Handle error from VideoUploader
  const handleAnalysisError = (error: string) => {
    console.error('❌ VideoUploadModal: Received error from VideoUploader:', error);
    setIsProcessing(false);
    setTriggerProcessing(false);
    if (onUploadError) {
      onUploadError(error);
    }
  };

  // Handle processing completion (success or error)
  const handleProcessingComplete = () => {
    setTriggerProcessing(false);
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setError(null);
      const isValidDuration = await validateVideoDuration(file);
      if (isValidDuration) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
      }
    }
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleClose = () => {
    if (!isProcessing) {
      setSelectedFile(null);
      setSegmentationMethod('cut-based');
      setTriggerProcessing(false);
      setError(null);
      onClose();
    }
  };

  // Removed segmentationOptions - using simple radio buttons like VideoUploader

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
        border: '1px solid rgba(64, 224, 208, 0.3)'
      }}>
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold bg-clip-text text-transparent"
                         style={{
                           backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                         }}>
              Create New Project
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isProcessing}
              className="h-8 w-8 p-0 hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Upload Section */}
          <Card className="border-gray-700 bg-gray-800/50">
            <CardContent className="p-4">
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} transition-all duration-200 ease-in-out`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFileInput();}}
                title="Click or drag & drop a video file here"
                style={{
                  border: `2px dashed ${isDragging ? '#40E0D0' : '#666'}`,
                  borderRadius: '8px',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging
                    ? 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(255, 105, 180, 0.1) 100%)'
                    : 'transparent',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="text-lg font-medium text-white">
                      📹 {selectedFile.name.length > 35 ? selectedFile.name.substring(0,32) + "..." : selectedFile.name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">🎬</div>
                    <div className="text-base font-medium text-white">
                      Drag & drop your video here
                    </div>
                    <div className="text-sm text-gray-400">
                      or click to browse files
                    </div>
                    <div className="text-xs text-gray-500">
                      Supports MP4, MOV, AVI and other video formats (max 30 seconds)
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Segmentation Method Selection */}
          <Card className="border-gray-700 bg-gray-800/50">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-pink-400">
                    Segmentation Method
                  </h3>
                  <div className="text-xs text-gray-400">
                    Current: <span className="text-cyan-400 font-medium">{segmentationMethod === 'cut-based' ? 'Cut-based' : segmentationMethod === 'ai-based' ? 'AI-based' : 'Manual'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Cut-based Option */}
                  <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                    segmentationMethod === 'cut-based'
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/30'
                  }`}>
                    <input
                      type="radio"
                      value="cut-based"
                      checked={segmentationMethod === 'cut-based'}
                      onChange={(e) => {
                        console.log('DEBUG: Changing to cut-based');
                        setSegmentationMethod(e.target.value as SegmentationMethod);
                      }}
                      disabled={isProcessing}
                      className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 focus:ring-cyan-500 focus:ring-2"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium text-sm">⚡ Cut-based</span>
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Fast</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Fast visual cut detection using scene transitions</p>
                    </div>
                  </label>

                  {/* AI-based Option */}
                  <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                    segmentationMethod === 'ai-based'
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/30'
                  }`}>
                    <input
                      type="radio"
                      value="ai-based"
                      checked={segmentationMethod === 'ai-based'}
                      onChange={(e) => {
                        console.log('DEBUG: Changing to ai-based');
                        setSegmentationMethod(e.target.value as SegmentationMethod);
                      }}
                      disabled={isProcessing}
                      className="w-4 h-4 text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-500 focus:ring-2"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium text-sm">🤖 AI-based</span>
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Smart</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Intelligent content-aware segmentation with context understanding</p>
                    </div>
                  </label>

                  {/* Manual Segmentation Option - Disabled */}
                  <label className="flex items-center p-3 rounded-lg border border-gray-700 bg-gray-800/30 cursor-not-allowed opacity-60">
                    <input
                      type="radio"
                      value="manual"
                      checked={false}
                      disabled={true}
                      className="w-4 h-4 text-gray-500 bg-gray-700 border-gray-600 cursor-not-allowed"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium text-sm">✂️ Manual Segmentation</span>
                        <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Coming Soon</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Manually define scene boundaries with precision timeline controls</p>
                    </div>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Card className="border-red-500/30 bg-red-500/10">
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  <div className="text-red-400">⚠️</div>
                  <div>
                    <p className="text-red-400 font-medium text-sm">Upload Error</p>
                    <p className="text-xs text-gray-300">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Button */}
          {selectedFile && (
            <Button
              onClick={handleSubmit}
              disabled={isProcessing || segmentationMethod === 'manual'}
              className="w-full h-10 text-base font-semibold bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Analyzing Video...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>🚀</span>
                  <span>Analyze Selected Video</span>
                </div>
              )}
            </Button>
          )}

          {/* Processing Status */}
          {isProcessing && (
            <Card className="border-blue-500/30 bg-blue-500/10">
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <div>
                    <p className="text-blue-400 font-medium text-sm">Processing your video...</p>
                    <p className="text-xs text-gray-400">Using proven sidebar VideoUploader logic</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hidden VideoUploader for delegation */}
          <div style={{ display: 'none' }}>
            <VideoUploader
              onAnalysisComplete={handleAnalysisComplete}
              onAnalysisError={handleAnalysisError}
              externalFile={selectedFile}
              externalSegmentationMethod={segmentationMethod}
              externalTrigger={triggerProcessing}
              onExternalProcessingComplete={handleProcessingComplete}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
