import type { HighlightTarget } from "./types";

// Targets extracted from public/sample.pdf (MTAR Technologies Annual Report FY24-25)
// using gen_targets.py (PyMuPDF) — see project root. Rects are fractions of page
// width/height (0..1), so they stay correct at any render width / scale / DPI.
export const TARGETS: HighlightTarget[] = [
  // — Text — single line (acceptance criterion 1)
  {
    id: "t-single",
    page: 1,
    kind: "text",
    phrase: "Company Secretary and Compliance Officer",
  },
  // — Text — phrase that WRAPS across a line break: "...advanced⏎technologies..."
  //   (acceptance criterion 2 — must light up BOTH line fragments)
  {
    id: "t-wrap",
    page: 4,
    kind: "text",
    phrase: "vision to indigenize advanced technologies for India",
  },
  // — Text — jumps to a deeper page
  {
    id: "t-deep",
    page: 5,
    kind: "text",
    phrase: "Dear Stakeholders",
  },
  // — Text — deliberately non-matching: must log a warning and NOT throw
  {
    id: "t-nomatch",
    page: 1,
    kind: "text",
    phrase: "this exact phrase does not exist anywhere in the document",
  },
  // — Image — Managing Director's headshot on p.5 (criterion 3).
  //   NOTE: the cover (p.2) has a full-bleed background image + 8 photos — the bulk of
  //   this 8 MB file — which pdfjs is very slow to raster. We target a clean single photo
  //   on a text-light page so the image demo is snappy and reliable.
  {
    id: "img-md",
    page: 5,
    kind: "rect",
    subtype: "image",
    rect: { x: 0.6651, y: 0.1328, w: 0.2439, h: 0.1824 },
  },
  // — Table — BSE/NSE exchange-address box, AND a particular value inside it
  //   ("MTARTECH", the NSE symbol) highlighted via the text layer (criterion 4).
  {
    id: "tbl-exchange",
    page: 1,
    kind: "rect",
    subtype: "table",
    rect: { x: 0.1752, y: 0.1777, w: 0.6881, h: 0.0915 },
    value: "MTARTECH",
  },
  // — Region — arbitrary rectangle framing the "Contents" block (criterion 5)
  {
    id: "reg-contents",
    page: 3,
    kind: "rect",
    subtype: "region",
    rect: { x: 0.085, y: 0.55, w: 0.355, h: 0.4 },
  },
];
