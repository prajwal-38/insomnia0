// --- START OF FILE VideoUploader.tsx ---
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ApiAnalysisResponse, SegmentationMethod } from './types'; // UPDATED
import { buildApiUrl } from './config/environment';

interface VideoUploaderProps {
  // Modified: onAnalysisComplete now receives the new API response structure
  onAnalysisComplete: (data: ApiAnalysisResponse) => void;
  onAnalysisError: (error: string) => void;
  // Optional external control for programmatic triggering
  externalFile?: File | null;
  externalSegmentationMethod?: SegmentationMethod;
  externalTrigger?: boolean;
  onExternalProcessingComplete?: () => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({
  onAnalysisComplete,
  onAnalysisError,
  externalFile,
  externalSegmentationMethod,
  externalTrigger,
  onExternalProcessingComplete
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [segmentationMethod, setSegmentationMethod] = useState<SegmentationMethod>('cut-based');
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

  const processFile = useCallback(async (file: File | null, method?: SegmentationMethod) => {
    if (!file) {
      setError('Please select a video file.');
      return;
    }
    if (!file.type.startsWith('video/')) {
        setError('Invalid file type. Please select a video file (e.g., .mp4, .mov).');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
    }
    setIsLoading(true);
    setError(null);

    // Use provided method or current segmentation method
    const methodToUse = method || segmentationMethod;

    // Debug: Log the segmentation method being sent
    console.log('DEBUG: Sending segmentation_method:', methodToUse);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('segmentation_method', methodToUse);

    // Debug: Log form data contents
    console.log('DEBUG: FormData contents:');
    for (let [key, value] of formData.entries()) {
      console.log(`  ${key}:`, value);
    }

    try {
      const apiUrl = buildApiUrl('/api/analyze');
      console.log('🚀 VideoUploader: Uploading to:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error during analysis.' }));
        throw new Error(errorData.detail || `Analysis failed with status: ${response.status}`);
      }
      const result: ApiAnalysisResponse = await response.json(); // UPDATED expected type
      onAnalysisComplete(result); // Pass the whole structured response
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // Notify external caller that processing is complete
      if (onExternalProcessingComplete) {
        onExternalProcessingComplete();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred while uploading or analyzing the video.';
      setError(errorMessage);
      onAnalysisError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [onAnalysisComplete, onAnalysisError, segmentationMethod, onExternalProcessingComplete]);

  // Handle external trigger
  useEffect(() => {
    if (externalTrigger && externalFile && externalSegmentationMethod) {
      console.log('🎯 VideoUploader: External trigger received, processing file:', externalFile.name);
      processFile(externalFile, externalSegmentationMethod);
    }
  }, [externalTrigger, externalFile, externalSegmentationMethod, processFile]);

  const handleSubmit = () => { processFile(selectedFile); };
  const handleRetry = () => {
    if (selectedFile) processFile(selectedFile);
    else setError("No file selected to retry.");
  };
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); setIsDragging(false); }, []);
  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); setIsDragging(false);
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
  const triggerFileInput = () => { fileInputRef.current?.click(); };

  return (
    <div className="video-uploader-container">
      {/* Keep h4 inside panel-section in Sidebar.tsx */}
      {/* <h4>Analyze Video</h4> */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFileInput();}}
        title="Click or drag & drop a video file here"
      >
        <input type="file" accept="video/*" onChange={handleFileChange} ref={fileInputRef} style={{ display: 'none' }} />
        {selectedFile ? (<p>Selected: {selectedFile.name.length > 25 ? selectedFile.name.substring(0,22) + "..." : selectedFile.name}</p>) : (<p>Drag & drop or click</p>)}
      </div>

      {/* Segmentation Method Selection */}
      <div className="segmentation-method-selector">
        <p style={{fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem 0'}}>
          Current method: {segmentationMethod}
        </p>
        <label className="segmentation-method-label">
          <input
            type="radio"
            value="cut-based"
            checked={segmentationMethod === 'cut-based'}
            onChange={(e) => {
              console.log('DEBUG: Changing to cut-based');
              setSegmentationMethod(e.target.value as SegmentationMethod);
            }}
            disabled={isLoading}
          />
          <span className="method-name">Cut-based</span>
          <span className="method-description">Fast visual cut detection</span>
        </label>
        <label className="segmentation-method-label">
          <input
            type="radio"
            value="ai-based"
            checked={segmentationMethod === 'ai-based'}
            onChange={(e) => {
              console.log('DEBUG: Changing to ai-based');
              setSegmentationMethod(e.target.value as SegmentationMethod);
            }}
            disabled={isLoading}
          />
          <span className="method-name">AI-based</span>
          <span className="method-description">Smart content-aware segmentation</span>
        </label>
      </div>

      {selectedFile && (<button className="control-button" onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Analyzing...' : 'Analyze Selected'}</button>)}
      {isLoading && <p className="loading-text">Processing, please wait...</p>}
      {error && (<div className="error-message"><p>{error.length > 100 ? error.substring(0,97) + "..." : error}</p>{selectedFile && !isLoading && (<button className="control-button" onClick={handleRetry}>Retry</button>)}</div>)}
    </div>
  );
};
export default VideoUploader;
// --- END OF FILE VideoUploader.tsx ---