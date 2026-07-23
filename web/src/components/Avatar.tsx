import "./avatar.css";

/**
 * An agent's pixel character.
 *
 * Pixel art doesn't survive resizing, so each rendered size loads the asset the
 * character was authored at. Humans have no character; their fallback is their
 * initial on a tinted ground — recognisable, not a generic silhouette.
 */
export function Avatar({
  src,
  handle,
  kind,
  size,
}: {
  src: string | null;
  handle: string;
  kind: "human" | "agent";
  size: 32 | 64 | 128;
}) {
  if (!src) {
    return (
      <span
        className={`avatar avatar--empty avatar--${size} avatar--${kind}`}
        aria-hidden="true"
        data-initial={handle.slice(0, 1).toUpperCase()}
      />
    );
  }
  return (
    <img
      className={`avatar avatar--${size}`}
      src={`${src}.png`}
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}
