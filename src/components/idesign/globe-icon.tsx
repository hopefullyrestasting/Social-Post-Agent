import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";

export default function GlobeIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const { royalBlue, royalBlueBright } = IDESIGN_STUDIO_CONFIG.colors;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" stroke={royalBlue} strokeWidth="1.7" />
      <ellipse
        cx="12"
        cy="12"
        rx="4.2"
        ry="9"
        stroke={royalBlueBright}
        strokeWidth="1.4"
      />
      <path
        d="M12 3v18M3.4 9h17.2M3.4 15h17.2"
        stroke={royalBlueBright}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
