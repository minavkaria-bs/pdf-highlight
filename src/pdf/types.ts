export type Frac = number; // 0..1 fraction of page width/height

export type RectFrac = { x: Frac; y: Frac; w: Frac; h: Frac };

export type HighlightTarget =
  | { id: string; page: number; kind: "text"; phrase: string }
  | {
      id: string;
      page: number;
      kind: "rect";
      subtype: "image" | "table" | "region";
      rect: RectFrac;
      // Optional phrase to ALSO highlight inside the rect — e.g. pinpoint one value
      // within a table block. Highlighted via the text layer (exact glyph bounds).
      value?: string;
    };

export type ActiveTarget = { target: HighlightTarget; nonce: number };
