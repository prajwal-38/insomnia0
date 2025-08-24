// src/components/InteractiveSceneModal.tsx
import React from 'react';
import type { AnalyzedScene } from '../types';
import NodeTimeline from './NodeTimeline';

interface InteractiveSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  scene: AnalyzedScene | null; // This is the segment from the larger video
  videoUrl: string | null;     // This is the MAIN video URL from analysis
  analysisId: string | null;
}

const InteractiveSceneModal: React.FC<InteractiveSceneModalProps> = ({
  isOpen,
  onClose,
  scene,
  videoUrl,
  analysisId,
}) => {
  const handleSave = (edits: any) => {
    console.log('Scene edits saved:', edits);
    // TODO: Implement saving scene edits back to the scene data
  };

  // Only render NodeTimeline when modal is open and scene data is available
  if (!isOpen || !scene) {
    return null;
  }

  return (
    <NodeTimeline
      scene={scene}
      videoUrl={videoUrl}
      analysisId={analysisId}  // NEW: Pass analysisId to NodeTimeline
      isOpen={isOpen}
      onClose={onClose}
      onSave={handleSave}
    />
  );
};

export default InteractiveSceneModal;