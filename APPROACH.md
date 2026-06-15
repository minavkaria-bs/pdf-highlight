# Approach

How the prototype is designed, why, and how you'd take the "where do highlights come from"
question to production.

## 1. The problem

In a React app that renders a PDF, clicking a link should (1) jump to a page and
(2) **temporarily** highlight a target on it (flash + fade, not persisted). The target is
**not always text** — it can be a text phrase, an image, a table, or an arbitrary region.

## 2. The hard constraint that drives everything

A native `<iframe src="file.pdf">` (the browser's built-in viewer) is a **sealed,
cross-origin box**: page JavaScript cannot read its DOM or draw into it. So to overlay
highlights we must render the PDF ourselves with **PDF.js**. This prototype uses
**react-pdf**, a thin React wrapper that exposes exactly the two hooks we need:
`customTextRenderer` (to wrap text) and a positioned page container (to overlay a box).

## 3. Two anchoring strategies

Different targets are anchored differently, so there are exactly **two** highlight
renderers:

| Target type | Searchable text? | Anchor | Highlight mechanism |
|---|---|---|---|
| Text phrase | yes | the string | find in the **text layer**, wrap matches in `<mark>` |
| Image | no | a rectangle (bbox) | absolutely-positioned **overlay `<div>`** |
| Table (block) | positionally | a rectangle (bbox) | overlay `<div>` (distinct accent) |
| Region | no | a rectangle (bbox) | overlay `<div>` |
| **Value inside a table** | yes | the string | text-layer `<mark>`, **plus** the block overlay |

Everything that isn't plain text falls back to the rect renderer. The "value inside a
table" case (e.g. highlight the exchange box **and** pinpoint `MTARTECH`) composes both:
the block is drawn as an outline-only rect, and the value is highlighted via the text layer
in a distinct color.

## 4. Data model — the link payload

Each link carries a `HighlightTarget`, a small discriminated union
([`src/pdf/types.ts`](src/pdf/types.ts)):

```ts
type Frac = number; // 0..1 fraction of page width/height

type HighlightTarget =
  | { id: string; page: number; kind: "text"; phrase: string }
  | { id: string; page: number; kind: "rect";
      subtype: "image" | "table" | "region";
      rect: { x: Frac; y: Frac; w: Frac; h: Frac };
      value?: string;   // optional phrase to ALSO highlight inside the rect
    };
```

Design decisions:

- **`page` is 1-based** (matches react-pdf's `pageNumber`).
- **Rectangles are stored as fractions of page dimensions (0..1), never absolute
  points/pixels.** At render time we multiply by the *actual rendered* page width/height,
  so a box stays correct across zoom, resize, DPI, and the 800/600 width toggle.
- **`kind` selects the renderer**; `subtype` only affects styling (accent color).
- The union is **open for extension** — adding `kind: "cells"` later is non-breaking.

## 5. Component architecture & state flow

```
App  (active target + nonce, page-width toggle)
└── PdfViewer (file, active, width)
    ├── Document
    │   └── Page (key = `${page}-${nonce}`)
    │        ├── canvas layer        (react-pdf)
    │        ├── text layer          (customTextRenderer wraps matches in <mark>)
    │        └── annotation layer    (react-pdf)
    └── RectHighlight (absolute overlay; rendered when kind === "rect")
LinkList (the buttons that set the active target)
```

A click sets `{ target, nonce }` on `App`. **`nonce` increments on every click** so
re-clicking the same link re-triggers the flash: it's part of the `<Page>` `key`, forcing a
remount that re-runs the whole highlight pipeline.

## 6. Timing model (where most PDF-highlight bugs live)

- Capture page pixel dimensions in **`onRenderSuccess`** (canvas ready) — rect overlays can
  position and flash immediately.
- Run text scroll/flash in **`onRenderTextLayerSuccess`** — the text layer DOM (including
  our `<mark>`s) does not exist until this fires. Doing it in `onRenderSuccess` is the #1
  cause of "nothing highlights."
- The flash itself: a `setTimeout` toggles an `active` flag for ~2.5 s; CSS transitions do
  the fade. A body-level `flash-active` class lights every text `<mark>` at once; the rect
  overlay reads `active` directly.

## 7. Where do the coordinates come from?

**Out of scope for the prototype** (it reads a static fixture), but this is the real
production question. The mental model: separate the **target descriptor** from its
**resolved coordinates**. There are two anchor kinds with very different storage needs:

- **Text** can be resolved **dynamically** — store just `{ page, phrase, occurrenceIndex }`
  and search the text layer at view time (what this prototype does). Tiny data, survives
  re-layout, behaves like search. Fails on scanned PDFs (no text layer) and needs an
  occurrence index to disambiguate repeats.
- **Rects (image/table/region)** essentially **must be precomputed** — PDF.js doesn't hand
  you figure/table bounding boxes, and table detection is non-trivial in the browser.

### Three levels of "what to keep"

| Level | Store | Enables | Cost |
|---|---|---|---|
| 0 | nothing (runtime search + the PDF's own outline/bookmarks) | text jumps only | none |
| 1 | **curated descriptors** — phrases + normalized rects for the figures/tables you want linkable (this prototype's `highlightData.ts`) | most apps: TOC, "show figure 3", "the revenue table" | small |
| 2 | **full positional index** — per-page word bboxes + table/figure boxes | highlight *any* phrase/cell instantly & offline; **scanned-PDF support** | ~proportional to word count |

### Recommended hybrid

1. **Text / search / AI-citations** → store `{ page, phrase, occurrenceIndex, context }`,
   resolve dynamically; optionally cache the resolved bbox on first view.
2. **Images / table blocks / table cells / regions** → precompute normalized rects at
   upload/build time. For a value-in-cell, store the cell rect **and** the value text.
3. Always persist **per-page dimensions + rotation**, keyed to **1-based page + 0..1
   fractions**.
4. Go to **Level 2 (word bboxes)** only if you have scanned pages, need exact offline
   highlighting, or want to avoid runtime matching cost.

### Tools for the preprocessing pass

- **PyMuPDF** (`fitz`) — images `page.get_image_rects()`, tables `page.find_tables()`
  (`.bbox`, `.rows`, `.cells` for cell-level), words `page.get_text("words")`, exact phrase
  `page.search_for(...)`. See [`gen_targets.py`](gen_targets.py) for a starting point.
- **pdfplumber / Camelot** for richer table cell grids.
- **Layout/ML or cloud** (Docling, LayoutParser, Azure Document Intelligence, AWS Textract,
  Google Document AI) for figure/caption/region detection and **OCR on scanned pages**.
- The **PDF's own outline / named destinations / link annotations**
  (`pdf.getOutline()`) give page-level "jump to" for free — your annual report has these.

### Coordinate gotchas

- Normalize by the page rect; use a **top-left origin** (PyMuPDF and PDF.js agree on this).
- Handle **page rotation** when normalizing.
- Store **fractions**, not PDF points — the viewer multiplies by rendered pixels.

### The `gen_targets.py` extractor + sample output

[`gen_targets.py`](gen_targets.py) is the concrete, offline implementation of the **Level-1**
strategy above — it grounds `highlightData.ts` in the *real* document. Run it once per PDF:

```bash
python gen_targets.py public/sample.pdf 8 > fixture-coords.json
```

**What it does, per page:**

1. Read the page rect → `width`/`height` (PDF points) and `rotation`.
2. **Images** — `get_images(full=True)` → `get_image_rects(xref)` for each; drop sub-8px
   decorations, dedupe by rounded rect, normalize to 0..1, record `area`.
3. **Tables** — `find_tables().tables` → each table's `bbox`, normalized. (PyMuPDF prints a
   one-line banner here; the script mutes it so stdout stays pure JSON.)
4. **Text** — `get_text("text")`, kept verbatim so you can pick `phrase`/`value` targets.

Every coordinate is divided by page width/height → **0..1 fractions, top-left origin** →
resolution-independent and drops straight into a `rect` target.

A full sample for `public/sample.pdf` (first 8 pages) is checked in at
[`fixture-coords.json`](fixture-coords.json). Trimmed:

```jsonc
{
  "pageCount": 311,
  "pages": [
    {
      "page": 1, "rotation": 0, "width": 612.0, "height": 792.0,
      "images": [
        { "x": 0.0575, "y": 0.0,    "w": 0.8915, "h": 0.1323, "area": 0.1179 }, // letterhead band
        { "x": 0.0506, "y": 0.9042, "w": 0.8982, "h": 0.08,   "area": 0.0719 }  // footer bar
      ],
      "tables": [
        { "x": 0.1752, "y": 0.1777, "w": 0.6881, "h": 0.0915 }  // → the `tbl-exchange` target
      ],
      "text": "To,  Date: 26th August 2025 … (BSE Scrip Code: 543270) … (NSE Symbol: MTARTECH) … Dear Sir/Madam, …"
    }
    // … pages 2–8 …
  ]
}
```

**Turning that into a target** ([`src/pdf/highlightData.ts`](src/pdf/highlightData.ts)) —
copy a rect verbatim; pick the `value`/`phrase` strings out of the `text` field:

```ts
// p1.tables[0] → the table block; `value` (a string seen in p1.text) pinpoints one cell
{ id: "tbl-exchange", page: 1, kind: "rect", subtype: "table",
  rect: { x: 0.1752, y: 0.1777, w: 0.6881, h: 0.0915 }, value: "MTARTECH" }
```

**Limitations:** `find_tables()` is heuristic (can miss or merge tables); `images` are
content-stream raster images, not vector charts; for an exact word/value box use
`page.get_text("words")` or `page.search_for(value)`; scanned PDFs have no text layer → OCR.

## 8. Scope / non-goals (prototype)

In scope: single-page-at-a-time viewing driven by the clicked target; text phrase highlight
incl. multi-line wraps; image/table/region via one overlay rect; one value highlighted
inside a table block; temporary flash + fade + scroll-into-view; alignment across page
widths.

Out of scope (TODOs): persisting highlights into the PDF; full cell/row-grid table
highlighting; continuous-scroll multi-page virtualization; robust scanned/OCR matching
(needs Level-2 word bboxes); server-side pre-rasterization of heavy pages.

## 9. Library rationale

- **react-pdf** — minimal surface, exposes both hooks we need (`customTextRenderer` +
  positioned container). Chosen for a prototype.
- If search/highlight becomes a core recurring feature → consider **@react-pdf-viewer**
  (built-in search + highlight-area plugins).
- If persisted, user-authored annotations are needed → **react-pdf-highlighter-extended**
  (viewport-independent highlight format).
- These stay swappable because targets are **coordinate/text data, not library objects**.

## 10. Notable decisions & discoveries

- **pdfjs-dist pinned to 5.4.296** to match react-pdf v10's bundled PDF.js — a worker/API
  version mismatch is the classic "API version X does not match Worker version Y" failure.
- **StrictMode removed** from the root: react-pdf renders onto a `<canvas>` imperatively,
  and StrictMode's dev double-mount cancels/clears the in-flight render, leaving heavy pages
  blank. StrictMode is a no-op in production, so removing it keeps dev == prod.
- **Drift-free text matching**: matching is whitespace-insensitive (robust to PDF.js
  line-wrapping) but maps matches back to **exact raw character offsets**, so the
  `<mark>`s land precisely even across line breaks. See IMPLEMENTATION.md.
- **Heavy-page rendering** (the cover) is a PDF.js rasterization cost, independent of the
  highlight logic — a good argument for server-side page pre-rendering at scale.
