import type { Animation } from "./types";
import { Easing } from "remotion";

// Define preset names
export type PresetName =
  | "fadeIn"
  | "fadeOut"
  | "scaleIn"
  | "scaleOut"
  | "slideInRight"
  | "slideInLeft"
  | "slideInTop"
  | "slideInBottom"
  | "slideOutRight"
  | "slideOutLeft"
  | "slideOutTop"
  | "slideOutBottom"
  | "rotateIn"
  | "flipIn";

// Type-safe preset object with basic animation definitions
export const presets: Record<PresetName, Animation> = {
  fadeIn: {
    property: "opacity",
    from: 0,
    to: 1,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/FadeIn.webp",
    name: "Fade In"
  },
  fadeOut: {
    property: "opacity",
    from: 1,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/FadeOut.webp",
    name: "Fade Out"
  },
  scaleIn: {
    property: "scale",
    from: 0,
    to: 1,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/ScaleIn.webp",
    name: "Scale In"
  },
  scaleOut: {
    property: "scale",
    from: 1,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/ScaleOut.webp",
    name: "Scale Out"
  },
  slideInRight: {
    property: "translateX",
    from: 100,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideInRight.webp",
    name: "Slide In Right"
  },
  slideInLeft: {
    property: "translateX",
    from: -100,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideInLeft.webp",
    name: "Slide In Left"
  },
  slideInTop: {
    property: "translateY",
    from: -100,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideInTop.webp",
    name: "Slide In Top"
  },
  slideInBottom: {
    property: "translateY",
    from: 100,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideInBottom.webp",
    name: "Slide In Bottom"
  },
  slideOutRight: {
    property: "translateX",
    from: 0,
    to: 100,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideOutRight.webp",
    name: "Slide Out Right"
  },
  slideOutLeft: {
    property: "translateX",
    from: 0,
    to: -100,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideOutLeft.webp",
    name: "Slide Out Left"
  },
  slideOutTop: {
    property: "translateY",
    from: 0,
    to: -100,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideOutTop.webp",
    name: "Slide Out Top"
  },
  slideOutBottom: {
    property: "translateY",
    from: 0,
    to: 100,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/SlideOutBottom.webp",
    name: "Slide Out Bottom"
  },
  rotateIn: {
    property: "rotate",
    from: 180,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/RotateIn.webp",
    name: "Rotate In"
  },
  flipIn: {
    property: "rotateY",
    from: 90,
    to: 0,
    durationInFrames: 30,
    ease: Easing.ease,
    previewUrl: "https://cdn.designcombo.dev/animations/FlipIn.webp",
    name: "Flip In"
  }
};

// Export type for external usage
export type AnimationPresets = typeof presets;
