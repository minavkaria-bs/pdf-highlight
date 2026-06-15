import { useState } from "react";
import "./pdf/pdfWorker"; // side-effect: configures the PDF.js worker
import "./styles.css";
import PdfViewer from "./pdf/PdfViewer";
import LinkList from "./pdf/LinkList";
import type { ActiveTarget, HighlightTarget } from "./pdf/types";

const WIDTHS = [800, 600] as const;

export default function App() {
  const [active, setActive] = useState<ActiveTarget | null>(null);
  const [width, setWidth] = useState<number>(WIDTHS[0]);

  // nonce increments on every click so re-clicking the same link re-triggers the flash.
  const pick = (target: HighlightTarget) =>
    setActive((prev) => ({ target, nonce: (prev?.nonce ?? 0) + 1 }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Temporary PDF Highlight</h1>
        <p className="hint">
          Click a link to jump to its page and flash the target (text, image, table,
          or region). The highlight fades after ~2.5s.
        </p>

        <LinkList active={active?.target ?? null} onPick={pick} />

        <div className="width-toggle">
          <span>Page width:</span>
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === width ? "on" : ""}
              onClick={() => setWidth(w)}
            >
              {w}px
            </button>
          ))}
        </div>
        <p className="hint small">
          Switch width, then re-click a rect link: overlays stay aligned because rects
          are stored as 0..1 fractions of the page.
        </p>
      </aside>

      <main className="viewer">
        {/* BASE_URL is "/" in dev and "/pdf-highlight/" in the Pages build, so the PDF
            (in public/) resolves correctly in both. */}
        <PdfViewer
          file={`${import.meta.env.BASE_URL}sample.pdf`}
          active={active}
          width={width}
        />
      </main>
    </div>
  );
}
