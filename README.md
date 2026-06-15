# Temporary PDF Highlight on Link Click

A runnable **Vite + React + TypeScript** prototype: clicking a link jumps to a page in a
PDF and **temporarily flashes** a target on that page (flash → fade, not persisted). The
target can be a **text phrase**, an **image**, a **table** (block, optionally pinpointing
one value inside it), or an **arbitrary region**.

The PDF is rendered with **[react-pdf](https://github.com/wojtekmaj/react-pdf)** (a thin
wrapper over PDF.js) so the app owns the DOM and can draw over it — a native
`<iframe src="file.pdf">` is a sealed, cross-origin box and cannot be highlighted.

> Sample document: the **MTAR Technologies Annual Report FY 2024-25** (311 pages, ~8 MB),
> included at [`public/sample.pdf`](public/sample.pdf). All highlight coordinates in the
> demo were extracted from this exact file.

- 📐 **[APPROACH.md](APPROACH.md)** — the design: anchoring strategies, data model, timing,
  and how to generate/store highlight data for a real corpus.
- 🔧 **[IMPLEMENTATION.md](IMPLEMENTATION.md)** — file-by-file build, the multi-span text
  matcher, the flash lifecycle, gotchas, and verification.

## What you can click (demo targets)

| Link | Page | Kind | Demonstrates |
|---|---|---|---|
| “Company Secretary and Compliance Officer” | 1 | text | single-line phrase highlight |
| “vision to indigenize advanced technologies for India” | 4 | text | **phrase that wraps across a line break** (both fragments light up) |
| “Dear Stakeholders” | 5 | text | jump to a deeper page |
| “this exact phrase does not exist …” | 1 | text | graceful **no-match** (warns, never throws) |
| image highlight | 5 | rect | box over an embedded photo |
| table + value “MTARTECH” | 1 | rect | **table block framed + one value highlighted inside it** |
| region highlight | 3 | rect | arbitrary rectangle |

Plus a **page-width toggle (800 / 600 px)** to prove rect overlays stay aligned (coords are
stored as 0..1 fractions, multiplied by the rendered page size).

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # tsc -b && vite build  → dist/
npm run preview      # serve the production build
```

## Headless verification

`verify.mjs` loads `public/sample.pdf` with PDF.js in Node, feeds the **real** text-layer
items through the actual `src/pdf/textMatch.ts`, and asserts the highlights (single-line,
multi-line wrap, deep-page, table value, no-match, HTML escaping):

```bash
node verify.mjs      # 14 assertions, all passing
```

## Project structure

```
src/
  main.tsx                    React root (StrictMode intentionally omitted — see IMPLEMENTATION.md)
  App.tsx                     demo harness: link list, width toggle, active-target state
  styles.css                  layout + highlight (mark) styles
  pdf/
    pdfWorker.ts              PDF.js worker wiring (Vite ?url import)
    types.ts                  HighlightTarget discriminated union
    highlightData.ts          fixture: the demo targets (extracted from sample.pdf)
    useTemporaryHighlight.ts  flash lifecycle (timer + body class)
    textMatch.ts              multi-span, drift-free phrase matching → <mark>
    RectHighlight.tsx         absolutely-positioned overlay for image/table/region
    PdfViewer.tsx             Document/Page + both highlight renderers + timing
    LinkList.tsx              the clickable links
gen_targets.py                PyMuPDF script to (re)generate fixture coords from a PDF
verify.mjs                    headless text-matching test against the real PDF
```

## Regenerating fixture coordinates for another PDF

```bash
python3 -m venv .venv && ./.venv/bin/pip install pymupdf
./.venv/bin/python gen_targets.py public/sample.pdf 6   # dumps page dims, images, tables, text
```

Paste the normalized (0..1) rects into `src/pdf/highlightData.ts` and add `text` targets by
hand. See [APPROACH.md](APPROACH.md#where-do-the-coordinates-come-from) for the full
preprocessing strategy.

## Tech stack

Vite 8 · React 19 · TypeScript · react-pdf 10 · pdfjs-dist **5.4.296** (pinned to match
react-pdf — a version mismatch breaks the worker; see IMPLEMENTATION.md).

## Known limitations

- The **cover (page 2)** has a full-bleed background image plus 8 photos — the bulk of the
  8 MB file — which PDF.js is slow to rasterize to canvas; the image demo therefore targets
  a clean single photo on a lighter page (page 5). Text extraction is unaffected.
- Cell-level table highlighting is supported as "one value inside the block"; full
  row/column grids are out of scope (see APPROACH.md §scope).
- Single-page-at-a-time viewing (driven by the clicked target's page); no continuous-scroll
  virtualization.

## License

Prototype / educational. The sample PDF is MTAR Technologies' publicly published annual
report, included only to make the demo runnable.
