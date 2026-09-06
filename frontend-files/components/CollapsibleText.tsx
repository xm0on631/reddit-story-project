"use client";

import { useState } from "react";
import { highlightText } from "@/lib/highlight";

export function CollapsibleText({
  text,
  keyword,
  defaultExpanded,
  fontSizeClass,
}: {
  text: string;
  keyword?: string;
  defaultExpanded: boolean;
  fontSizeClass: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const content = keyword && keyword.trim() ? highlightText(text, keyword) : text;
  return (
    <div>
      <p
        className={`whitespace-pre-wrap leading-relaxed text-neutral-300 ${fontSizeClass} ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {content}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-neutral-500 hover:text-white mt-1 transition-colors"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
