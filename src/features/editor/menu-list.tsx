import useLayoutStore from "./store/use-layout-store";
import { Icons } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function MenuList() {
  const { setActiveMenuItem, setShowMenuItem, activeMenuItem, showMenuItem } =
    useLayoutStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={cn(
      "flex flex-col items-center gap-1 border-r border-border/80 py-1 transition-all duration-300",
      isCollapsed ? "w-8" : "w-10"
    )}>
      {/* Collapse/Expand Toggle */}
      <Button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="text-muted-foreground hover:text-foreground mb-2"
        variant={"ghost"}
        size={"icon"}
      >
        {isCollapsed ? <ChevronRight width={14} /> : <ChevronLeft width={14} />}
      </Button>

      {!isCollapsed && (
        <>
          <Button
            onClick={() => {
              setActiveMenuItem("texts");
              setShowMenuItem(true);
            }}
            className={cn(
              showMenuItem && activeMenuItem === "texts"
                ? "bg-secondary"
                : "text-muted-foreground",
            )}
            variant={"ghost"}
            size={"icon"}
          >
            <Icons.type width={16} />
          </Button>

          <Button
            onClick={() => {
              setActiveMenuItem("videos");
              setShowMenuItem(true);
            }}
            className={cn(
              showMenuItem && activeMenuItem === "videos"
                ? "bg-secondary"
                : "text-muted-foreground",
            )}
            variant={"ghost"}
            size={"icon"}
          >
            <Icons.video width={16} />
          </Button>

          <Button
            onClick={() => {
              setActiveMenuItem("images");
              setShowMenuItem(true);
            }}
            className={cn(
              showMenuItem && activeMenuItem === "images"
                ? "bg-secondary"
                : "text-muted-foreground",
            )}
            variant={"ghost"}
            size={"icon"}
          >
            <Icons.image width={16} />
          </Button>

          <Button
            onClick={() => {
              setActiveMenuItem("audios");
              setShowMenuItem(true);
            }}
            className={cn(
              showMenuItem && activeMenuItem === "audios"
                ? "bg-secondary"
                : "text-muted-foreground",
            )}
            variant={"ghost"}
            size={"icon"}
          >
            <Icons.audio width={16} />
          </Button>
        </>
      )}
    </div>
  );
}
