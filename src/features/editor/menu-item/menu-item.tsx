import useLayoutStore from "../store/use-layout-store";
import { Texts } from "./texts";
import { Audios } from "./audios";
import { Elements } from "./elements";
import { Images } from "./images";
import { Videos } from "./videos";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ActiveMenuItem = () => {
  const { activeMenuItem } = useLayoutStore();

  if (activeMenuItem === "texts") {
    return <Texts />;
  }
  if (activeMenuItem === "shapes") {
    return <Elements />;
  }
  if (activeMenuItem === "videos") {
    return <Videos />;
  }

  if (activeMenuItem === "audios") {
    return <Audios />;
  }

  if (activeMenuItem === "images") {
    return <Images />;
  }

  return null;
};

export const MenuItem = () => {
  const { showMenuItem, setShowMenuItem } = useLayoutStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!showMenuItem) return null;

  return (
    <div className={cn(
      "flex-1 transition-all duration-300 border-r border-border/80",
      isCollapsed ? "w-8" : "w-[200px]"
    )}>
      {/* Collapse/Expand Toggle */}
      <div className="flex items-center justify-between p-2 border-b border-border/80">
        {!isCollapsed && (
          <Button
            onClick={() => setShowMenuItem(false)}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        )}
        <Button
          onClick={() => setIsCollapsed(!isCollapsed)}
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight width={14} /> : <ChevronLeft width={14} />}
        </Button>
      </div>

      {!isCollapsed && <ActiveMenuItem />}
    </div>
  );
};
