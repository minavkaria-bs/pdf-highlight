import type { HighlightTarget } from "./types";
import { TARGETS } from "./highlightData";

const labelFor = (t: HighlightTarget): string => {
  if (t.kind === "text") return `“${t.phrase}”`;
  if (t.value) return `${t.subtype} + value “${t.value}”`;
  return `${t.subtype} highlight`;
};

export default function LinkList({
  active,
  onPick,
}: {
  active: HighlightTarget | null;
  onPick: (t: HighlightTarget) => void;
}) {
  return (
    <nav className="links">
      {TARGETS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={active?.id === t.id ? "link on" : "link"}
          onClick={() => onPick(t)}
          title={labelFor(t)}
        >
          <span className="badge">p.{t.page}</span>
          <span className="label">{labelFor(t)}</span>
        </button>
      ))}
    </nav>
  );
}
