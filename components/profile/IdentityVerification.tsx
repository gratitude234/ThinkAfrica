export default function IdentityVerification({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return <span role="img" aria-label="Identity verified by Indegenuis"
    title="Identity verified by Indegenuis" className="profile-verification">
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
      <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}
