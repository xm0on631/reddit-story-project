export interface Comment {
  id: string;
  text: string;
  words: number;
  score: number;
  date: string;
  author?: string;
}

export interface Story {
  id: string;
  title: string;
  text: string;
  words: number;
  score: number;
  date: string;
  url: string;
  approvedBy?: string;
  type?: "post" | "comment";
  parentTitle?: string;
  author?: string;
  subreddit?: string;
  comments?: Comment[];
}

export interface AppSettings {
  accent: "neutral" | "blue" | "emerald" | "amber" | "rose";
  fontSize: "sm" | "base" | "lg";
  density: "comfortable" | "compact";
  wpm: number;
  hotkeysEnabled: boolean;
  confirmSkip: boolean;
  displayName: string;
  defaultTextExpanded: boolean;
}

export interface UndoAction {
  type: "approved" | "skipped";
  story: Story;
  index: number;
}

export type SortMode = "newest" | "oldest" | "top" | "comments" | "random";
