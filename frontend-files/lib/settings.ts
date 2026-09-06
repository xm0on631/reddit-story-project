import { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  accent: "neutral",
  fontSize: "base",
  density: "comfortable",
  wpm: 150,
  hotkeysEnabled: true,
  confirmSkip: false,
  displayName: "",
  defaultTextExpanded: true,
};

export const SETTINGS_KEY = "rst_settings";
export const FILTERS_KEY = "rst_default_filters";

export const ACCENTS: Record<
  AppSettings["accent"],
  { label: string; button: string; solid: string; ring: string }
> = {
  neutral: {
    label: "Neutral",
    button: "bg-neutral-800 hover:bg-white/10 border-neutral-700",
    solid: "bg-neutral-400",
    ring: "ring-neutral-400",
  },
  blue: {
    label: "Blue",
    button: "bg-blue-950 hover:bg-blue-900 border-blue-800",
    solid: "bg-blue-500",
    ring: "ring-blue-500",
  },
  emerald: {
    label: "Emerald",
    button: "bg-emerald-950 hover:bg-emerald-900 border-emerald-800",
    solid: "bg-emerald-500",
    ring: "ring-emerald-500",
  },
  amber: {
    label: "Amber",
    button: "bg-amber-950 hover:bg-amber-900 border-amber-800",
    solid: "bg-amber-500",
    ring: "ring-amber-500",
  },
  rose: {
    label: "Rose",
    button: "bg-rose-950 hover:bg-rose-900 border-rose-800",
    solid: "bg-rose-500",
    ring: "ring-rose-500",
  },
};

export const FONT_SIZE_CLASS: Record<AppSettings["fontSize"], string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

export function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function estimateDuration(words: number, wpm: number): string {
  const safeWpm = wpm > 0 ? wpm : 150;
  const minutes = words / safeWpm;
  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * 60));
    return `~${seconds} sec`;
  }
  const rounded = Math.round(minutes * 2) / 2;
  return `~${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} min`;
}
