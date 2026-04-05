interface SponsorPlacement {
  sponsor_name: string;
  content: string | null;
  link_url: string | null;
}

interface Props {
  placement: SponsorPlacement | null;
}

export default function SponsorBanner({ placement }: Props) {
  if (!placement) return null;

  const inner = (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex-shrink-0">
        Supported by
      </span>
      <span className="font-semibold text-gray-800">{placement.sponsor_name}</span>
      {placement.content && (
        <span className="text-gray-500 hidden sm:inline">{placement.content}</span>
      )}
    </div>
  );

  if (placement.link_url) {
    return (
      <a
        href={placement.link_url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block mb-6 hover:opacity-90 transition-opacity"
      >
        {inner}
      </a>
    );
  }

  return <div className="mb-6">{inner}</div>;
}
