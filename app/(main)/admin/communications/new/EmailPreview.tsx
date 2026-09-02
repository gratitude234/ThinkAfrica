"use client";

import { useState } from "react";
import EmailFrame from "../EmailFrame";

type Device = "desktop" | "mobile";

const DEVICES: { key: Device; label: string }[] = [
  { key: "desktop", label: "Desktop" },
  { key: "mobile", label: "Mobile" },
];

export default function EmailPreview({
  html,
  senderName,
  senderAddress,
  subject,
  previewText,
}: {
  html: string;
  senderName: string;
  senderAddress: string;
  subject: string;
  previewText: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");

  return (
    <div>
      <div className="flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Preview size"
          className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5"
        >
          {DEVICES.map((option) => {
            const isActive = option.key === device;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setDevice(option.key)}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-emerald-brand text-white"
                    : "text-gray-500 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`mx-auto mt-5 w-full ${
          device === "mobile" ? "max-w-[390px]" : "max-w-[680px]"
        }`}
      >
        {/* The inbox row: sender identity, subject and preview text, which live
            outside the email body but are the first thing a recipient reads. */}
        <div className="rounded-t-xl border border-b-0 border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-ink">{senderName}</span>
            <span className="truncate text-xs text-gray-400">
              {senderAddress}
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-ink">
            {subject || "No subject"}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {previewText || "No preview text set"}
          </p>
        </div>

        <div className="overflow-hidden rounded-b-xl border border-gray-200">
          <EmailFrame
            html={html}
            title="Broadcast preview"
            className={device === "mobile" ? "h-[600px]" : "h-[540px]"}
          />
        </div>
      </div>
    </div>
  );
}
