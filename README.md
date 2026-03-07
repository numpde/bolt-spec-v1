# bolt-spec-v1

Calibration-first parametric CAD workflow for a simple rod, intended to prove
units, exports, and geometry validation before modeling the full fastener.

## Layout

- `cad/params.py`: param dataclasses and presets
- `cad/calibration.py`: explicit pixel-to-mm drawing calibration for the side view
- `cad/bolt.py`: parametric bolt solid with metric thread and fixed T25 socket
- `cad/projection.py`: fixed orthographic SVG projection helpers for CAD solids
- `cad/reference_stl.py`: reference STL loading, canonicalization, and mesh projection
- `cad/torx.py`: fixed T25 socket opening extracted from the reference STL
- `cad/rod.py`: simple calibration solid
- `scripts/export_bolt.py`: export STEP/STL and side-view artifacts for the parametric bolt
- `scripts/check_t25.py`: overlay the model top view on the reference STL and report socket deviation
- `scripts/export_rod.py`: export STEP/STL for the calibration rod
- `scripts/render_bolt_overlay.py`: overlay the parametric bolt side view onto the drawing
- `scripts/render_reference_stl.py`: export canonical side/top renders from the reference STL
- `scripts/render_rod_overlay.py`: generate canonical model projections and calibrated overlays
- `scripts/validate_bolt.py`: numerically validate the bolt model bounding dimensions
- `scripts/validate_rod.py`: numerically validate generated geometry

## Next step

Install `cadquery` into `.venv`, then run the export and validation modules from
the repo root:

```bash
.venv/bin/python -m scripts.validate_rod
.venv/bin/python -m scripts.export_rod
.venv/bin/python -m scripts.render_rod_overlay
.venv/bin/python -m scripts.render_reference_stl
.venv/bin/python -m scripts.validate_bolt --size m5
.venv/bin/python -m scripts.export_bolt --size m5
.venv/bin/python -m scripts.render_bolt_overlay
.venv/bin/python -m scripts.check_t25
```

If you need a direct script-style invocation for some reason, prefer setting
`PYTHONPATH=.` at the shell rather than modifying `sys.path` in code.
