"use client";

/**
 * Inline guest notice for Home only -- rendered in the document flow (never
 * fixed/floating) directly above the feed tabs. See components/ui/GuestBanner.tsx
 * for the equivalent treatment on every other guest-visible route.
 */
export default function HomeGuestNotice() {
  const handleSignIn = () => {
    const redirectPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/login?redirectTo=${encodeURIComponent(redirectPath)}`;
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-wash-border bg-green-tint px-3.5 py-3">
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
        Browsing as a guest. Sign in to like, save, respond, and publish.
      </p>
      <button
        type="button"
        onClick={handleSignIn}
        className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-brand px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        Sign in
      </button>
    </div>
  );
}
