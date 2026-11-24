import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";

/**
 * Geometric iD mark: a white tile carrying a royal-blue rounded square with a
 * crisp white `i` and `D`. Used in the landing page, dashboard header/footer
 * and contact badge; never rendered inside generated product creatives.
 */
export default function IDMark({
  size = 44,
  small = false,
}: {
  size?: number;
  small?: boolean;
}) {
  const dimension = small ? 28 : size;
  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${IDESIGN_STUDIO_CONFIG.name} logo`}
      style={{ flexShrink: 0 }}
    >
      <rect width="48" height="48" rx="13" fill={IDESIGN_STUDIO_CONFIG.colors.white} />
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="11"
        fill="none"
        stroke={IDESIGN_STUDIO_CONFIG.colors.royalBlue}
        strokeWidth="1.5"
      />
      <rect
        x="11"
        y="11"
        width="26"
        height="26"
        rx="7"
        fill={IDESIGN_STUDIO_CONFIG.colors.royalBlue}
      />
      <rect x="16" y="20" width="3.4" height="12" rx="1.7" fill={IDESIGN_STUDIO_CONFIG.colors.white} />
      <circle cx="17.7" cy="16.2" r="2.1" fill={IDESIGN_STUDIO_CONFIG.colors.white} />
      <path
        d="M24 32V21h6.4v3.1h-3V32h-3.4Zm4.7-11c2 0 3.4 1 3.8 2.8l-3.1.7c-.2-.5-.5-.8-1-.8-.6 0-1 .3-1 .8 0 .5.4.7 1.4.9l1.1.2c2.3.4 3.4 1.6 3.4 3.6 0 2.6-2 4-5 4-2.6 0-4.3-1.2-4.8-3.2l3-.7c.3.9.9 1.3 1.8 1.3.8 0 1.3-.3 1.3-.9 0-.5-.4-.7-1.5-.9l-1.1-.2c-2.3-.4-3.4-1.6-3.4-3.6 0-2.4 1.9-3.8 4.6-3.8Z"
        fill={IDESIGN_STUDIO_CONFIG.colors.white}
      />
    </svg>
  );
}
