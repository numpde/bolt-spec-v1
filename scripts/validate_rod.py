from __future__ import annotations

from cad.params import DEFAULT_ROD_SPEC
from cad.rod import build_rod


def validate_rod(tolerance_mm: float = 1e-6) -> None:
    rod = build_rod(DEFAULT_ROD_SPEC)
    bbox = rod.val().BoundingBox()

    measured_length = bbox.zlen
    measured_diameter_x = bbox.xlen
    measured_diameter_y = bbox.ylen

    expected_length = DEFAULT_ROD_SPEC.length_mm
    expected_diameter = DEFAULT_ROD_SPEC.diameter_mm

    assert abs(measured_length - expected_length) <= tolerance_mm, (
        f"length mismatch: expected {expected_length}, got {measured_length}"
    )
    assert abs(measured_diameter_x - expected_diameter) <= tolerance_mm, (
        f"diameter mismatch on x: expected {expected_diameter}, got {measured_diameter_x}"
    )
    assert abs(measured_diameter_y - expected_diameter) <= tolerance_mm, (
        f"diameter mismatch on y: expected {expected_diameter}, got {measured_diameter_y}"
    )

    print("validation passed")
    print(f"length_mm={measured_length}")
    print(f"diameter_x_mm={measured_diameter_x}")
    print(f"diameter_y_mm={measured_diameter_y}")


if __name__ == "__main__":
    validate_rod()
