import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Page } from "react-pdf";
import type { TextContent } from "pdfjs-dist/types/src/display/api";

import type { HighlightTarget } from "./types";
import RectHighlight from "./RectHighlight";
import {
  buildRanges,
  escapeHtml,
  findMatches,
  renderItemHtml,
  type ItemRange,
  type Match,
} from "./textMatch";

type Props = {
  pageNumber: number;
  width: number;
  rootRef: RefObject<HTMLDivElement | null>;
  /** Non-null only when this page is the active highlight target. */
  target: HighlightTarget | null;
  nonce: number;
  flashOn: boolean;
  flash: () => void;
};

const A4_RATIO = 842 / 595; // height/width fallback used before a page has rendered

/**
 * One page in the continuous scroll. The heavy react-pdf <Page> is mounted only when
 * the wrapper is near the viewport (IntersectionObserver); otherwise a same-height
 * skeleton holds its place so the scrollbar stays stable. Highlight machinery runs
 * only when this page is the active target.
 */
export default function LazyPage({
  pageNumber,
  width,
  rootRef,
  target,
  nonce,
  flashOn,
  flash,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const aspectRef = useRef(A4_RATIO); // h/w, refined once the page renders

  const rangesRef = useRef<ItemRange[]>([]);
  const matchesRef = useRef<Match[]>([]);

  const isTarget = target != null;

  // Mount the <Page> only when within ~800px of the viewport; unmount when far away.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { root: rootRef.current ?? null, rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef]);

  // Highlight phrase: a text target's phrase, or a rect target's optional `value`.
  const matchPhrase =
    target?.kind === "text"
      ? target.phrase
      : target?.kind === "rect"
        ? target.value
        : undefined;
  const markClass = target?.kind === "rect" ? "pdf-flash pdf-flash-value" : "pdf-flash";

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
        console.warn(`[pdf-highlight] no text match for: "${matchPhrase}"`);
      }
    },
    [matchPhrase]
  );

  const textRenderer = useCallback(
    (textItem: { str: string; itemIndex: number }) => {
      if (!matchPhrase) return escapeHtml(textItem.str);
      const range = rangesRef.current.find((r) => r.itemIndex === textItem.itemIndex);
      if (!range || matchesRef.current.length === 0) return escapeHtml(textItem.str);
      return renderItemHtml(textItem.str, range, matchesRef.current, markClass);
    },
    [matchPhrase, markClass]
  );

  // Capture rendered pixel dims (for the rect overlay + a stable placeholder height).
  const onRenderSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setDims({ w: page.width, h: page.height });
      aspectRef.current = page.height / page.width;
      if (target?.kind === "rect") flash();
    },
    [target, flash]
  );

  // Text layer (incl. our <mark>s) is in the DOM now: scroll the first mark into view
  // (rect targets scroll via RectHighlight) and flash.
  const onRenderTextLayerSuccess = useCallback(() => {
    if (!matchPhrase) return;
    if (target?.kind === "text") {
      const mark = wrapRef.current?.querySelector("mark.pdf-flash");
      if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    flash();
  }, [matchPhrase, target, flash]);

  const placeholderHeight = dims?.h ?? width * aspectRef.current;

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className="page-wrap"
      style={{ width, minHeight: visible ? undefined : placeholderHeight }}
    >
      {visible ? (
        <Page
          // Remounting the target page on each click re-runs the highlight pipeline
          // (getText → render → flash). Non-target pages keep a stable key.
          key={isTarget ? `hl-${nonce}` : "plain"}
          pageNumber={pageNumber}
          width={width}
          customTextRenderer={isTarget ? textRenderer : undefined}
          onGetTextSuccess={isTarget ? onGetTextSuccess : undefined}
          onRenderSuccess={onRenderSuccess}
          onRenderTextLayerSuccess={isTarget ? onRenderTextLayerSuccess : undefined}
        />
      ) : (
        <div className="page-skeleton" style={{ height: placeholderHeight }}>
          Page {pageNumber}
        </div>
      )}

      {isTarget && target.kind === "rect" && dims && (
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
