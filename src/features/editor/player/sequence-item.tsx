import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence } from "remotion";
import TextLayer from "./editable-text";
import type { IAudio, IImage, IItem, IText, IVideo, ICaption } from "@designcombo/types";
import { calculateFrames } from "../utils/frames";
import { Animated } from "./animated";
import {
  calculateContainerStyles,
  calculateMediaStyles,
  calculateTextStyles,
} from "./styles";
import { getAnimations } from "../utils/get-animations";

interface SequenceItemOptions {
  handleTextChange?: (id: string, text: string) => void;
  fps: number;
  editableTextId?: string | null;
  currentTime?: number;
  zIndex?: number;
  active?: boolean;
  onTextBlur?: (id: string, text: string) => void;
}

export const SequenceItem: Record<
  string,
  (item: IItem, options: SequenceItemOptions) => JSX.Element
> = {
  text: (item, options: SequenceItemOptions) => {
    const { handleTextChange, onTextBlur, fps, editableTextId, zIndex } =
      options;
    const { id, details, animations } = item as IText;
    const { from, durationInFrames } = calculateFrames(item.display, fps);
    const { animationIn, animationOut } = getAnimations(animations!, item);
    return (
      <Sequence
        key={item.id}
        from={from}
        durationInFrames={durationInFrames}
        style={{ pointerEvents: "none", zIndex }}
      >
        {/* positioning layer */}
        <AbsoluteFill
          data-track-item="transition-element"
          className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type}`}
          style={calculateContainerStyles(details)}
        >
          {/* animation layer */}
          <Animated
            style={calculateContainerStyles(details)}
            animationIn={editableTextId === id ? null : animationIn}
            animationOut={editableTextId === id ? null : animationOut}
            durationInFrames={durationInFrames}
          >
            {/* text layer */}
            <TextLayer
              key={id}
              id={id}
              content={details.text}
              editable={editableTextId === id}
              onChange={handleTextChange}
              onBlur={onTextBlur}
              style={calculateTextStyles(details)}
            />
          </Animated>
        </AbsoluteFill>
      </Sequence>
    );
  },

  image: (item, options: SequenceItemOptions) => {
    const { fps, zIndex } = options;
    const { details, animations } = item as IImage;
    const { from, durationInFrames } = calculateFrames(item.display, fps);
    const { animationIn, animationOut } = getAnimations(animations!, item);
    const crop = details.crop || {
      x: 0,
      y: 0,
      width: item.details.width,
      height: item.details.height,
    };
    return (
      <Sequence
        key={item.id}
        from={from}
        durationInFrames={durationInFrames}
        style={{ pointerEvents: "none", zIndex }}
      >
        {/* position layer */}
        <AbsoluteFill
          data-track-item="transition-element"
          className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type}`}
          style={calculateContainerStyles(details, crop)}
        >
          {/* animation layer */}
          <Animated
            style={calculateContainerStyles(details, crop, {
              overflow: "hidden",
            })}
            animationIn={animationIn!}
            animationOut={animationOut!}
            durationInFrames={durationInFrames}
          >
            <div style={calculateMediaStyles(details, crop)}>
              <Img data-id={item.id} src={details.src} />
            </div>
          </Animated>
        </AbsoluteFill>
      </Sequence>
    );
  },
  video: (item, options: SequenceItemOptions) => {
    const { fps, zIndex } = options;
    const { details, animations } = item as IVideo;
    const { animationIn, animationOut } = getAnimations(animations!, item);
    const playbackRate = item.playbackRate || 1;
    const { from, durationInFrames } = calculateFrames(
      {
        from: item.display.from / playbackRate,
        to: item.display.to / playbackRate,
      },
      fps,
    );
    const crop = details.crop || {
      x: 0,
      y: 0,
      width: item.details.width,
      height: item.details.height,
    };

    return (
      <Sequence
        key={item.id}
        from={from}
        durationInFrames={durationInFrames}
        style={{ pointerEvents: "none", zIndex }}
      >
        <AbsoluteFill
          data-track-item="transition-element"
          className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type}`}
          style={calculateContainerStyles(details, crop)}
        >
          {/* animation layer */}
          <Animated
            style={calculateContainerStyles(details, crop, {
              overflow: "hidden",
            })}
            animationIn={animationIn}
            animationOut={animationOut}
            durationInFrames={durationInFrames}
          >
            <div style={calculateMediaStyles(details, crop)}>
              <OffthreadVideo
                startFrom={(item.trim?.from! / 1000) * fps}
                endAt={(item.trim?.to! / 1000) * fps}
                playbackRate={playbackRate}
                src={details.src}
                volume={(details.volume || 0) / 100}
                transparent={false}
                toneMapped={false}
              />
            </div>
          </Animated>
        </AbsoluteFill>
      </Sequence>
    );
  },
  audio: (item, options: SequenceItemOptions) => {
    const { fps, zIndex } = options;
    const { details } = item as IAudio;
    const playbackRate = item.playbackRate || 1;
    const { from, durationInFrames } = calculateFrames(
      {
        from: item.display.from / playbackRate,
        to: item.display.to / playbackRate,
      },
      fps,
    );
    return (
      <Sequence
        key={item.id}
        from={from}
        durationInFrames={durationInFrames}
        style={{
          userSelect: "none",
          pointerEvents: "none",
          zIndex,
        }}
      >
        <AbsoluteFill>
          <Audio
            startFrom={(item.trim?.from! / 1000) * fps}
            endAt={(item.trim?.to! / 1000) * fps}
            playbackRate={playbackRate}
            src={details.src}
            volume={details.volume! / 100}
          />
        </AbsoluteFill>
      </Sequence>
    );
  },

  caption: (item, options: SequenceItemOptions) => {
    const { handleTextChange, onTextBlur, fps, editableTextId, zIndex } =
      options;
    const { id, details, animations } = item as ICaption;
    const { from, durationInFrames } = calculateFrames(item.display, fps);
    const { animationIn, animationOut } = getAnimations(animations!, item);

    // Removed caption rendering debug logging to reduce console spam

    return (
      <Sequence
        key={item.id}
        from={from}
        durationInFrames={durationInFrames}
        style={{ pointerEvents: "none", zIndex }}
      >
        {/* positioning layer */}
        <AbsoluteFill
          data-track-item="transition-element"
          className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type} ai-generated-caption`}
          style={{
            ...calculateContainerStyles(details),
            // Add debug background for AI captions
            backgroundColor: item.metadata?.aiGenerated ? 'rgba(255, 0, 0, 0.1)' : 'transparent',
            border: item.metadata?.aiGenerated ? '1px solid rgba(255, 0, 0, 0.3)' : 'none',
            zIndex: 1000 // Ensure captions appear on top
          }}
        >
          {/* animation layer */}
          <Animated
            style={calculateContainerStyles(details)}
            animationIn={editableTextId === id ? null : animationIn}
            animationOut={editableTextId === id ? null : animationOut}
            durationInFrames={durationInFrames}
          >
            {/* caption text layer */}
            <TextLayer
              key={id}
              id={id}
              content={details.text}
              editable={editableTextId === id}
              onChange={handleTextChange}
              onBlur={onTextBlur}
              style={{
                ...calculateTextStyles(details),
                // Enhanced styling for AI captions
                zIndex: 1001,
                position: 'relative',
                display: 'block',
                width: '100%',
                textAlign: 'center',
                // Add background for better visibility during testing
                backgroundColor: item.metadata?.aiGenerated ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                padding: item.metadata?.aiGenerated ? '8px 16px' : '0',
                borderRadius: item.metadata?.aiGenerated ? '4px' : '0',
              }}
            />
          </Animated>
        </AbsoluteFill>
      </Sequence>
    );
  },
};
