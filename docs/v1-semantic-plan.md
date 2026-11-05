# VecBuilt: Version 1 sketch: from raster tracer to semantic drawing set

## Where v0.7 stands (grounded in the repo, not assumed)

The app at `acostavictor/asbuilt-vectorizer` (v0.6.0, `main`) already does the hard
geometry work, client-side, with no upload endpoint:

- PDF/image import, tiled raster processing (1024px tiles, 96–240 DPI), ROI selection
- Raster centerline tracing to LINE/LWPOLYLINE, CIRCLE fitting, hatch recognition
  and manual hatch repair, dashed/hidden reconstruction, straightening, gap repair
- Local Tesseract OCR to DXF TEXT entities
- Calibration from a known measurement; v0.7 dimension QA detects linear numeric annotations, proposes endpoint pairs with witness lines, compares measured/printed values, and supports manual review and CSV reports
- Layered DXF export (single DXF or QA ZIP with manifest)
- `src/app.js` engine shared by the production UI and `studio-preview/`

The README states the current limit plainly: **it remains a raster tracer, not
semantic CAD reconstruction.** Version 1 closes exactly that gap. It does not
replace the tracer. It adds meaning on top of it.

## Version 1 goal

Same DXF out, but entities carry meaning: walls are walls, doors are doors,
dimensions are tied to what they measure, and layers follow element type
instead of line appearance. A drafter opening the DXF should be able to work
with it as a drawing set, not just look at it.

## Scope, in build order

### 1. Semantic label pass (new module, e.g. `src/semantics.js`)

Runs after tracing, before DXF write. Labels every traced entity as one of:
WALL, DOOR, WINDOW, DIMENSION, TEXT, SYMBOL, TITLEBLOCK, UNKNOWN.

- **Default pass is rule-based on geometry, browser-only.** No model, no API call,
  deterministic results. Examples: close parallel line pairs become WALL
  candidates; an arc plus a short line at a wall opening becomes a DOOR swing
  candidate; long thin lines with arrowheads/ticks plus nearby OCR numbers
  become DIMENSION candidates.
- **AI vision labeling is a second, opt-in pass.** A vision model looks at
  tile crops and confirms or corrects labels. It never draws geometry and never
  runs by default, so the browser-only promise stays intact unless the user
  explicitly turns it on.
- Every label carries a confidence flag. Low-confidence entities stay labeled
  UNKNOWN rather than guessed wrong.

### 2. Layer mapping (extends `src/dxf.js` layer handling)

Labels map to layers through a user-editable table in the UI, because layer
standards vary by firm. Suggested defaults: A-WALL, A-DOOR, A-WINDOW, A-DIM,
A-TEXT, A-SYMB. UNKNOWN keeps the current appearance-based layer so nothing
regresses. The mapping table itself is saved in the QA manifest.

### 3. Full semantic dimension association (builds on v0.7)

v0.7 already provides conservative two-witness-line association, editable OCR
readings, manual endpoint measurement and mismatch/CSV QA. V1 must improve
automatic endpoint attachment for interrupted lines, rotated dimensions and
extension lines, and ideally distinguish legitimate view-specific dimensions
from general numeric annotation. Continue to preserve uncertainty.

Tie each OCR dimension string to the entity pair it measures:

- Match dimension text to the nearest dimension line, then to the two extension
  lines, then to the measured entities.
- Compare the printed value against the calibrated measurement. Flag mismatches
  in the review UI and in the QA manifest. For as-builts, printed-vs-measured
  disagreement is the finding, not noise.
- Unmatched dimension text and unmeasured dimension lines are listed, not
  silently dropped.

### 4. Symbol recognition, narrow scope

Doors and windows first, from primitives the tracer already produces
(circles, arcs, line pairs). Fixtures and electrical symbols come later.
Template matching plus the label pass, with user confirmation in review.
No separate symbol model in v1.

### 5. Semantic review UI (extends Review & scale)

The existing Review & scale step already handles calibration and ROI. Add a
label-correction mode to it: click an entity, see its label and confidence,
change the label, and the layer updates. This is the human sign-off, same
philosophy as Markup & Validate. Nothing semantic ships without a review path.

### 6. QA manifest extension

The QA ZIP already records DPI, tiles, ROI, watermark detection, calibration
status, and dimension review results. Add: semantic coverage (percent of entities labeled),
dimension match rate, mismatch list, and unlabeled entity count. A set with
90 percent labeled and zero dimension mismatches reads very differently from
one with 40 percent labeled, and the manifest should say so.

### 7. Tests

`package.json` already wires `node --test tests/*.test.js`. Add fixtures:
small synthetic sheets with known walls, doors, and dimensions, rendered as
raster, with expected labels and DXF layer output asserted. Rule-based
labeling is testable in a way model output is not, so test it hard.

## Explicitly out of v1 scope

- DWG export. DXF remains the output format.
- Replacing the tracer with a learned vectorizer. The tracer stays; semantics
  sit on top of it.
- Automatic title-block attribute parsing. Title blocks stay excluded by ROI
  unless the user includes them.
- Server-side AI as the default path. Browser-only remains the default.
- Full symbol library. Doors and windows only.

## Repository and branch plan

**Use the existing repository.** Version 1 builds directly on `src/app.js`,
`src/dxf.js`, `src/geometry.js`, `src/circles.js`, `src/hatch.js`, and
`src/viewport.js`. A separate repo would duplicate all of that, split the
Pages deployment, and fork the test and docs setup for no benefit.

- Work on a branch, e.g. `v1-semantic`, off `main`. The live app keeps
  working while v1 is built.
- UI experiments follow the existing `studio-preview/` pattern: a second
  interface in-repo sharing the same engine, tested before it replaces
  anything.
- The sketch itself can live at `docs/v1-semantic-plan.md` on that branch.
- Merge to `main` only after the validation checklist passes on real as-built
  scans in a browser, per the README's own warning for the Studio preview.

## Validation (extends `docs/VALIDATION.md`)

- Three real as-built scans, not synthetic sheets only: one clean, one faded,
  one dense with annotations.
- Per sheet: label accuracy spot-checked by a human, dimension match rate,
  and a Civil 3D open-and-inspect pass of the exported DXF.
- Performance note: the 50-sheet batch warning from v0.6 still applies.
  Measure the label pass separately so it never silently doubles batch time.

## Honest limits to keep in the README

- Semantic labeling will be wrong on messy scans. UNKNOWN plus review exists
  for that reason.
- Dimension association is ambiguous when extension lines are broken or shared.
  Mismatches are flagged, not auto-corrected.
- This is still a drafting aid. The exported DXF needs the same manual quality
  control and scale calibration the README already requires before engineering
  use.

## Future, not v1

- Training a custom labeling model from the user's own CAD files rendered to
  raster (free labeled pairs: raster plus the exact vectors behind it).
- Fixture and electrical symbol libraries.
- Markup & Validate as a QA gate on exported DXF files: run the drawing set
  through its rules before delivery.
