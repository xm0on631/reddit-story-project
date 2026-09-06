"use client";

import { X } from "lucide-react";
import { AppSettings } from "@/lib/types";
import { ACCENTS } from "@/lib/settings";
import { Toggle } from "./Toggle";

export function SettingsModal({
  settings,
  onUpdate,
  onClose,
}: {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 w-96 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Settings</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs text-neutral-500 block mb-2">Accent Color</label>
            <div className="flex gap-2">
              {(Object.keys(ACCENTS) as AppSettings["accent"][]).map((key) => (
                <button
                  key={key}
                  onClick={() => onUpdate("accent", key)}
                  title={ACCENTS[key].label}
                  className={`w-7 h-7 rounded-full transition-all ${ACCENTS[key].solid} ${
                    settings.accent === key
                      ? `ring-2 ring-offset-2 ring-offset-neutral-950 ${ACCENTS[key].ring}`
                      : "opacity-50 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-2">Text Size</label>
            <div className="flex gap-2">
              {(["sm", "base", "lg"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => onUpdate("fontSize", size)}
                  className={`flex-1 rounded-lg py-1.5 text-sm border transition-colors ${
                    settings.fontSize === size
                      ? "bg-neutral-800 border-neutral-600 text-white"
                      : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {size === "sm" ? "Small" : size === "base" ? "Medium" : "Large"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-2">Density</label>
            <div className="flex gap-2">
              {(["comfortable", "compact"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onUpdate("density", d)}
                  className={`flex-1 rounded-lg py-1.5 text-sm border transition-colors capitalize ${
                    settings.density === d
                      ? "bg-neutral-800 border-neutral-600 text-white"
                      : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {d === "comfortable" ? "Comfortable" : "Compact"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-2">Default text state</label>
            <div className="flex gap-2">
              {(["expanded", "collapsed"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onUpdate("defaultTextExpanded", v === "expanded")}
                  className={`flex-1 rounded-lg py-1.5 text-sm border transition-colors capitalize ${
                    (settings.defaultTextExpanded ? "expanded" : "collapsed") === v
                      ? "bg-neutral-800 border-neutral-600 text-white"
                      : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {v === "expanded" ? "Expanded" : "Collapsed"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-2">Voiceover speed (words/min)</label>
            <input
              type="number"
              value={settings.wpm}
              onChange={(e) => onUpdate("wpm", Number(e.target.value) || 150)}
              className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-2">Your name (optional)</label>
            <input
              type="text"
              value={settings.displayName}
              onChange={(e) => onUpdate("displayName", e.target.value)}
              placeholder="e.g. Alex"
              className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-600 rounded-lg px-2 py-1.5 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">Hotkeys (A / S / E)</span>
            <Toggle checked={settings.hotkeysEnabled} onChange={(v) => onUpdate("hotkeysEnabled", v)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">Confirm before Skip</span>
            <Toggle checked={settings.confirmSkip} onChange={(v) => onUpdate("confirmSkip", v)} />
          </div>

          <p className="text-[11px] text-neutral-600 pt-3 border-t border-neutral-800">
            Значения фильтров слева (Min/Max Words, Min Upvotes) сохраняются автоматически.
          </p>
        </div>
      </div>
    </div>
  );
}
