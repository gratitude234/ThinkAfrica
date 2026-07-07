"use client";

import { useRef, useState } from "react";

interface Props {
  audioUrl: string;
  durationSeconds?: number | null;
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function AudioSummaryPlayer({
  audioUrl,
  durationSeconds = null,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  const totalDuration = duration || durationSeconds || 0;
  const progress = totalDuration
    ? Math.min(100, (elapsed / totalDuration) * 100)
    : 0;
  const listenMinutes = Math.max(
    1,
    Math.ceil((totalDuration || durationSeconds || 90) / 60)
  );

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      return;
    }

    void audio.play();
  };

  return (
    <div className="mb-8 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 sm:rounded-full sm:py-3">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(event) => {
          const nextDuration = (event.target as HTMLAudioElement).duration;
          if (Number.isFinite(nextDuration)) {
            setDuration(nextDuration);
          }
        }}
        onTimeUpdate={(event) =>
          setElapsed((event.target as HTMLAudioElement).currentTime)
        }
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => {
          setPlaying(false);
          setElapsed(0);
        }}
      />

      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-white transition-colors hover:bg-[#0E4B37]"
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

        <div className="min-w-[180px] flex-1">
          <p className="mb-1 text-xs font-semibold text-emerald-800">
            Audio summary · ~{listenMinutes} min listen
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-emerald-200">
            <div
              className="h-full rounded-full bg-emerald-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <span className="ml-[52px] shrink-0 font-mono text-xs text-emerald-700 sm:ml-0">
          {formatTime(elapsed)} / {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}
