# DXF export integrity

The R2000 writer previously omitted AcDbPolyline (and LINE/TEXT subclass markers).
A synthetic converted polyline reproduced a strict ezdxf DXFStructureError:
`missing AcDbPolyline subclass in LWPOLYLINE`. Tables also lacked subclass markers
and handles. All supported records now carry the appropriate R2000 subclasses
and unique handles. Calibration retains very small nonzero coordinates.

Both single and ZIP exports use buildDxf, which rejects malformed input, non-finite
transformed numbers and empty exports, then checks group pairs, section closure,
entity subclasses and polyline vertex counts before returning download content.
This browser check is intentionally limited; it is not a complete CAD certification.
ZIP filenames are unique case-insensitively, including QA sidecars, and each manifest
entry includes the integrity result. Any invalid sheet aborts the ZIP download.

Validation:
- npm test: 100 tests pass, including actual selected/ZIP handler execution with
  mocked browser download and ZIP interfaces, collisions and blocked downloads.
- python -m pip install ezdxf==1.4.5
- python tests/validate-dxf.py: strict readfile and audit of synthetic raster tracing,
  polyline, dashed/hidden lines, text, circle, solid hatch and crosshatch: eight
  entities, zero audit errors, zero audit repairs. Checks units and coordinates.
- CI runs both suites. No private drawings are fixtures or uploaded.

The original online viewer was not identified and has not been tested directly.
The independent parser reproduces the structural failure and accepts the correction.
