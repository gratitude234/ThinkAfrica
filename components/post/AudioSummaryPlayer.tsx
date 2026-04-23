"use client";

import { useRef, useState } from "react";

export default function AudioSummaryPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    void audio.play();
    setPlaying(true);
  };

  const fmt = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mb-8 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-brand text-white transition-colors hover:bg-emerald-600"
        aria-label={playing ? "Pause audio summary" : "Play audio summary"}
      >
        {playing ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
            <rect x="0" y="0" width="4" height="14" rx="1" />
            <rect x="8" y="0" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
            <path d="M0 0l12 7-12 7z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-emerald-800">
          90-second audio summary
        </p>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-emerald-200">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-emerald-brand transition-all"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(event) => {
              const nextProgress = Number(event.target.value);
              if (audioRef.current) {
                audioRef.current.currentTime = nextProgress;
              }
              setProgress(nextProgress);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>

      <span className="flex-shrink-0 font-mono text-xs text-emerald-700">
        {fmt(progress)} / {fmt(duration)}
      </span>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) =>
          setDuration((event.target as HTMLAudioElement).duration)
        }
        onTimeUpdate={(event) =>
          setProgress((event.target as HTMLAudioElement).currentTime)
        }
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
