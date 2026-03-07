from __future__ import annotations

from pathlib import Path

import cadquery as cq

REPO_ROOT = Path(__file__).resolve().parent.parent

from cad.params import DEFAULT_ROD_SPEC
from cad.rod import build_rod


def export_rod() -> None:
    export_dir = REPO_ROOT / "exports"
    export_dir.mkdir(exist_ok=True)

    rod = build_rod(DEFAULT_ROD_SPEC)
    step_path = export_dir / "rod.step"
    stl_path = export_dir / "rod.stl"

    cq.exporters.export(rod, str(step_path))
    cq.exporters.export(rod, str(stl_path))

    print(f"exported {step_path}")
    print(f"exported {stl_path}")


if __name__ == "__main__":
    export_rod()
