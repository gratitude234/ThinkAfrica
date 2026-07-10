import type { ProfileType } from "@/lib/profileTypes";

export const PERSONA_ICON_PATHS: Record<ProfileType, string> = {
  student:
    "M12 3L22 8L12 13L2 8L12 3Z M6 10.2V16C6 16 8.5 18 12 18C15.5 18 18 16 18 16V10.2",
  researcher:
    "M4 3H14V13H4V3Z M6.5 6H11.5 M6.5 9H9.5 M16 9A4 4 0 1 0 16 17A4 4 0 0 0 16 9Z M18.8 19.8L22 23",
  educator:
    "M3 5.5C3 5.5 6 4.5 9 5.5V17.5C6 16.5 3 17.5 3 17.5V5.5Z M21 5.5C21 5.5 18 4.5 15 5.5V17.5C18 16.5 21 17.5 21 17.5V5.5Z M12 5.5V17.5",
  ngo_nonprofit:
    "M12 20C12 20 4 14.3 4 9.2C4 6.3 6.1 4.2 8.8 4.2C10.4 4.2 11.6 5 12 5.4C12.4 5 13.6 4.2 15.2 4.2C17.9 4.2 20 6.3 20 9.2C20 14.3 12 20 12 20Z",
  founder:
    "M12 2.5C14.2 4.8 15.8 8.5 14.8 14.2L9.2 14.2C8.2 8.5 9.8 4.8 12 2.5Z M9.2 14.2L6.2 19.5L9.8 17.8 M14.8 14.2L17.8 19.5L14.2 17.8 M10.8 10.5H13.2",
  policy_government:
    "M3 9.5L12 4.2L21 9.5H3Z M5.5 9.5V18.5M9.5 9.5V18.5M14.5 9.5V18.5M18.5 9.5V18.5 M3 20.5H21",
  journalist_media:
    "M12 3A2.8 2.8 0 0 1 14.8 5.8V11A2.8 2.8 0 0 1 9.2 11V5.8A2.8 2.8 0 0 1 12 3Z M6.5 11A5.5 5.5 0 0 0 17.5 11 M12 16.5V20.5 M9 20.5H15",
  professional:
    "M4 8.5H20V19H4V8.5Z M9 8.5V6.5C9 5.4 9.9 4.5 11 4.5H13C14.1 4.5 15 5.4 15 6.5V8.5 M4 13.2H20",
  other: "M12 3.5V20.5 M4.5 8L19.5 16 M19.5 8L4.5 16",
};

export function PersonaIcon({
  type,
  color,
}: {
  type: ProfileType;
  color: string;
}) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={PERSONA_ICON_PATHS[type]}
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
