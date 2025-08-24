import React from "react";
import type {
  IAudio,
  ICaption,
  IImage,
  IText,
  ITrackItem,
  ITrackItemAndDetails,
  IVideo,
} from "@designcombo/types";
import { useEffect, useState } from "react";
import BasicText from "./basic-text";
import BasicImage from "./basic-image";
import BasicVideo from "./basic-video";
import BasicAudio from "./basic-audio";
import useStore from "../store/use-store";
import useLayoutStore from "../store/use-layout-store";
import BasicCaption from "./basic-caption";
import { LassoSelect } from "lucide-react";
import CompositionSettings from "./composition-settings";

const Container = ({ children }: { children: React.ReactNode }) => {
  const { activeIds, trackItemsMap, trackItemDetailsMap, transitionsMap } =
    useStore();
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const { setTrackItem: setLayoutTrackItem } = useLayoutStore();

  useEffect(() => {
    if (activeIds.length === 1) {
      const [id] = activeIds;
      const trackItemDetails = trackItemDetailsMap[id];
      const trackItem = {
        ...trackItemsMap[id],
        details: trackItemDetails?.details || {},
      };
      if (trackItemDetails) {
        setTrackItem(trackItem);
        setLayoutTrackItem(trackItem);
      } else console.log(transitionsMap[id]);
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap]);

  return (
    <div className="flex w-[272px] flex-none border-l border-border/80 bg-sidebar">
      {React.cloneElement(children as React.ReactElement<any>, {
        trackItem,
      })}
    </div>
  );
};

const ActiveControlItem = ({
  trackItem,
}: {
  trackItem?: ITrackItemAndDetails;
}) => {
  if (!trackItem) {
    console.log("No item selected - showing composition settings");
    return (
      <div className="flex flex-1 flex-col p-4 gap-4">
        <CompositionSettings />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
          <LassoSelect />
          <span className="text-zinc-500 text-center text-sm">
            Select an item on the timeline to edit its properties
          </span>
        </div>
      </div>
    );
  }
  return (
    <>
      {
        {
          text: <BasicText trackItem={trackItem as ITrackItem & IText} />,
          caption: (
            <BasicCaption trackItem={trackItem as ITrackItem & ICaption} />
          ),
          image: <BasicImage trackItem={trackItem as ITrackItem & IImage} />,
          video: <BasicVideo trackItem={trackItem as ITrackItem & IVideo} />,
          audio: <BasicAudio trackItem={trackItem as ITrackItem & IAudio} />,
        }[trackItem.type as "text"]
      }
    </>
  );
};

export const ControlItem = () => {
  return (
    <Container>
      <ActiveControlItem />
    </Container>
  );
};
