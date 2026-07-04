"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toggleBlock } from "@/components/moderation/blockActions";

interface BlockUserButtonProps {
  targetUserId: string;
  targetName: string;
  currentUserId: string | null;
  initialBlocked: boolean;
  variant?: "button" | "text";
  className?: string;
}

export default function BlockUserButton({
  targetUserId,
  targetName,
  currentUserId,
  initialBlocked,
  variant = "button",
  className = "",
}: BlockUserButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUserId || currentUserId === targetUserId) return null;

  const runToggle = async (block: boolean) => {
    setLoading(true);
    setError(null);
    const result = await toggleBlock({ blockedId: targetUserId, block, pathname });

    if (result.error) {
      setError(result.error);
    } else {
      setBlocked(result.blocked);
    }

    setLoading(false);
    setConfirming(false);
    router.refresh();
  };

  if (blocked) {
    return (
      <div className={className}>
        <button
          onClick={() => runToggle(false)}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50"
        >
          {loading ? "..." : "Unblock"}
        </button>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-3 ${className}`}>
        <p className="text-xs text-red-800">
          Block {targetName}? They won&apos;t be able to message you, and you&apos;ll stop
          seeing their content.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => runToggle(true)}
            disabled={loading}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Blocking..." : "Block"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <button
        onClick={() => setConfirming(true)}
        className={`text-xs text-gray-400 transition-colors hover:text-red-600 ${className}`}
      >
        Block user
      </button>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 ${className}`}
    >
      Block user
    </button>
  );
}
