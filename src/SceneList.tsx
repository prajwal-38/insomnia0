// src/components/SceneList.tsx
import React from 'react';
import type { AnalyzedScene, ApiAnalysisResponse } from './types';
import { formatTime } from './utils';

interface SceneListProps {
  analysisData: ApiAnalysisResponse | null;
  // selectedSceneId?: string | null; // If you want to highlight based on an external selection
  onSceneSelect: (scene: AnalyzedScene) => void;
}

const TransitionIcon: React.FC<{ type?: string }> = ({ type }) => { // Made type optional
  switch (type?.toLowerCase()) {
    case 'fade-in': return <span title="Fade In">☀️</span>;
    case 'fade-out': return <span title="Fade Out">🌙</span>;
    case 'cut': return <span title="Cut">✂️</span>;
    default: return <span title="Transition">🎬</span>; // Generic for unknown or 'none'
  }
};

const SceneList: React.FC<SceneListProps> = ({ analysisData, onSceneSelect }) => {
  if (!analysisData || !analysisData.scenes || analysisData.scenes.length === 0) {
    return <p className="no-scenes-message">No scenes analyzed yet, or no scenes found.</p>;
  }

  return (
    <div className="scene-list-container">
      <h5 className="scene-list-title">Video: {analysisData.fileName.length > 25 ? analysisData.fileName.substring(0,22) + "..." : analysisData.fileName}</h5>
      <ul className="scene-list">
        {analysisData.scenes.map((scene) => (
          <li
            key={scene.sceneId} // Use sceneId for the key
            className={`scene-list-item`} // Removed selected class logic, App.tsx handles node selection
            onClick={() => onSceneSelect(scene)}
          >
            <div className="scene-item-index">#{scene.scene_index + 1}</div>
            <div className="scene-item-timecode">
              {formatTime(scene.start)} - {formatTime(scene.end)}
            </div>
            <div className="scene-item-duration">({formatTime(scene.duration)})</div>
            <div className="scene-item-transition">
              <TransitionIcon type={scene.transition_type} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SceneList;