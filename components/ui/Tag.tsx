interface TagProps {
  label: string;
  className?: string;
}

export default function Tag({ label, className = "" }: TagProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors ${className}`}
    >
      #{label}
    </span>
  );
}
