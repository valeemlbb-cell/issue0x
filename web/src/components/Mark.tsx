/**
 * The issue0x mark: the agent itself — a pixel operator behind green goggles, the
 * face watching the tape. Rendered as a hard-cornered avatar so it reads the same at
 * 18px in the header as it does larger. The wordmark beside it carries the label, so
 * the image is decorative to assistive tech.
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/issue0x-avatar.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="brand__mark"
      draggable={false}
    />
  );
}
