# AsBuilt Vectorizer

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
