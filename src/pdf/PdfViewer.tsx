import { useCallback, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { TextContent } from "pdfjs-dist/types/src/display/api";

import type { ActiveTarget } from "./types";
import RectHighlight from "./RectHighlight";
import { useTemporaryHighlight } from "./useTemporaryHighlight";
import {
  buildRanges,
  escapeHtml,
  findMatches,
  renderItemHtml,
  type ItemRange,
  type Match,
} from "./textMatch";

type Props = {
  file: string;
  active: ActiveTarget | null;
  width?: number;
};

export default function PdfViewer({ file, active, width = 800 }: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { active: flashOn, flash } = useTemporaryHighlight();

  // Recomputed whenever a page's text content loads.
  const rangesRef = useRef<ItemRange[]>([]);
  const matchesRef = useRef<Match[]>([]);

  const target = active?.target ?? null;
  const nonce = active?.nonce ?? 0;
  const pageNumber = target?.page ?? 1;

  // The phrase to highlight in the text layer: a text target's phrase, OR the optional
  // `value` carried by a rect target (e.g. one value inside a table block). Rect values
  // get a distinct mark color so they stand out against the block highlight.
  const matchPhrase =
    target?.kind === "text"
      ? target.phrase
      : target?.kind === "rect"
        ? target.value
        : undefined;
  const markClass = target?.kind === "rect" ? "pdf-flash pdf-flash-value" : "pdf-flash";

  // Text content ready: build the offset map and find phrase matches for this page.
  const onGetTextSuccess = useCallback(
    (tc: TextContent) => {
      if (!matchPhrase) {
        rangesRef.current = [];
        matchesRef.current = [];
        return;
      }
      const { pageText, ranges } = buildRanges(tc.items);
      rangesRef.current = ranges;
      matchesRef.current = findMatches(pageText, matchPhrase);
      if (matchesRef.current.length === 0) {
        // graceful no-match — must never throw (acceptance / manual test plan)
        console.warn(`[pdf-highlight] no text match for: "${matchPhrase}"`);
      }
    },
    [matchPhrase]
  );

  // Per-item renderer: wrap matched slices in <mark>, escape everything else.
  // react-pdf reports `itemIndex` against the same items array buildRanges used.
  const textRenderer = useCallback(
    (textItem: { str: string; itemIndex: number }) => {
      if (!matchPhrase) return escapeHtml(textItem.str);
      const range = rangesRef.current.find((r) => r.itemIndex === textItem.itemIndex);
      if (!range || matchesRef.current.length === 0) return escapeHtml(textItem.str);
      return renderItemHtml(textItem.str, range, matchesRef.current, markClass);
    },
    [matchPhrase, markClass]
  );

  // Canvas rendered: capture pixel dims. Rect targets can flash as soon as we know them.
  const onRenderSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setDims({ w: page.width, h: page.height });
      if (target?.kind === "rect") flash();
    },
    [target, flash]
  );

  // Text layer DOM (including our <mark>s) exists now: scroll into view + flash.
  // Doing this in onRenderSuccess would be too early — the text layer isn't in the DOM.
  const onRenderTextLayerSuccess = useCallback(() => {
    if (!matchPhrase) return;
    // Pure text targets scroll the first mark into view; rect targets scroll via
    // RectHighlight. Then (re)flash now that the <mark>s exist in the DOM.
    if (target?.kind === "text") {
      const mark = document.querySelector("mark.pdf-flash");
      if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    flash();
  }, [matchPhrase, target, flash]);

  // Remount <Page> on page change OR repeat click (nonce) so the highlight re-runs.
  const pageKey = useMemo(() => `${pageNumber}-${nonce}`, [pageNumber, nonce]);

  return (
    <div style={{ position: "relative", width, margin: "0 auto" }}>
      <Document file={file} loading="Loading PDF…" error="Failed to load PDF.">
        <Page
          key={pageKey}
          pageNumber={pageNumber}
          width={width}
          customTextRenderer={textRenderer}
          onGetTextSuccess={onGetTextSuccess}
          onRenderSuccess={onRenderSuccess}
          onRenderTextLayerSuccess={onRenderTextLayerSuccess}
        />
      </Document>

      {target?.kind === "rect" && dims && (
        <RectHighlight
          rect={target.rect}
          subtype={target.subtype}
          pageWidth={dims.w}
          pageHeight={dims.h}
          active={flashOn}
          scrollKey={nonce}
          hollow={Boolean(target.value)}
        />
      )}
    </div>
  );
}
