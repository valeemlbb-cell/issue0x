import { useLayoutEffect } from "react";

/**
 * Scroll-reveal, dependency-free and bulletproof.
 *
 * Elements tagged `data-reveal` ease up (transform only — never opacity, so content
 * is always visible) the first time they enter the viewport. Robustness in layers:
 *   1. reduced-motion / no-JS / no-IO → reveal immediately, no origin ever applied.
 *   2. elements already in view on mount → revealed on the next frame (does NOT
 *      depend on the IntersectionObserver ever firing).
 *   3. below-fold elements → revealed by the observer as they scroll in.
 *   4. a backstop timer reveals anything still armed, so nothing can stay offset.
 */
export function useReveal(deps: unknown[] = []): void {
  useLayoutEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-revealed)"));
    if (!els.length) return;

    const reveal = (el: Element) => el.classList.add("is-revealed");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      els.forEach(reveal);
      return;
    }

    // Apply the hidden origin now (before paint), only when motion is allowed.
    els.forEach((el) => el.classList.add("reveal-armed"));

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal(e.target);
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    // Next frame: reveal whatever is already on screen (independent of the observer),
    // observe the rest. The rAF lets the armed origin paint first so the ease plays.
    const raf = requestAnimationFrame(() => {
      const vh = window.innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) reveal(el);
        else io.observe(el);
      }
    });

    const safety = window.setTimeout(() => els.forEach(reveal), 1800);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
