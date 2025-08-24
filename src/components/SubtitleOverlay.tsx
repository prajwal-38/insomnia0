import React from 'react';
import './SubtitleOverlay.css';

export interface SubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
  id?: string;
}

interface SubtitleOverlayProps {
  currentTime: number;
  subtitles: SubtitleCue[];
  visible?: boolean;
  style?: React.CSSProperties;
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  currentTime,
  subtitles,
  visible = true,
  style = {}
}) => {
  // Find the current subtitle based on video time
  const currentSubtitle = subtitles.find(
    subtitle => currentTime >= subtitle.startTime && currentTime <= subtitle.endTime
  );

  if (!visible || !currentSubtitle) {
    return null;
  }

  return (
    <div className="subtitle-overlay" style={style}>
      <div className="subtitle-text">
        {currentSubtitle.text}
      </div>
    </div>
  );
};

export default SubtitleOverlay;
