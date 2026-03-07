from __future__ import annotations

import argparse

from cad.bolt import build_bolt, build_smooth_bolt
from cad.params import BoltSpec, DEFAULT_BOLT_SPEC, M6_BOLT_SPEC


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a parametric bolt model")
    parser.add_argument("--size", choices=("m5", "m6"), default="m5")
    return parser.parse_args()


def spec_for_size(size: str) -> BoltSpec:
    if size == "m5":
        return DEFAULT_BOLT_SPEC
    if size == "m6":
        return M6_BOLT_SPEC
    raise ValueError(f"Unsupported size: {size}")


def validate_bolt(spec: BoltSpec, tolerance_mm: float = 0.05) -> None:
    bolt = build_bolt(spec)
    smooth_bolt = build_smooth_bolt(spec)
    bbox = bolt.val().BoundingBox()

    measured_overall_length = bbox.zlen
    measured_head_diameter = max(bbox.xlen, bbox.ylen)
    thread_volume_delta = smooth_bolt.val().Volume() - bolt.val().Volume()

    assert abs(measured_overall_length - spec.overall_length_mm) <= tolerance_mm, (
        f"overall length mismatch: expected {spec.overall_length_mm}, got {measured_overall_length}"
    )
    assert abs(measured_head_diameter - spec.head_diameter_mm) <= tolerance_mm, (
        f"head diameter mismatch: expected {spec.head_diameter_mm}, got {measured_head_diameter}"
    )
    if spec.thread_height_mm > 0.0:
        assert thread_volume_delta > spec.thread_height_mm, (
            "thread volume delta is too small; the threaded bolt is effectively smooth"
        )

    print("validation passed")
    print(f"nominal_diameter_mm={spec.nominal_diameter_mm}")
    print(f"pitch_mm={spec.resolved_pitch_mm}")
    print(f"thread_head_runout_profile={spec.thread_head_runout_profile}")
    print(f"overall_length_mm={measured_overall_length}")
    print(f"head_diameter_mm={measured_head_diameter}")
    print(f"thread_volume_delta_mm3={thread_volume_delta}")


if __name__ == "__main__":
    args = parse_args()
    validate_bolt(spec_for_size(args.size))
