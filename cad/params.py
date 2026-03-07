from __future__ import annotations

from dataclasses import dataclass, replace


COARSE_METRIC_PITCH_MM = {
    5.0: 0.8,
    6.0: 1.0,
}

RUNOUT_PROFILES = (
    "smoothstep",
    "ease_in_quad",
    "ease_in_cubic",
    "ease_in_quart",
)


@dataclass(frozen=True)
class RodSpec:
    length_mm: float = 18.0
    diameter_mm: float = 5.0


def coarse_metric_pitch_mm(nominal_diameter_mm: float) -> float:
    diameter_key = round(float(nominal_diameter_mm), 3)
    if diameter_key not in COARSE_METRIC_PITCH_MM:
        raise ValueError(f"Unsupported coarse metric diameter: {nominal_diameter_mm}")
    return COARSE_METRIC_PITCH_MM[diameter_key]


@dataclass(frozen=True)
class BoltSpec:
    nominal_diameter_mm: float = 5.0
    pitch_mm: float | None = None
    under_head_length_mm: float = 18.0
    threaded_length_mm: float = 13.0
    head_diameter_mm: float = 7.0
    head_height_mm: float = 3.5
    head_top_fillet_mm: float = 0.5
    drive_depth_mm: float = 3.0
    tip_chamfer_mm: float = 0.5
    thread_profile_overlap_mm: float = 0.01
    thread_tip_extension_turns: float = 1.0
    thread_head_runout_turns: float = 0.25
    thread_head_runout_profile: str = "smoothstep"

    @property
    def resolved_pitch_mm(self) -> float:
        if self.pitch_mm is not None:
            return self.pitch_mm
        return coarse_metric_pitch_mm(self.nominal_diameter_mm)

    @property
    def major_radius_mm(self) -> float:
        return self.nominal_diameter_mm / 2.0

    @property
    def pitch_diameter_mm(self) -> float:
        return self.nominal_diameter_mm - 0.649519 * self.resolved_pitch_mm

    @property
    def pitch_radius_mm(self) -> float:
        return self.pitch_diameter_mm / 2.0

    @property
    def minor_diameter_mm(self) -> float:
        return self.nominal_diameter_mm - 1.226869 * self.resolved_pitch_mm

    @property
    def minor_radius_mm(self) -> float:
        return self.minor_diameter_mm / 2.0

    @property
    def head_radius_mm(self) -> float:
        return self.head_diameter_mm / 2.0

    @property
    def plain_shank_length_mm(self) -> float:
        return self.under_head_length_mm - self.threaded_length_mm

    @property
    def thread_start_mm(self) -> float:
        return self.plain_shank_length_mm

    @property
    def thread_height_mm(self) -> float:
        return max(0.0, self.threaded_length_mm - self.tip_chamfer_mm)

    @property
    def thread_cut_end_mm(self) -> float:
        return self.under_head_length_mm + (self.thread_tip_extension_turns * self.resolved_pitch_mm)

    @property
    def thread_head_runout_height_mm(self) -> float:
        return self.thread_head_runout_turns * self.resolved_pitch_mm

    @property
    def overall_length_mm(self) -> float:
        return self.head_height_mm + self.under_head_length_mm

    def validate(self) -> None:
        if self.nominal_diameter_mm <= 0.0:
            raise ValueError("nominal_diameter_mm must be positive")
        if self.resolved_pitch_mm <= 0.0:
            raise ValueError("pitch_mm must be positive")
        if self.under_head_length_mm <= 0.0:
            raise ValueError("under_head_length_mm must be positive")
        if self.threaded_length_mm < 0.0:
            raise ValueError("threaded_length_mm cannot be negative")
        if self.threaded_length_mm > self.under_head_length_mm:
            raise ValueError("threaded_length_mm cannot exceed under_head_length_mm")
        if self.head_diameter_mm <= self.nominal_diameter_mm:
            raise ValueError("head_diameter_mm must exceed nominal_diameter_mm")
        if self.head_height_mm <= 0.0:
            raise ValueError("head_height_mm must be positive")
        if self.drive_depth_mm <= 0.0 or self.drive_depth_mm >= self.head_height_mm:
            raise ValueError("drive_depth_mm must be between 0 and head_height_mm")
        if self.minor_diameter_mm <= 0.0:
            raise ValueError("resolved thread minor diameter must be positive")
        if self.thread_tip_extension_turns < 0.0:
            raise ValueError("thread_tip_extension_turns cannot be negative")
        if self.thread_head_runout_turns < 0.0:
            raise ValueError("thread_head_runout_turns cannot be negative")
        if self.thread_head_runout_profile not in RUNOUT_PROFILES:
            raise ValueError(
                "thread_head_runout_profile must be one of "
                + ", ".join(RUNOUT_PROFILES)
            )

    def with_nominal_diameter(self, nominal_diameter_mm: float) -> "BoltSpec":
        return replace(self, nominal_diameter_mm=nominal_diameter_mm, pitch_mm=None)


DEFAULT_ROD_SPEC = RodSpec()
DEFAULT_BOLT_SPEC = BoltSpec()
# M6 keeps the M5 proportions for the outer envelope while holding the T25 drive fixed.
M6_BOLT_SPEC = replace(
    DEFAULT_BOLT_SPEC,
    nominal_diameter_mm=6.0,
    pitch_mm=1.0,
    head_diameter_mm=8.4,
    head_height_mm=4.2,
    head_top_fillet_mm=0.6,
    tip_chamfer_mm=0.6,
    thread_tip_extension_turns=7.0,
)
