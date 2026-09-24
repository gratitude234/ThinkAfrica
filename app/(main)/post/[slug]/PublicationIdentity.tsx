/** Verification is backed by the author profile, never inferred from role. */
export default function PublicationIdentity({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return (
    <span role="img" aria-label="Identity verified by Indegenius" title="Identity verified by Indegenius"
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#0B4A36] text-white">
      <svg aria-hidden="true" viewBox="0 0 16 16" width="11" height="11" fill="none">
        <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
