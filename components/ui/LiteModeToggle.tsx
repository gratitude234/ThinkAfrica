"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LITE_MODE_COOKIE } from "@/lib/liteMode";

export default function LiteModeToggle() {
  const router = useRouter();
  const [isLite, setIsLite] = useState(false);

  useEffect(() => {
    setIsLite(document.cookie.includes(`${LITE_MODE_COOKIE}=1`));
  }, []);

  const toggle = () => {
    if (isLite) {
      document.cookie = `${LITE_MODE_COOKIE}=; path=/; max-age=0`;
    } else {
      document.cookie = `${LITE_MODE_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    }

    setIsLite((value) => !value);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        isLite ? "Lite mode on - tap to turn off" : "Turn on lite mode (saves data)"
      }
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        isLite
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      <span aria-hidden="true" style={{ fontSize: "14px" }}>
        {isLite ? "⚡" : "📶"}
      </span>
      {isLite ? "Lite" : "Lite mode"}
    </button>
  );
}
