# AsBuilt Vectorizer

Browser-based, **client-side** PDF/image-to-layered-DXF proof of concept for engineering drawings. The selected drawings are processed in the user's browser, with no application upload endpoint.

> **Status: pre-release proof of concept.** Raster centerline tracing and OCR are experimental. DXF drawings require manual quality control and scale calibration before engineering use. Native DWG export is **not** included.

## Purpose

- Import one or more PDF files (including multipage files), PNG, or JPG.
- Convert scanned raster linework into editable LINE/LWPOLYLINE DXF entities using local image processing.
- Recognize horizontal printed annotations with optional OCR and write CAD TEXT entities.
- Choose geometry and text layers, calibrate the drawing scale, and preview the detected linework.
- Export an individual DXF, or a ZIP of DXFs and a QA manifest.

## How it works

```text
User file picker → in-browser PDF.js/image rendering → local raster tracing worker
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
- Each sheet requires independent calibration to establish useful engineering model units. Uncalibrated output uses one drawing unit per processed pixel.
- Processing 50 large sheets can consume substantial browser memory and CPU; process sequentially.
- Public GitHub repositories expose application source code.

## Testing

```bash
npm test
```

Run the included synthetic geometry/DXF tests and validate representative exported files in AutoCAD or Civil 3D.

## Licensing

Project code: Copyright (c) 2026, repository owner. **All rights reserved pending selection of a license.** No rights to reuse or redistribute this repository are granted by default. Third-party libraries retain their own licenses.
