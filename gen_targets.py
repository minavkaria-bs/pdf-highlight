#!/usr/bin/env python3
"""Extract normalized (0..1) rects for images/tables and dump page text.

Usage: python gen_targets.py sample.pdf [max_pages]
Emits JSON to stdout describing the first N pages so we can build the
highlightData.ts fixture against the *real* document.

PyMuPDF origin is top-left, which matches the react-pdf overlay's coordinate
assumption (x*pageWidth, y*pageHeight from the top-left corner).
"""
import sys
import json
import fitz  # pymupdf

path = sys.argv[1]
max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 6

doc = fitz.open(path)
out = {"pageCount": doc.page_count, "pages": []}

for pno in range(min(max_pages, doc.page_count)):
    page = doc[pno]
    pw, ph = page.rect.width, page.rect.height

    def norm(r):
        return {
            "x": round(r.x0 / pw, 4),
            "y": round(r.y0 / ph, 4),
            "w": round((r.x1 - r.x0) / pw, 4),
            "h": round((r.y1 - r.y0) / ph, 4),
        }

    page_info = {
        "page": pno + 1,
        "rotation": page.rotation,
        "width": round(pw, 2),
        "height": round(ph, 2),
        "images": [],
        "tables": [],
        # Plain text for picking phrase targets (whitespace as PDF.js-ish).
        "text": page.get_text("text"),
    }

    # Images: dedupe by rounded rect so repeated xrefs don't spam.
    seen = set()
    for i, img in enumerate(page.get_images(full=True)):
        xref = img[0]
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        for r in rects:
            if r.width < 8 or r.height < 8:
                continue  # ignore tiny decorations
            key = (round(r.x0), round(r.y0), round(r.x1), round(r.y1))
            if key in seen:
                continue
            seen.add(key)
            n = norm(r)
            n["area"] = round(n["w"] * n["h"], 4)
            page_info["images"].append(n)

    # Tables (PyMuPDF >= 1.23).
    try:
        for i, tbl in enumerate(page.find_tables().tables):
            page_info["tables"].append(norm(fitz.Rect(tbl.bbox)))
    except Exception as e:
        page_info["tables_error"] = str(e)

    out["pages"].append(page_info)

print(json.dumps(out, indent=2))
