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
