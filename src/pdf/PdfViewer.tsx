import { useEffect, useRef, useState } from "react";
import { Document } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import type { ActiveTarget } from "./types";
import { useTemporaryHighlight } from "./useTemporaryHighlight";
import LazyPage from "./LazyPage";

type Props = {
  file: string;
  active: ActiveTarget | null;
  width?: number;
};

export default function PdfViewer({ file, active, width = 800 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { active: flashOn, flash } = useTemporaryHighlight();

  const target = active?.target ?? null;
  const nonce = active?.nonce ?? 0;

  // Scroll the target page into view whenever a link is (re)clicked. `active` is a
  // fresh object per click (it carries an incrementing nonce), so this re-runs even
  // when the same link is clicked again.
  useEffect(() => {
    if (!target || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-page="${target.page}"]`);
    // Instant (not smooth): a long smooth scroll gets cancelled when lazy pages mount
    // and change height mid-animation. This jump also brings an unmounted target page
    // into view so its IntersectionObserver mounts it; the precise centering on the
    // mark/overlay then happens (smoothly) once the page has rendered.
    el?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [active, target]);

  return (
    <div className="viewer-scroll" ref={scrollRef}>
      <Document
        file={file}
        loading="Loading PDF…"
        error="Failed to load PDF."
        onLoadSuccess={(doc) => setNumPages(doc.numPages)}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <LazyPage
            key={n}
            pageNumber={n}
            width={width}
            rootRef={scrollRef}
            target={target?.page === n ? target : null}
            nonce={nonce}
            flashOn={flashOn}
            flash={flash}
          />
        ))}
      </Document>
    </div>
  );
}
