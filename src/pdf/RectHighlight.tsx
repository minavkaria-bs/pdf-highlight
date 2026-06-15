import { useEffect, useRef, type CSSProperties } from "react";
import type { RectFrac } from "./types";

type Subtype = "image" | "table" | "region";

type Props = {
  rect: RectFrac;
  pageWidth: number;
  pageHeight: number;
  active: boolean;
  subtype: Subtype;
  scrollKey: number; // change to (re)trigger scroll-into-view
  hollow?: boolean; // outline only (no fill) — used when a value is highlighted inside
};

// Accent color per subtype — only affects styling, not behavior.
const ACCENT: Record<Subtype, string> = {
  image: "rgba(255, 170, 0, 0.95)",
  table: "rgba(0, 150, 255, 0.95)",
  region: "rgba(140, 90, 255, 0.95)",
};

export default function RectHighlight({
  rect,
  pageWidth,
  pageHeight,
  active,
  subtype,
  scrollKey,
  hollow = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // also re-scroll when the same link is re-clicked (scrollKey = nonce)
  }, [active, scrollKey]);

  // Position via fractional rect × actual rendered page pixels → stays aligned at
  // any <Page width>.
  const style: CSSProperties = {
    position: "absolute",
    left: rect.x * pageWidth,
    top: rect.y * pageHeight,
    width: rect.w * pageWidth,
    height: rect.h * pageHeight,
    background: hollow ? "transparent" : "rgba(255, 230, 0, 0.30)",
    outline: `2px solid ${ACCENT[subtype]}`,
    borderRadius: 2,
    pointerEvents: "none",
    transition: "opacity 1200ms ease-out",
    opacity: active ? 1 : 0,
    zIndex: 3, // above canvas + text/annotation layers
  };
  return <div ref={ref} style={style} aria-hidden />;
}
