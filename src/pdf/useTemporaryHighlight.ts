import { useCallback, useEffect, useRef, useState } from "react";

const BODY_FLASH_CLASS = "flash-active";

/**
 * Drives the temporary "flash" lifecycle. `flash()` turns the highlight on and
 * schedules it off after `durationMs`. While active, a body-level class is toggled so
 * CSS can light up every text <mark> at once; the rect overlay reads `active` directly.
 */
export function useTemporaryHighlight(durationMs = 2500) {
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);

  const flash = useCallback(() => {
    setActive(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(false), durationMs);
  }, [durationMs]);

  useEffect(() => {
    document.body.classList.toggle(BODY_FLASH_CLASS, active);
  }, [active]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      document.body.classList.remove(BODY_FLASH_CLASS);
    },
    []
  );

  return { active, flash };
}
