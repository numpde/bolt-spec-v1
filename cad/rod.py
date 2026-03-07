from __future__ import annotations

import cadquery as cq

from cad.params import RodSpec


def build_rod(spec: RodSpec) -> cq.Workplane:
    """Build a simple cylindrical rod centered on the XY origin."""
    radius = spec.diameter_mm / 2.0
    return cq.Workplane("XY").circle(radius).extrude(spec.length_mm)
