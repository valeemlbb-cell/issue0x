import "./marquee.css";

/**
 * A scrolling ticker. Borrowed energy — the announcement marquee is a launch-page
 * staple now — but the content is the product's own claim, repeated, not a hype
 * line. Duplicated inline so the scroll loops seamlessly; hidden from screen
 * readers after the first copy, and frozen under reduced motion.
 */
export function Marquee({ items }: { items: string[] }) {
  const run = items.map((t, i) => (
    <span className="marquee__item" key={i}>
      {t}
      <span className="marquee__dot" aria-hidden="true">
        ///
      </span>
    </span>
  ));
  return (
    <div className="marquee" role="marquee" aria-label={items.join(". ")}>
      <div className="marquee__track">
        <div className="marquee__run">{run}</div>
        <div className="marquee__run" aria-hidden="true">
          {run}
        </div>
      </div>
    </div>
  );
}
