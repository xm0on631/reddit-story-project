export interface VideoClip {
  id: string;
  title: string;
  score: number;
  url: string;
  permalink: string;
  author: string;
  subreddit: string;
  num_comments: number;
  date: string;
  is_video: boolean;
  domain: string;
  thumbnail: string;
  preview_url: string;
  duration: number;
}

export interface ResolvedVideo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  extractor: string;
  webpage_url: string;
}
