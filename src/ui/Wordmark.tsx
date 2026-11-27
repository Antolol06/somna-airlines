import { Fragment, type CSSProperties } from 'react';

/**
 * The SŌMNA wordmark.
 *
 * The “Ō” is drawn, not typed: web fonts served as split subsets (Latin / Latin Extended)
 * can't reliably compose the macron over the O, which left it floating beside the letter.
 * Here the O is a plain Latin glyph and the macron is a precise bar, optically centred
 * over it — identical in every browser, at every size and letter-spacing.
 */
export function Wordmark({ className = '', style, title = 'SŌMNA' }: { className?: string; style?: CSSProperties; title?: string }) {
  return (
    <span className={`wm ${className}`} style={style} role="img" aria-label={title}>
      <span aria-hidden="true">S</span>
      <span className="wm-o" aria-hidden="true">
        O
      </span>
      <span aria-hidden="true">M</span>
      <span aria-hidden="true">N</span>
      <span aria-hidden="true">A</span>
    </span>
  );
}

/** Inline brand name for running text (inherits the surrounding type). */
export function Brand() {
  return (
    <span className="brand" role="text" aria-label="SŌMNA">
      <span aria-hidden="true">
        S<span className="brand-o">O</span>MNA
      </span>
    </span>
  );
}

/** Renders a string, replacing every “SŌMNA” with the drawn brand name. */
export function BrandText({ text }: { text: string }) {
  const parts = text.split('SŌMNA');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <Brand />}
        </Fragment>
      ))}
    </>
  );
}
