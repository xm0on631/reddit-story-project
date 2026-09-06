export interface VideoClip {
  id: string;
  title: string;
  score: number;
  num_comments: number;
  author: string;
  subreddit: string;
  permalink: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  preview_url: string;
  created_utc: number;
}

export interface ResolvedVideo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  extractor: string;
  webpage_url: string;
}
