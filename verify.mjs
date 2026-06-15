// Headless verification of the text-matching pipeline against the REAL PDF text layer.
// Loads sample.pdf with pdfjs (the same engine react-pdf uses), feeds the actual
// getTextContent() items through our real textMatch.ts, and asserts the marks.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
try {
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
} catch {}

// our real source (Node 24 strips the type-only import automatically)
const { buildRanges, findMatches, renderItemHtml } = await import(
  "./src/pdf/textMatch.ts"
);

const data = new Uint8Array(readFileSync("./public/sample.pdf"));
const doc = await pdfjs.getDocument({ data }).promise;

const MARK_RE = /<mark class="([^"]*)">([\s\S]*?)<\/mark>/g;

async function analyze(pageNum, phrase, markClass = "pdf-flash") {
  const page = await doc.getPage(pageNum);
  const tc = await page.getTextContent(); // same call react-pdf's TextLayer uses
  const { pageText, ranges } = buildRanges(tc.items);
  const matches = findMatches(pageText, phrase);

  // Emulate react-pdf calling customTextRenderer per text item.
  const fragsByItem = [];
  for (const r of ranges) {
    const item = tc.items[r.itemIndex];
    const html = renderItemHtml(item.str, r, matches, markClass);
    const marks = [...html.matchAll(MARK_RE)].map((m) => ({ cls: m[1], text: m[2] }));
    if (marks.length) fragsByItem.push({ itemIndex: r.itemIndex, marks });
  }
  const allMarkText = fragsByItem.flatMap((f) => f.marks.map((x) => x.text)).join(" ");
  const allClasses = [...new Set(fragsByItem.flatMap((f) => f.marks.map((x) => x.cls)))];
  return { matches, fragsByItem, allMarkText, allClasses };
}

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

console.log("\n=== Criterion 1: single-line text (page 1) ===");
{
  const phrase = "Company Secretary and Compliance Officer";
  const { matches, fragsByItem, allMarkText } = await analyze(1, phrase);
  check("phrase is found", matches.length >= 1, `${matches.length} match(es)`);
  check(
    "marked text equals the phrase",
    norm(allMarkText) === norm(phrase),
    `marked="${allMarkText}"`
  );
  console.log(`   spans ${fragsByItem.length} text item(s)`);
}

console.log("\n=== Criterion 2: phrase that WRAPS across a line break (page 4) ===");
{
  const phrase = "vision to indigenize advanced technologies for India";
  const { matches, fragsByItem, allMarkText } = await analyze(4, phrase);
  check("phrase is found", matches.length >= 1, `${matches.length} match(es)`);
  check(
    "highlight spans >= 2 text items (both line fragments)",
    fragsByItem.length >= 2,
    `${fragsByItem.length} items: ${JSON.stringify(fragsByItem.map((f) => f.marks))}`
  );
  check(
    'last word of line 1 ("advanced") is marked',
    norm(allMarkText).includes("advanced")
  );
  check(
    'first word of line 2 ("technologies") is marked',
    norm(allMarkText).includes("technologies")
  );
  check(
    "reconstructed marked text equals the phrase",
    norm(allMarkText) === norm(phrase),
    `marked="${allMarkText}"`
  );
}

console.log("\n=== Criterion: deep page jump + match (page 5) ===");
{
  const phrase = "Dear Stakeholders";
  const { matches, allMarkText } = await analyze(5, phrase);
  check("phrase is found on page 5", matches.length >= 1, `marked="${allMarkText}"`);
}

console.log("\n=== Table value: highlight a particular value INSIDE the table (page 1) ===");
{
  const { matches, allMarkText, allClasses } = await analyze(
    1,
    "MTARTECH",
    "pdf-flash pdf-flash-value"
  );
  check("value 'MTARTECH' is found in the table block", matches.length >= 1, `marked="${allMarkText}"`);
  check(
    "value uses the distinct value mark class",
    allClasses.includes("pdf-flash pdf-flash-value"),
    JSON.stringify(allClasses)
  );
}

console.log("\n=== Graceful no-match (must return [] and not throw) ===");
{
  const phrase = "this exact phrase does not exist anywhere in the document";
  const { matches, fragsByItem } = await analyze(1, phrase);
  check("returns zero matches", matches.length === 0);
  check("produces zero marks", fragsByItem.length === 0);
}

console.log("\n=== HTML escaping (no injection / no broken markup) ===");
{
  // synthetic item containing characters that must be escaped
  const items = [{ str: 'a <b> & "c" highlight d', hasEOL: false }];
  const { pageText, ranges } = buildRanges(items);
  const matches = findMatches(pageText, "highlight");
  const html = renderItemHtml(items[0].str, ranges[0], matches);
  check(
    "raw < and & are escaped outside the mark",
    html.includes("&lt;b&gt;") && html.includes("&amp;"),
    html
  );
  check("the matched word is wrapped", /<mark class="pdf-flash">highlight<\/mark>/.test(html));
}

console.log(`\n──────────── ${pass} passed, ${fail} failed ────────────\n`);
process.exit(fail ? 1 : 0);
