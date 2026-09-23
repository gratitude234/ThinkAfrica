"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Routes only fixture tab links locally; never supplies credentials to mutations. */
export default function PreviewFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <div onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a");
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (url.pathname !== "/amara" && !url.pathname.startsWith("/averylong")) return;
    event.preventDefault(); event.stopPropagation();
    const current = new URL(window.location.href);
    current.searchParams.set("view", url.searchParams.get("view") || "overview");
    router.push(current.pathname + current.search, { scroll: false });
  }}>{children}</div>;
}
