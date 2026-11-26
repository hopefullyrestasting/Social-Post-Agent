"use client";

import Image from "next/image";
import { useState } from "react";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import IDMark from "./id-mark";

/**
 * Studio shell emblem. Prefers the live iDesign favicon for brand recognition
 * and falls back to the bundled vector mark when the remote asset cannot load.
 * It is UI-only and never enters a generated tenant creative.
 */
export default function StudioEmblem({ size = 44 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <IDMark size={size} />;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src={IDESIGN_STUDIO_CONFIG.faviconUrl}
        alt={`${IDESIGN_STUDIO_CONFIG.name} logo`}
        width={size}
        height={size}
        unoptimized
        onError={() => setFailed(true)}
        className="h-full w-full object-contain p-1"
      />
    </span>
  );
}
