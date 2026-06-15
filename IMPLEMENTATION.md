# Implementation

How the prototype is actually built — file by file — with the non-obvious bits called out.

## Dependencies & the version-pin trap

```bash
npm create vite@latest pdf-highlight -- --template react-ts
npm install react-pdf pdfjs-dist@5.4.296
```

⚠️ **`react-pdf` v10 bundles `pdfjs-dist@5.x`.** `npm install pdfjs-dist` (no version) pulls
6.x, and the worker URL then resolves to a 6.x worker while react-pdf runs the 5.x API →
**"The API version X does not match the Worker version Y"** and nothing renders. Fix: pin
the top-level `pdfjs-dist` to the exact version react-pdf depends on (here `5.4.296`) so
there is a single, matching copy:

```bash
node -e "console.log(require('react-pdf/node_modules/pdfjs-dist/package.json').version)"  # what to pin to
```

## File-by-file

### `src/pdf/pdfWorker.ts` — worker wiring
Sets `pdfjs.GlobalWorkerOptions.workerSrc` on **react-pdf's own** `pdfjs` instance, using
Vite's `?url` import (the reliable way to get the bundled worker's served URL):

```ts
import { pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

Imported once in `App.tsx` for its side effect.

### `src/pdf/types.ts` — the target union
The `HighlightTarget` discriminated union (see APPROACH.md §4). The rect variant carries an
optional `value` — a phrase to *also* highlight inside the rect (the table-value feature).

### `src/pdf/highlightData.ts` — the fixture
The demo targets, with rects extracted from `public/sample.pdf` via `gen_targets.py`. Rects
are 0..1 fractions. In production this comes from your extraction pipeline (APPROACH.md §7).

### `src/pdf/textMatch.ts` — multi-span, drift-free matching
The trickiest part. `customTextRenderer` is called **per text item**, and PDF.js splits a
phrase unpredictably across items/lines. The algorithm:

1. **`buildRanges(items)`** — concatenate every text item's `str` (in reading order) into
   one `pageText`, recording each item's `[start, end)` range. A `\n` is appended after
   items with `hasEOL` to preserve word boundaries across lines. `itemIndex` is the index
   in the **full** items array — this matters because react-pdf's `customTextRenderer`
   reports that same index (it iterates all items, skipping marked-content).
2. **`findMatches(pageText, phrase)`** — match on a **whitespace-normalized** copy (so a
   phrase that PDF.js wrapped across a line still matches), but keep a `normIndex → rawIndex`
   map so matches are reported as **exact raw offsets**. This eliminates the index drift you
   get from naively matching on normalized text and rendering on raw text. Case-insensitive.
3. **`renderItemHtml(str, range, matches, markClass)`** — for one item, wrap the slice(s)
   overlapping any match in `<mark class="…">`, escaping everything else. Returns an HTML
   string (react-pdf sanitizes it but preserves `<mark class>`).

Because matches are exact raw offsets, a phrase spanning two line-items produces a `<mark>`
in **each** item — that's how the multi-line wrap criterion works.

### `src/pdf/useTemporaryHighlight.ts` — flash lifecycle
`flash()` sets `active = true` and schedules `active = false` after `durationMs` (2500). A
`useEffect` toggles `document.body.classList` `flash-active` so CSS can light all text
`<mark>`s at once; the rect overlay reads `active` via props. Cleans up timer + class on
unmount.

### `src/pdf/RectHighlight.tsx` — the overlay
An absolutely-positioned `<div>` at `rect.{x,y,w,h} × {pageWidth,pageHeight}`. Accent color
per subtype. `opacity` transitions for the fade; `scrollIntoView` on activation. A `hollow`
prop (used when a `value` is highlighted inside) drops the fill so the inner value shows
cleanly through an outline-only box. `zIndex: 3` keeps it above the canvas/text layers.

### `src/pdf/PdfViewer.tsx` — the core
- Derives `matchPhrase` = a text target's `phrase` **or** a rect target's `value`, and
  `markClass` (rect values use `pdf-flash-value` for a distinct color).
- `onGetTextSuccess` → builds ranges + finds matches for `matchPhrase` (warns, never throws,
  on no match).
- `customTextRenderer` → wraps matches via `renderItemHtml`.
- `onRenderSuccess` → captures pixel dims; flashes rect targets.
- `onRenderTextLayerSuccess` → scrolls text targets into view; (re)flashes once `<mark>`s are
  in the DOM.
- `<Page key={`${page}-${nonce}`}>` → remounts on page change **or** repeat click.

### `src/pdf/LinkList.tsx` / `src/App.tsx` / `src/styles.css`
The demo harness: a list of buttons that set `{ target, nonce }`, a 800/600 width toggle,
and the `mark.pdf-flash` / `mark.pdf-flash-value` fade styles. `App.tsx` imports
`pdfWorker.ts` for its side effect.

### `src/main.tsx` — no StrictMode
Intentionally renders `<App/>` **without** `<StrictMode>`: react-pdf paints a `<canvas>`
imperatively, and StrictMode's dev mount→unmount→remount cancels the in-flight render and
clears the canvas mid-paint, leaving image-heavy pages blank. StrictMode is a no-op in
production, so this keeps dev == prod.

## Verification

| Layer | Command | Result |
|---|---|---|
| Types | `npm exec tsc -- -b` | passes |
| Bundle (worker, CSS, types resolve) | `npm run build` | 62 modules, worker emitted |
| **Matching logic vs the real PDF** | `node verify.mjs` | **14/14 assertions pass** |
| Behavior in a real browser | manual / screenshots | text, table+value, region confirmed |

`verify.mjs` is the high-value check: it loads `public/sample.pdf` with PDF.js in Node and
runs the **actual** `textMatch.ts` against the **real** `getTextContent()` items. It proves,
on the real document, that the wrap phrase splits into two items
(`["vision to indigenize advanced"]`, `["technologies for India"]`) and **both** get marked;
that the table value `MTARTECH` matches with the distinct class; that a bogus phrase yields
zero matches; and that `<`, `>`, `&` are escaped.

## Traps avoided (carried from research + found while building)

- Don't render the PDF in a native `<iframe>`/`<embed>` and expect to highlight it.
- Don't return JSX from `customTextRenderer` — current react-pdf expects an **HTML string**
  (and sanitizes it; escape interpolated text).
- Don't run the text scroll/flash in `onRenderSuccess` — the text layer isn't in the DOM yet.
- Don't CSS-scale the canvas to resize; use `<Page width>` so the layers stay aligned.
- Don't assume a phrase is one text item — map matches across items.
- Don't store rects in absolute px/points — store 0..1 fractions.
- Don't let `pdfjs-dist` drift from the version react-pdf expects.

## Adapting to another PDF

1. Replace `public/sample.pdf`.
2. Run `gen_targets.py <pdf>` and paste normalized rects into `highlightData.ts`; add `text`
   targets (with the exact phrases) by hand.
3. Run `node verify.mjs` (update the asserted phrases) to confirm matches before clicking.
