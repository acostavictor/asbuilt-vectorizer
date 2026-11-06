# VecBuilt

## Logo

VecBuilt's mark is a vector path V with anchor-point nodes, with raster pixels dissolving into it: a scanned as-built becoming usable vector linework. Colors: navy `#0B101E`, cyan `#38BDF8`, white nodes.

- Mark: [`assets/logo-mark.svg`](assets/logo-mark.svg) (also wired as the favicon on every page)
- Dark lockup: [`assets/vecbuilt-lockup-dark.svg`](assets/vecbuilt-lockup-dark.svg)
- Light lockup: [`assets/vecbuilt-lockup-light.svg`](assets/vecbuilt-lockup-light.svg)

Full usage notes live in [`docs/LOGO.md`](docs/LOGO.md). The repository and Pages URLs still use the old `asbuilt-vectorizer` slug; only the display name changed.

## v0.8: Intelligent CAD Cleanup & Repair

VecBuilt now offers a **Repair** ribbon tab in Studio, Studio preview and Classic. It analyzes the existing reconstructed LINE geometry *after* conversion. It does not change the original PDF, circles, hatches, text, dashed/hidden linetype entities, or multi-vertex curves.

### Repair workflow

1. Convert a sheet as usual, then choose **Repair → Scan geometry**. The default maximum endpoint gap is 3 **source pixels**, adjustable between 0.2 and 25 pixels. Repair operates at the actual selected conversion DPI, not zoomed-preview pixels.
2. Review the findings in the **Geometry repair** drawer. Clicking a finding centers it in the viewport: amber depicts the existing geometry and cyan depicts the proposed result. Findings are categorized as **duplicate segments**, **collinear line gaps**, or **potential corner/intersection trim/extend**.
3. Choose **Apply selected** for a reviewed proposal or **Dismiss suggestion** for an intentional gap. **Apply low-risk** only accepts near-identical duplicates and very short, highly aligned, unbranched joins. Intersection corrections are **always manual-review only**.
4. **Undo/Redo** restores/reapplies geometry snapshots per sheet (up to 20 undo operations). Applying a new repair after Undo discards the redo branch, as expected.
5. Confirm the **Vectors only** preview and export DXF as usual. Accepted edits are actual LINE/LWPOLYLINE replacements, not just preview highlights. The batch ZIP includes \`repair-QA/<sheet>-repairs.json\` and the \`QA-manifest.json\` has repair counts and an audit log.

**Safety:** Cleanup proposals are deterministic and verify their original source endpoints before applying. No source geometry is mutated in place. Curved polylines, CIRCLE, HATCH and pattern-aware dashed/hidden entities are not modified by this pass. Changes to the source drawing, re-conversion or hatch reconstruction invalidate prior repair proposals, so the app prevents manual hatch modifications that would silently discard approved CAD repairs. Perform hatch corrections first, then CAD Repair. Rechecking dimension annotations after geometry repair is required; confirmations are invalidated and endpoint associations refreshed.

**Known limitations:** This is a conservative line connectivity repair pass, not complete topological CAD modeling. It does not automatically fix arbitrary overlaps, break long lines at every interior intersection, reconstruct missing walls or doors, or repair multi-point curves. Proposals cap at 350 (examines up to 75,000 two-point segments); dense sheets may contain additional issues. "Low-risk" is not "guaranteed correct"; reviewing the original scan and checking exported DXF connectivity/coordinates in AutoCAD or Civil 3D remains mandatory. Repair detection may temporarily occupy the browser's main thread for large drawings.

## v0.7: Printed dimension recognition and QA validation

**Dimensions** is now a separate ribbon tab in the default Studio, the Studio preview, and Classic. It works entirely in the browser and does not depend on a vision API or upload project data.

**Workflow:** Convert the PDF/image (enable optional OCR for scanned text), calibrate with a trusted known dimension and choose the correct units, open Dimensions → Find dimensions, review the proposed matches, and export a dimension QA CSV or batch ZIP.

- **Text recognition:** parses common linear annotations: decimal feet/inches/meters/millimeters/centimeters, apostrophe/double-quote imperial notation, and fractional inches (e.g., \`12'-6 1/2"\`). Rejects clearly non-linear scale, station, elevation, radius, percentage and degree strings. Numeric-only notes are candidates, not proof of dimension intent.
- **Conservative association:** proposes endpoints only when a numeric note is close to a reconstructed line that has two approximately perpendicular witness/extension lines. If the source geometry is broken, it keeps the label **unmatched**, not guessed. The annotation remains an ordinary DXF TEXT entity; native associative DXF DIMENSION objects are **not** created in this version.
- **Review:** click a note to center its location on the PDF; edit a misread OCR label, manually add a missed note, pick two endpoints at any zoom level, ignore non-dimension notes, and confirm review. Confirmation never changes or conceals a reported mismatch.
- **Comparison:** after calibration, measure the endpoint distance in the sheet's drawing units. Convert explicitly stated label units when necessary. Statuses include within tolerance, mismatch, unmatched, uncalibrated, missing units, unreadable and ignored.
- **Tolerance:** configurable percentage (default 1%) and absolute drawing-unit minimum (default 0.05). The allowed difference is the **larger** of those. These are review defaults only, not an AEC discipline-specific contractual tolerance.
- **Overlay:** potential dimension notes have color-coded markers; select one to see the exact inferred or manually picked measurement endpoints.
- **QA export:** per-sheet CSV includes printed, expected and measured values, signed delta, tolerance, review state, source and point coordinates. A batch ZIP additionally contains \`dimension-QA/<sheet>-dimensions.csv\` and \`QA-manifest.json\` dimension counts, comparison details and tolerance settings. All findings require independent CAD review.

**Important:** Printed vs measured agreement is only a preliminary check. The calibration reference itself cannot independently validate that same dimension. OCR misreads, raster distortion, interrupted witness lines, angled measurement conventions, scaled viewports, or duplicate labels can create false matches/mismatches. Do not interpret \`Reviewed\` as engineering approval. Source drawings and DXFs remain page-relative and must be checked in AutoCAD/Civil 3D before design or construction use.

## Default interface and Help Center

**Studio is now the default application** at **[VecBuilt](https://acostavictor.github.io/asbuilt-vectorizer/)**. The earlier ribbon layout is preserved at **[Classic interface](https://acostavictor.github.io/asbuilt-vectorizer/classic/)**.

A full **[Help Center](https://acostavictor.github.io/asbuilt-vectorizer/help/)** covers importing files, scan settings, zoom/pan, scale calibration, circles, HATCH and dashed-line reconstruction, dimension QA, manual hatch editing, CAD layers, DXF/ZIP export, troubleshooting, privacy, and engineering QA. A Help link is visible in both application headers. The historical [Studio preview URL](https://acostavictor.github.io/asbuilt-vectorizer/studio-preview/) remains available for existing links.

The redesign follows the published [StageShow](https://github.com/benjitaylor/skills/tree/main/stageshow) UI craft principles: one focal workspace, quieter chrome, more deliberate hierarchy, and progressive disclosure of advanced controls. StageShow itself is primarily for *product UI illustrations*, not a production PDF conversion runtime. The Studio uses ordinary HTML/CSS and the existing \`src/app.js\` processing engine, with no StageShow package dependency.

**What changed:**
- Cleaner, slimmer navigation and a compact command row
- Larger dark drawing workspace with unobtrusive floating navigation controls
- **Convert** exposes image quality, geometry and OCR by default; linetype and hatch tuning live under **Advanced conversion**
- **Review & scale** focuses on calibration and drawing-area selection; the detailed manual hatch repair tools live under **Hatch editor**
- Quick DXF download in the header once the selected sheet has converted
- One-click empty-state import, quieter drawing properties and sheet queue
- Mobile-aware arrangement, with the original canvas zoom/pan, PDF import, raster recognition, calibration, layer management and DXF export preserved

**The Studio is now the default UI.** It is still a pre-release converter and must be tested on actual as-built scans in a browser. Feature improvements in \`src/app.js\` are shared by both interfaces. Do not upload confidential project PDFs to the repository.


Browser-based, **client-side** PDF/image-to-layered-DXF proof of concept for engineering drawings. The selected drawings are processed in the user's browser, with no application upload endpoint.

> **Status: pre-release proof of concept.** Raster centerline tracing and OCR are experimental. DXF drawings require manual quality control and scale calibration before engineering use. Native DWG export is **not** included.

## Purpose

- Import one or more PDF files (including multipage files), PNG, or JPG.
- Convert scanned raster linework into editable LINE/LWPOLYLINE DXF entities using local image processing.
- Recognize horizontal printed annotations with optional OCR and write CAD TEXT entities.
- Choose geometry and text layers, calibrate the drawing scale, and preview the detected linework.
- Export an individual DXF, or a ZIP of DXFs and a QA manifest.

## v0.2: Tiled processing upgrade (November 2026)

The browser conversion pipeline now processes **overlapping 1024px raster tiles**, with user-selectable PDF raster resolution (96, 150, 200 or 240 DPI). The lower-resolution full-sheet rendering is used only for the interactive preview.

- **Drawing area (ROI):** pick two corners in the preview to limit tracing to the intended engineering drawing area. Changing ROI invalidates any previous conversion.
- **PDF-XChange trial watermark:** detect distinctive trial text layers and linked overlay zones; where recognized, omit watermark text from CAD and paint detected link zones white in tile processing. This is not a general-purpose PDF watermark removal tool.
- **Scan cleanup:** choose global threshold or an adaptive local threshold for faded and unevenly exposed scans. Optional connected-component speckle cleanup is off by default so small engineering symbols are not silently removed.
- **OCR:** optionally run Tesseract locally on each tile, deduplicate overlap detections, and export editable DXF TEXT entities. Human correction remains necessary.
- **Tile seams:** clip output paths to nonoverlapping tile cores so adjacent processing areas do not duplicate geometry.
- **Improved preview:** rescale high-resolution path coordinates when drawing them over the low-resolution page preview.
- **QA ZIP:** record DPI, tile count, optional region selection, watermark detection, calibration status and warnings.

**Known constraints:** It remains a raster tracer, not semantic CAD reconstruction. OCR quality and tile-endpoint connectivity are not guaranteed. Lines touching a tile boundary can require joining in AutoCAD. Source files remain local and are never committed to GitHub. A complete 50-sheet batch at high DPI may be slow on consumer laptops. See [validation checklist](docs/VALIDATION.md).

### Recommended workflow for engineering sheets

1. Open the deployed app on desktop Chrome or Edge.
2. Import one PDF sheet and choose **150 DPI** first; switch to 200 or 240 DPI for thin linework only after measuring performance.
3. Try **Adaptive (faded scans)** if thin lines disappear. Use small speckle cleanup only if isolated scan noise is problematic.
4. Use **Select drawing area** to exclude unnecessary title blocks and borders when they are not needed.
5. Leave **Filter PDF-XChange watermark regions** enabled for PDFs with those overlays.
6. Enable OCR if editable printed annotations are needed. Expect much longer processing time.
7. Convert one sheet, review original/overlay/vectors, then calibrate with a known measurement.
8. Confirm a **second independent dimension**. Set geometry and annotation layers, export DXF, and inspect it in AutoCAD/Civil 3D.

## v0.6: Native circles and operator hatch repair

### Geometry pipeline

Raster tracing → **CIRCLE fitting** (including sufficiently complete matching arc fragments) → best-fit straightening → small closed-boundary gap repair → manually specified hatch boundaries → automatic hatch recognition → dashed/hidden reconstruction → DXF.

- **Convert → Recognize circles as CAD CIRCLE:** enabled by default. Uses a least-squares center/radius fit, maximum radial error, monotonic turning, and angular coverage checks. A sufficiently complete closed circle or a group of strongly matching arcs becomes one editable \`CIRCLE\` entity. If confidence is insufficient, the original polyline geometry is retained. It does not force ellipses, open arcs or small letter-like loops into circles.
- **Convert → Close tiny boundary gaps:** enabled by default. Closes only short nearly complete contour gaps with a significant enclosed area, before HATCH detection. It cannot reconstruct a missing wall or infer an untraceable shape.
- **Automatic hatches:** can now detect two distinct regular hatch families when a crosshatch has an existing trustworthy closed boundary. Hatches still need verification; dense intersections often interrupt raster stroke extraction.

### Repair a broken hatch boundary manually

1. **Convert** the drawing first, and open **Review & scale**.
2. Choose **Pattern:** \`Use source pattern\`, \`Diagonal lines\`, \`Crosshatch\`, or \`Solid fill\`. For a manual pattern, enter an angle and spacing in **processed pixel units**.
3. Click **Draw hatch boundary** and click at least three polygon corners on the drawing. You can pan with **Space + drag** and zoom with the mouse wheel while selecting.
4. Click **Finish hatch**, or press Enter. The app validates the polygon and adds a native DXF \`HATCH\`. If **Use source pattern** cannot confidently recognize a repeated pattern inside your polygon, it will not invent one; explicitly select a manual pattern instead.
5. Check **Replace matched source strokes** only when you want aligned, straight original hatch strokes inside your selected boundary deleted from the DXF linework. This is off by default to avoid accidentally deleting structure, notes or dimensions. With it off, original source lines may remain behind the new HATCH, so review duplication.
6. Use **Undo hatch** to remove your most recent manual hatch without reconverting the source PDF. **Esc** cancels boundary picking.

The inspector reports the number of recovered circles, repaired contours, HATCH objects and replaced hatch strokes. All PDF data stays in the client's browser. Batch ZIP manifests include circle fit and manual hatch statistics.

**Limitations:** These are geometry-based heuristics, not AI semantic recognition. CIRCLE fitting will not reliably recover circles hidden behind heavy overlapping linework or lettering; it cannot infer the radius of an incomplete arc. Raster sampling can still cause curvature error. Complex industrial material hatches, multi-island hatch loops, curved hatch boundaries and automatic engineering material identification remain future work. The native HATCH records are nonassociative. The manual tools are not equivalent to editing a DWG in AutoCAD; always inspect the resulting DXF in Civil 3D/AutoCAD before engineering use.

## v0.5: True HATCH export and geometric straightening

**New conversion order:** tiled raster tracing → conservative best-fit line straightening → enclosed hatch recognition → dashed/hidden linetype recognition → layered DXF export.

### Lines straightened, curves preserved

- The **Convert** tab now enables **Keep straight lines straight** by default. It fits a principal-component regression line to the points in each nontrivial traced path, replacing near-collinear pixel wobble with two clean endpoints when maximum deviation and backtracking tests pass.
- **Snap nearly horizontal / vertical** is an optional, disabled-by-default setting. It only snaps within 1.25° of an axis. It does not force arbitrary engineering diagonals to 0° or 90°.
- True curves, corners, stepped features and paths outside the tolerance are retained as polylines rather than silently straightened. Existing two-point line entities remain untouched.

### Hatches become native DXF HATCH entities

- **Recognize enclosed hatches** is enabled by default. For v0.5, the recognizer requires an existing *closed boundary loop* containing a regular, repeated **single-angle diagonal hatch family**.
- A candidate must have at least seven matching strokes, consistent angle/spacing, substantial coverage of the boundary, and endpoints close to the detected border. It does not guess a boundary when none exists.
- Accepted strokes are removed from the residual LINE/LWPOLYLINE list and replaced by **one native DXF HATCH**. The pattern angle and spacing come from the source scan, transformed to calibrated drawing units, and the hatch is placed on a separate user-editable **HATCH-REVIEW** layer.
- The **Vectors only** and **Overlay** views render the reconstructed hatch with an outlined boundary. The properties inspector counts the straightened segments, reconstructed hatches and hatch strokes replaced.
- Batch ZIP QA manifests include hatch recognition statistics and straightening diagnostics.

**Known limitations and QA:** This is a conservative proof of concept, not full material recognition. It does **not** yet detect every closed boundary on heavily scanned or interconnected linework, reconstruct missing boundaries, recognize ANSI/material patterns or crosshatches, reconstruct curves as arcs, or provide associative CAD hatches. The generated HATCH is non-associative (the boundary is embedded in the entity). Where confidence is insufficient, the original raster-derived linework is retained rather than replaced with an invented hatch. Review every detected hatch boundary, pattern and dimension in AutoCAD or Civil 3D before relying on it.

## v0.4: Compact ribbon and native DXF linetype recognition

The ribbon now uses compact 31–34px buttons, smaller tab labels, shorter groups, and less explanatory text. Drawing controls remain organized into **Home, Convert, Review & scale, Layers, Export**. The center viewport remains full-height for pan/zoom/point calibration.

### Experimental dashed and hidden line workflow

- **Convert → Detect dashed lines** (enabled by default) reduces the minimum raster stroke length to 8px during tracing, allowing many short broken strokes to survive the raster pass.
- The local linetype classifier searches for at least five short, nearly collinear, regularly spaced strokes (four in the sensitive mode). It checks angle, perpendicular offset, spacing and dash-length consistency.
- Recognized dash trains become **one reconstructed LINE entity** instead of a collection of independent short segments. The DXF now defines true \`DASHED\` and \`HIDDEN\` linetypes in its \`LTYPE\` table, using approximate dash/gap measurements converted into calibrated model-space units, and assigns linetypes using entity group code 6.
- The **Overlay** and **Vectors only** previews draw the inferred linetype periods with distinctive colors rather than solid lines. **Drawing properties** reports inferred style counts.
- In the **Layers** ribbon, choose *Auto (review)*, *All DASHED*, or *All HIDDEN* to override the classification for detected groups on the selected sheet. This updates the preview and DXF output without rerunning the entire raster conversion.
- Batch ZIP \`QA-manifest.json\` now includes linetype counts, observed source-pixel patterns and stroke-reconstruction diagnostics.

**Critical distinction:** Raster dashes can indicate hidden edges, utilities, overhead items, pavement marks, demolition, centerlines or graphic conventions. Their engineering *meaning* cannot be determined reliably from gaps alone. The classifier uses short-dash length as a provisional HIDDEN convention and longer strokes as DASHED. This is a **reviewable heuristic**, not semantic understanding, and it can miss, incorrectly classify or join geometry. The user must compare the result with the source sheet and make project-appropriate corrections in CAD. Dash-dot centerlines, complex break patterns, per-object manual type selection, and authoritative layer semantics are not part of v0.4.

## v0.3: Ribbon workspace and precise visual calibration

The original crowded settings column has been replaced with a ribbon organized around real drawing tasks:

- **Home:** import up to 50 sheets, convert selected/all, fit the drawing
- **Convert:** DPI, threshold, smoothing, speckle filtering, OCR, watermark handling
- **Review & scale:** two-point calibration with known distance and drawing-area selection
- **Layers:** discipline presets and editable line/text layer names
- **Export:** DXF per sheet or batch ZIP with QA manifest

The canvas now takes most of the screen. A collapsible properties inspector and a compact sheet strip leave space for actual drawing inspection. Use **Original**, **Overlay**, or **Vectors only** views. Vector-only mode renders the same reconstructed polyline and text data that the DXF exporter uses, including OCR/embedded text when recognized. A visual preview is not engineering verification.

### Drawing navigation and calibration

| Gesture | Effect |
| --- | --- |
| Mouse wheel | Zoom toward the cursor |
| Left drag in Pan mode | Pan drawing |
| Space + drag | Temporary pan while picking calibration or crop points |
| F | Fit entire sheet |
| 1 | 100% preview pixels |
| + / - | Zoom in / out |
| P | Switch to Pan mode |
| Esc | Cancel current point selection |
| Review & scale → Pick two points | Select calibrated endpoints, even if you pan/zoom between clicks |

**Calibration:** enter a known distance and choose units, then zoom in and pick two endpoints. The app computes a drawing-unit-per-source-pixel scale and automatically adjusts the scale when high-DPI processing changes from the low-resolution preview. Confirm another known distance in your CAD system before use.

**Known limitations:** native DWG export, AI discipline classification, semantic engineering object reconstruction, surveyed coordinates, and subpixel snapping are not implemented. The prototype cannot guarantee that all lines and OCR are accurate, nor that paths split across tile boundaries are connected. For high-value project drawings, use the QA checklist and independent review.

## How it works

```text
User file picker → PDF.js tiled raster rendering → local raster tracing worker
          ↘ optional local Tesseract OCR → preview + layer/scale QC
                 → locally generated DXF / ZIP download
```

**Privacy model:** No server-side processing, account, analytics, or file-upload API in the repository. The browser downloads program libraries and (when OCR is used) OCR model files from their providers. Client drawings are not transmitted by this code. An independent audit is recommended before claiming enterprise-grade privacy. Do not add third-party telemetry or remote image processing without revising that guarantee.

## Run locally

Use a local web server because ES modules and web workers do not work reliably from `file://`:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

No npm install or backend is required. First use requires an internet connection for the pinned PDF.js, JSZip, and optional Tesseract.js assets served from CDNs.

## Hosting

The repository is a static website. Publish to GitHub Pages (Settings → Pages → Deploy from a branch → main / root), or copy `index.html` and the `src/` directory to HostGator public_html. HTTPS is recommended. GitHub Pages deployment does **not** turn on automatically merely because the files exist.

## Limitations

- Raster tracing is approximate and can trace letter outlines or noise; OCR may be incomplete or inaccurate.
- It does not interpret discipline semantics, Civil 3D objects, dimensions, real-world coordinates, or engineering tolerances.
- Native PDF vector extraction, curved raster arc detection, automatic layer inference, DWG export, rotated text, and survey control are planned features, **not** present in the initial proof of concept.
- Each sheet requires independent calibration to establish useful engineering model units. Uncalibrated output uses one drawing unit per processed pixel at the selected DPI.
- Processing 50 large sheets can consume substantial CPU time; sheets and raster tiles process sequentially to control memory.
- Public GitHub repositories expose application source code.

## Testing

```bash
npm test
```

Run the included synthetic geometry/DXF tests and validate representative exported files in AutoCAD or Civil 3D.

## Licensing

Project code: Copyright (c) 2026, repository owner. **All rights reserved pending selection of a license.** No rights to reuse or redistribute this repository are granted by default. Third-party libraries retain their own licenses.

## Line patterns and annotation cleanup

Conversion recognizes repeated DASHED, HIDDEN, CENTER (long-short), PHANTOM
(long-short-short), and DASHDOT (long-dot) strokes. At least two repeating mixed
cycles are required. Names describe observed raster patterns, not engineering
intent. Low resolution, touching strokes and erased dots can prevent recognition.
Review detected styles and use the sheet-wide override when necessary. DXF exports
use native calibrated linetype patterns; DASHDOT uses zero-length DXF dot elements.

In Convert, choose annotation options and reconvert:
- **Export recognized text (OCR):** mask detected raster lettering and export TEXT.
- **Remove detected text (no text export):** run OCR to locate text, mask its pixels,
  and omit both native and OCR text entities. Detection text remains available
  internally for dimension QA. Missed lettering can still trace as geometry.
- **Find dimensions during conversion:** enabled by default. Runs local OCR even
  when text export is off, so scanned numeric labels can reach Dimension review.
- **Remove matched dimensions & labels:** omit matched baselines, their two witness
  lines and matched labels. Both continuous and label-interrupted baselines are
  supported. Unmatched notes, ambiguous geometry and detached arrowheads may remain.

These options preserve the original imported file. Dimension detection is still
provisional: it does not reconstruct Civil 3D DIMENSION objects. Review the vector
preview and Dimension drawer, especially shared model/witness lines. First OCR use
requires language-model assets; recognition runs locally. Full scans and browser
OCR quality have not been validated against every drafting standard.

### Rotated and chained dimensions

Dimension detection now also reads clockwise/counterclockwise rotated images,
accepts trailing TYP/TYPICAL or a standalone approximation mark (±), and associates
labels with endpoint extension lines, chain spans and simple bent leaders. Explicit
numeric tolerances are not silently discarded. Dimension OCR compares original and rule-suppressed images at multiple orientations,
which increases conversion time. Inferred missing foot marks and low-confidence
readings remain provisional and cannot trigger automatic dimension removal.

Chain spans and leader associations are provisional QA findings. Shared baselines
and leader-linked geometry are retained by automatic annotation removal to avoid
erasing connected model geometry. Review endpoints in the Dimensions drawer.

Centerline recognition joins small collinear junction fragments, searches adjacent
angle/intercept buckets, and accepts two visible long/short cycles with wider gaps.
Crossing perpendicular lines remain separate. Cropped, obscured or insufficiently
repeated patterns can still remain as ordinary linework.

## Uniform Simplex annotation style

Exported native/OCR text and recognized dimension labels use SIMPLEX
(`simplex.shx`) and a uniform 0.10-inch height instead of the scanned font size.
The DXF also includes a SIMPLEX dimension style with matching DIMTXT/DIMTXSTY,
and selects it as the default for future CAD dimensions. Detected raster dimension
linework remains linework; it is not converted into native DIMENSION entities.

In Layers, set Text height (inches) and Plot scale 1:n. Choosing 1:1 produces an
actual model-space height of 0.10 inches (0.0083333333 feet or 2.54 mm). For a
0.10-inch printed height at 1 inch = 20 feet, use 1:240, yielding a 2-foot model
text height. Set drawing units and calibrate geometry before export; unitless
exports treat one drawing unit as one inch for this annotation conversion.

These settings apply immediately to the active sheet's next single/ZIP export;
reconversion is unnecessary for already recognized text. Text-removal options
continue to omit text. Unrecognized lettering that remains raster linework cannot
receive a CAD text font. The browser uses an approximate font; Civil 3D renders
`simplex.shx`. The SHX font is referenced, not bundled. These are model-space text
heights, not annotative text objects.

### Per-sheet scale question on import

After importing a PDF or image, answer the plot-scale question for each new sheet.
Each answer independently stores its plot ratio, CAD units, and 0.10-inch printed
text height. Common architectural/civil/metric ratios and a custom 1:n value are
available. Plot scale does not calibrate raster geometry. Set later leaves that
sheet unconfigured and blocks its DXF export (or the whole batch containing it)
until a scale is entered. Use Layers → Set sheet scale to reopen the question.

## Small-curve detail and smoothing

Convert → Geometry includes **Smooth curves & preserve small details**, enabled by
default. Raster paths receive a bounded subpixel noise filter before simplification.
Open-path junction endpoints and sharp corners (including adjacent samples) are
protected. Movement is capped at 0.4 source pixels, and simplification error scales
down with feature size instead of flattening small-radius elements at a fixed 1.6 px.
Small loops remain polylines unless the existing conservative circle fitter accepts
them; smoothing does not force text-like loops into CAD circles. These are smoothed
polylines, not newly inferred spline or ARC entities.

Reconvert sheets after changing this option. Scans with very few pixels across a
radius can still look faceted; higher source resolution is needed to recover detail
that is absent from the input. Smoothing cannot certify original dimensions.

## Native vector PDFs and four-vertex boxes

Prefer **Preserve PDF vector geometry when available** for vector-authored PDFs.
The PDF.js 5.x packed-path reader preserves transformed line coordinates and
closed paths, extracts supported circular Béziers into CIRCLE/ARC entities, and
flattens other cubic curves to fine polylines. Supported rectangular clipping,
optional-content visibility and white fill knockouts are considered. Pages with
unsupported path structures or dominant raster images use the existing raster
pipeline. Embedded images occupying a small part of a vector page are omitted
with a conversion warning; this is not full PDF graphics reproduction. White
stroke-only erasers, complex clipping/fill rules and font outlines can still need
review. OCR export/removal remains necessary for outlined lettering.

**Recognize closed rectangles (4 vertices)** uses bounded fitting on closed paths
and can join four isolated edges. Open, branched and irregular shapes are not
forced into rectangles. Supported boxes use four unique vertices and the DXF
closed-polyline flag. Native paths bypass raster straightening and smoothing,
which would degrade their source coordinates. Crop-boundary circle/arc fragments
may remain clipped polylines. Reconvert sheets to apply these options and review
against Original before using the DXF. Native extraction does not set calibration.
