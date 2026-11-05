# VecBuilt logo

VecBuilt was previously called AsBuilt Vectorizer. The display name changed;
the repository and Pages URLs still use the old `asbuilt-vectorizer` slug.

## The mark

A bold V drawn as a vector path with anchor-point nodes. Three small raster
pixels in the top-left corner dissolve into the clean path: a scanned as-built
becoming usable vector linework. The mark is hand-built flat vector, not an
AI render, so it scales cleanly from favicon to header.

## Files

All logo files live in `assets/` at the repository root:

- `assets/logo-mark.svg` — the mark alone. Also wired as the favicon on every
  page (see below).
- `assets/vecbuilt-lockup-dark.svg` — mark plus wordmark for dark backgrounds
  (app header, dark pages).
- `assets/vecbuilt-lockup-light.svg` — mark plus wordmark for light backgrounds
  (documents, light pages).

PNG exports are not stored in the repo. The SVG scales to any size; generate a
PNG from it when a raster file is required (favicon sizes used before: 32,
180, 192 px).

## Colors

- Navy tile: `#0B101E`
- Cyan path and Built: `#38BDF8`
- White anchor nodes: `#FFFFFF`
- Raster pixels: `#64748B` and `#475569`
- Light-background wordmark: Vec in `#0B101E`, Built in `#0284C7` (a darker
  cyan, readable on white)

## Wordmark

Bold, tight letter-spacing, font stack `Inter, 'Segoe UI', 'Liberation Sans',
Helvetica, Arial, sans-serif`. Two tones: `Vec` in white (dark backgrounds)
or navy (light backgrounds), `Built` in cyan. Do not recolor the V path, do
not stretch the mark, and do not place the dark lockup on a light background
(or the reverse).

## Where it is wired

- Browser tab favicon (SVG) on all four entry points: `/` (`index.html`),
  `/studio-preview/`, `/classic/`, and `/help/`.
- Header brand mark beside the VecBuilt title on Studio, Studio preview, and
  Classic. The old `AV` text badge is gone.
- Help Center header wordmark.

Note: the Studio stylesheet previously hid the old `.logo` text badge. The
new mark uses the `.logo-img` class, so it shows in the Studio headers by
design. If the Studio header should ever go text-only again, hide
`.logo-img` the same way.
