import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";

/**
 * Crisp vector globe used beside the language selector. It is decorative, so
 * assistive technology ignores it while the language button keeps its label.
 */
export default function GlobeIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const outer = IDESIGN_STUDIO_CONFIG.colors.royalBlue;
  const meridians = IDESIGN_STUDIO_CONFIG.colors.royalBlueBright;
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
      <circle cx="12" cy="12" r="9" stroke={outer} strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9" stroke={meridians} strokeWidth="1.4" />
      <path
        d="M12 3v18M3.4 9h17.2M3.4 15h17.2"
        stroke={meridians}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
