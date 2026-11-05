# Conversion validation plan

This is an experimental proof of concept, not an engineering-validated product.

## Representative QA sheets

1. Clean vector-origin PDF with selectable printed text.
2. Scanned civil site, utility, or roadway plan.
3. Architectural floor plan with door swings and dimensions.
4. Structural framing drawing with grids and annotations.
5. Mechanical/electrical plan with overlapping geometry.
6. Noisy/skewed scan including handwritten field changes.

## Review checklist

- Confirm browser Network panel has no PDF/image uploads.
- Verify AutoCAD/Civil 3D imports editable LINE/LWPOLYLINE and TEXT objects.
- Check missed line segments, unwanted text outlines, disconnected joints, phantom geometry and duplicate edges.
- Review OCR errors and annotation positions manually.
- Calibrate a known distance then check a **different** dimension for accuracy.
- Validate DXF layer assignment and unit setting.
- Confirm exported coordinates are page-relative, not survey-georeferenced.
- Confirm batch ZIP includes a DXF per processed sheet and QA-manifest.json.
- Test memory and processing time with a 50-sheet batch.

## Not yet supported

True DWG export, survey georeferencing, CAD curves and Civil 3D intelligent objects, native vector PDF path preservation, angled OCR, automatic discipline classification, engineering tolerances or perfect conversion.

**Do not use the resulting DXF for design or construction without qualified engineering review.**

## Additional v0.4 linetype QA

- Check five or more repeated short strokes are recognized as one editable DXF LINE with group 6 = DASHED or HIDDEN.
- Verify each referenced linetype exists in the DXF LTYPE table and is displayed in AutoCAD/Civil 3D after REGEN.
- Confirm dash/gap pattern lengths scale with model-space calibration. Do not rely on automatic plot appearance.
- Test angled, nearly horizontal, lightly scanned and irregularly spaced lines.
- Check unrelated letter strokes, hatched fills, double-line pipe edges, walls, structural grids and dimension witness lines are **not** falsely joined.
- Check the *All DASHED* / *All HIDDEN* override changes the export without changing solid geometry.
- Review group counts and stitch gaps at tile boundaries. The detector does not guarantee continuity across all tile seams.
- Verify source drawings independently; inferred HIDDEN vs DASHED does not prove an object is physically hidden.


## v0.5 straightening and HATCH validation

- Test a wavy scanned straight edge: it should become a clean LINE only if its maximum deviation is within the selected tolerance.
- Test arcs, angled boundaries, curved wall segments, stepped profiles and survey contours: they must **not** become falsely straight or orthogonal.
- With orthogonal snapping disabled, preserve the true slope of legitimate diagonal engineering geometry.
- Use a known closed boundary containing a regular diagonal hatch family. Confirm **one native DXF HATCH entity**, valid polyline boundary path and a pattern line at the measured angle/spacing.
- Confirm recognized hatch strokes are **not also exported as separate LINE/LWPOLYLINE entities**, while the hatch boundary itself can remain visible as geometry.
- Confirm uncertain hatch areas with no closed boundary remain independent geometry, and the QA manifest reports them as not recognized.
- Open resulting DXF in AutoCAD/Civil 3D and verify HATCH editing, appearance after REGEN, units and pattern scale.
- Confirm no unwanted hatch conversion of grids, dimensions, centerlines, rebar, hatching from title blocks or engineering details.
- Complex materials (concrete, aggregate, earth, crosshatch) require future multi-pattern classification and manual boundary QA.


## v0.6 circles and hatch repair QA

- Test full circular features with scan wobble: DXF should contain one \`CIRCLE\` entity (center group 10/20, radius group 40), **not** dozens of LINE objects.
- Test two or more arcs that, together, cover almost the entire same circle. Fragment merging should be strict, and a partial arc must remain open geometry.
- Test squares, ellipses, stepped rounded walls, text-like loops and concentric circular details. Ensure unrelated geometry is not falsely merged.
- Compare center and radius against two independent measurements in the original drawing.
- Test tiny gaps in an otherwise closed section boundary and unrelated U-shaped open geometry. Do not close the U.
- Draw manual hatch boundaries using zoom/pan and confirm editable one-loop HATCH entities in AutoCAD/Civil 3D.
- Test SOLID (group 70 = 1), single-angle and two-angle CROSSHATCH (group 78 = 2).
- Verify \`Replace matched source strokes\` only removes within the chosen polygon and only along the selected hatch pattern bearings.
- Verify automatic HATCH extraction does not produce duplicates inside an operator-defined hatch polygon.
- Check Undo point, Finish hatch, Undo hatch, Cancel, changing sheets and reconversion.
- Confirm batch QA manifest includes circle counts, circle reconstruction statistics, manual repair details and hatch-pattern counts.
- Validate one 150-DPI and one 240-DPI scan in Civil 3D. This app cannot guarantee production-level recognition accuracy.


## v0.7 dimension QA and OCR review tests

- Import drawings with embedded PDF text and separately scanned text (OCR enabled). Confirm that ordinary labels, elevations, stationing, radius, diameter and scale callouts do not become approved linear dimensions.
- Recognize metric (mm/m/cm), decimal imperial, and feet-inch fractional strings with correct unit conversion and comparison.
- Validate a synthetic horizontal and vertical dimension baseline with two witness lines; if one witness is missing, do not fabricate endpoints.
- Confirm that source notes without an association appear as unresolved until an operator picks two endpoints.
- Calibrate using one reference, then validate a **different independent** dimension, with correct unit and nonzero tolerance.
- Change the scale, units, printed label, or tolerance. Previously confirmed measurements must require re-review.
- Check both within-tolerance and out-of-tolerance conditions; confirming review must **not** hide a mismatch.
- Correct OCR text, add a manual missing note, ignore irrelevant numeric text, clear manual endpoints, and cancel a two-point selection with Escape.
- Zoom/pan between two dimension clicks and verify the stored source-pixel positions.
- Export a per-sheet CSV and batch ZIP. Inspect checked counts, unresolved notes, reviewer confirmations, delta signs, selected units, and point coordinates.
- Open the DXF in Civil 3D. Note that printed labels remain TEXT, **not** native associative DIMENSION entities. Verify independently.
- Use an actual old/faded and dense engineering scan as well as synthetic fixtures; test runtime and label false positives.
