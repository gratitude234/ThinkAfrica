/**
 * The email itself, rendered in isolation.
 *
 * An iframe rather than injected markup: the email carries its own document,
 * its own dark-mode rules and its own table layout, and none of that should
 * meet the admin stylesheet. What appears in this frame is byte for byte the
 * HTML that Resend will be handed.
 */
export default function EmailFrame({
  html,
  className = "",
  title = "Email preview",
}: {
  html: string;
  className?: string;
  title?: string;
}) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox=""
      loading="lazy"
      className={`w-full border-0 bg-white ${className}`}
    />
  );
}
