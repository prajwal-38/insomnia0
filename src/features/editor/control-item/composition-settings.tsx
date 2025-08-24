import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Smartphone, Square, Film, Tv } from "lucide-react";
import useStore from "../store/use-store";
import { useState } from "react";

// Predefined aspect ratios
const ASPECT_RATIOS = [
  {
    id: "16:10",
    name: "16:10 (Widescreen)",
    icon: Monitor,
    width: 1920,
    height: 1200,
    description: "Standard widescreen format"
  },
  {
    id: "16:9",
    name: "16:9 (HD)",
    icon: Tv,
    width: 1920,
    height: 1080,
    description: "HD video standard"
  },
  {
    id: "9:16",
    name: "9:16 (Mobile)",
    icon: Smartphone,
    width: 1080,
    height: 1920,
    description: "Mobile/vertical format"
  },
  {
    id: "1:1",
    name: "1:1 (Square)",
    icon: Square,
    width: 1080,
    height: 1080,
    description: "Square format for social media"
  },
  {
    id: "4:3",
    name: "4:3 (Classic)",
    icon: Monitor,
    width: 1440,
    height: 1080,
    description: "Classic TV format"
  },
  {
    id: "21:9",
    name: "21:9 (Cinematic)",
    icon: Film,
    width: 2560,
    height: 1080,
    description: "Ultra-wide cinematic"
  }
];

export default function CompositionSettings() {
  const { size, setSize } = useStore();
  const [selectedRatio, setSelectedRatio] = useState(() => {
    // Find current ratio
    const currentRatio = ASPECT_RATIOS.find(
      ratio => ratio.width === size.width && ratio.height === size.height
    );
    return currentRatio?.id || "custom";
  });

  const handleRatioChange = (ratioId: string) => {
    setSelectedRatio(ratioId);
    
    if (ratioId !== "custom") {
      const ratio = ASPECT_RATIOS.find(r => r.id === ratioId);
      if (ratio) {
        setSize({
          width: ratio.width,
          height: ratio.height
        });
      }
    }
  };

  const getCurrentRatioInfo = () => {
    if (selectedRatio === "custom") {
      return {
        name: "Custom",
        description: `${size.width} × ${size.height}`,
        icon: Monitor
      };
    }
    return ASPECT_RATIOS.find(r => r.id === selectedRatio) || ASPECT_RATIOS[0];
  };

  const currentRatio = getCurrentRatioInfo();
  const IconComponent = currentRatio.icon;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconComponent className="h-4 w-4" />
          Composition Settings
        </CardTitle>
        <CardDescription className="text-xs">
          Choose the aspect ratio for your video composition
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Size Display */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <div className="text-sm font-medium">{currentRatio.name}</div>
            <div className="text-xs text-muted-foreground">{currentRatio.description}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono">{size.width} × {size.height}</div>
            <div className="text-xs text-muted-foreground">
              {(size.width / size.height).toFixed(2)}:1 ratio
            </div>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Aspect Ratio</Label>
          <Select value={selectedRatio} onValueChange={handleRatioChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((ratio) => {
                const Icon = ratio.icon;
                return (
                  <SelectItem key={ratio.id} value={ratio.id}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{ratio.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {ratio.width} × {ratio.height}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
              <SelectItem value="custom">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Custom</div>
                    <div className="text-xs text-muted-foreground">
                      Current: {size.width} × {size.height}
                    </div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quick Ratio Buttons */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Quick Select</Label>
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIOS.slice(0, 4).map((ratio) => {
              const Icon = ratio.icon;
              const isSelected = selectedRatio === ratio.id;
              return (
                <Button
                  key={ratio.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRatioChange(ratio.id)}
                  className="h-auto p-2 flex flex-col items-center gap-1"
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{ratio.id}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
          <strong>Tip:</strong> Choose 16:10 for presentations, 16:9 for standard video, 9:16 for mobile content, or 1:1 for social media posts.
        </div>
      </CardContent>
    </Card>
  );
}
