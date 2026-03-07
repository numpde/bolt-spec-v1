from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SideViewCalibration:
    """Pixel anchors that place the side view in drawing coordinates."""

    # The 18 mm fastener length is interpreted conventionally: under-head to tip.
    under_head_x_px: float = 159.0
    tip_x_px: float = 482.0

    # The shaft diameter is the explicit phi5 callout on the side view.
    shaft_top_y_px: float = 140.0
    shaft_bottom_y_px: float = 230.0

    # Crop a tight side-view window before rectifying into mm-space.
    crop_left_px: int = 70
    crop_top_px: int = 100
    crop_right_px: int = 510
    crop_bottom_px: int = 255

    fastener_length_mm: float = 18.0
    shaft_diameter_mm: float = 5.0

    @property
    def center_y_px(self) -> float:
        return (self.shaft_top_y_px + self.shaft_bottom_y_px) / 2.0

    @property
    def px_per_mm_x(self) -> float:
        return (self.tip_x_px - self.under_head_x_px) / self.fastener_length_mm

    @property
    def px_per_mm_y(self) -> float:
        return (self.shaft_bottom_y_px - self.shaft_top_y_px) / self.shaft_diameter_mm

    @property
    def mm_per_px_x(self) -> float:
        return 1.0 / self.px_per_mm_x

    @property
    def mm_per_px_y(self) -> float:
        return 1.0 / self.px_per_mm_y

    @property
    def relative_scale_delta(self) -> float:
        mean = (self.px_per_mm_x + self.px_per_mm_y) / 2.0
        return abs(self.px_per_mm_x - self.px_per_mm_y) / mean


DEFAULT_SIDE_VIEW_CALIBRATION = SideViewCalibration()
