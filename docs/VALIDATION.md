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
