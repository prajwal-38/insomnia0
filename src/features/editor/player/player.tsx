import { useEffect, useRef } from "react";
import Composition from "./composition";
import { Player as RemotionPlayer, type PlayerRef } from "@remotion/player";
import useStore from "../store/use-store";

const Player = () => {
  const playerRef = useRef<PlayerRef>(null);
  const { setPlayerRef, duration, fps, size } = useStore();

  useEffect(() => {
    setPlayerRef(playerRef);
  }, []);

  return (
    <RemotionPlayer
      ref={playerRef}
      component={Composition}
      durationInFrames={Math.round((duration / 1000) * fps) || 1}
      compositionWidth={size.width}
      compositionHeight={size.height}
      className="h-full w-full"
      fps={30}
      overflowVisible
      style={{
        width: '100%',
        height: '100%'
      }}
      controls={false}
      loop={false}
      showVolumeControls={false}
      allowFullscreen={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      moveToBeginningWhenEnded={false}
      playbackRate={1}
      initiallyShowControls={0}
    />
  );
};
export default Player;
