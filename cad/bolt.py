from __future__ import annotations

import math

import cadquery as cq

from cad.params import BoltSpec
from cad.torx import T25_PROFILE_POINTS_MM

THREAD_CUT_CLEARANCE_MM = 0.1
THREAD_HEAD_RUNOUT_SECTION_COUNT = 12
THREAD_HEAD_RUNOUT_MIN_DEPTH_SCALE = 0.02
THREAD_CREST_FLAT_FRACTION = 0.125
THREAD_ROOT_FLAT_FRACTION = 0.125


def build_bolt(spec: BoltSpec) -> cq.Workplane:
    """Build a parametric bolt along +Z with the under-head face at z=0."""
    spec.validate()

    head = _build_head(spec)
    shank = _build_shank(spec, threaded=True)
    bolt = head.union(shank, clean=False)
    return bolt.cut(_build_t25_socket_cut(spec), clean=False)


def build_bolt_discrete(spec: BoltSpec) -> cq.Compound:
    """Build a debug compound of the blank solids and cutter solids without booleans."""
    spec.validate()

    parts: list[cq.Shape] = [
        _build_head(spec).val(),
        _build_shank(spec, threaded=False).val(),
        _build_t25_socket_cut(spec).val(),
    ]
    if spec.thread_height_mm > 0.0:
        parts.append(_build_thread_void(spec))
        head_runout_void = _build_head_runout_void(spec)
        if head_runout_void is not None:
            parts.append(head_runout_void)

    return cq.Compound.makeCompound(parts)


def build_smooth_bolt(spec: BoltSpec) -> cq.Workplane:
    """Build the same bolt without the external thread cut."""
    spec.validate()

    head = _build_head(spec)
    shank = _build_shank(spec, threaded=False)
    bolt = head.union(shank, clean=False)
    return bolt.cut(_build_t25_socket_cut(spec), clean=False)


def build_bolt_canonical(spec: BoltSpec) -> cq.Workplane:
    """Rotate the bolt into the shared +X length-axis frame used by STL references."""
    return build_bolt(spec).rotate((0, 0, 0), (0, 1, 0), 90)


def _build_head(spec: BoltSpec) -> cq.Workplane:
    head = (
        cq.Workplane("XY")
        .circle(spec.head_radius_mm)
        .extrude(spec.head_height_mm)
        .translate((0.0, 0.0, -spec.head_height_mm))
    )
    if spec.head_top_fillet_mm > 0.0:
        head = head.faces("<Z").edges().fillet(spec.head_top_fillet_mm)
    return head


def _build_shank(spec: BoltSpec, threaded: bool) -> cq.Workplane:
    if threaded and spec.thread_height_mm > 0.0:
        # Build the threaded shank from a blank that fully contains the helix, then trim
        # back to the intended shank length. Cutting directly against the capped 18 mm blank
        # causes the kernel to collapse the last turn near the tip.
        shank = _build_thread_cut_blank(spec)
        shank = shank.cut(_build_thread_void(spec), clean=False)
        head_runout_void = _build_head_runout_void(spec)
        if head_runout_void is not None:
            shank = shank.cut(head_runout_void, clean=False)
        return shank.intersect(_build_shank_trim_shape(spec), clean=False)

    if spec.tip_chamfer_mm > 0.0:
        return _build_shank_envelope(spec)

    return cq.Workplane("XY").circle(spec.major_radius_mm).extrude(spec.under_head_length_mm)


def _build_thread_void(spec: BoltSpec) -> cq.Solid:
    if spec.thread_height_mm <= 0.0:
        raise ValueError("thread_height_mm must be positive to build a thread void")

    z_start_mm = spec.thread_start_mm
    z_end_mm = spec.thread_cut_end_mm
    sweep_plane = _thread_sweep_plane_at(spec, z_start_mm)
    groove_profile = _build_thread_profile(sweep_plane, spec)
    helix_path = _thread_helix_segment(
        spec,
        z_start_mm=z_start_mm,
        z_end_mm=z_end_mm,
    )
    return groove_profile.sweep(
        helix_path,
        combine=False,
        transition="right",
        isFrenet=True,
    ).val()


def _build_shank_envelope(spec: BoltSpec) -> cq.Workplane:
    chamfer_start_mm = spec.under_head_length_mm - spec.tip_chamfer_mm
    cylinder = cq.Workplane("XY").circle(spec.major_radius_mm).extrude(chamfer_start_mm)
    if spec.tip_chamfer_mm <= 0.0:
        return cylinder

    chamfer = (
        cq.Workplane("XY", origin=(0.0, 0.0, chamfer_start_mm))
        .circle(spec.major_radius_mm)
        .workplane(offset=spec.tip_chamfer_mm)
        .circle(spec.major_radius_mm - spec.tip_chamfer_mm)
        .loft(combine=False)
    )
    return cylinder.union(chamfer, clean=False)


def _build_thread_cut_blank(spec: BoltSpec) -> cq.Workplane:
    blank_height_mm = max(spec.under_head_length_mm, spec.thread_cut_end_mm)
    return cq.Workplane("XY").circle(spec.major_radius_mm).extrude(blank_height_mm)


def _build_shank_trim_shape(spec: BoltSpec) -> cq.Workplane:
    if spec.tip_chamfer_mm > 0.0:
        return _build_shank_envelope(spec)

    trim_span_mm = max(spec.head_diameter_mm, spec.nominal_diameter_mm) * 4.0
    return (
        cq.Workplane("XY")
        .box(trim_span_mm, trim_span_mm, spec.under_head_length_mm, centered=(True, True, False))
    )


def _build_thread_profile(
    sweep_plane: cq.Plane,
    spec: BoltSpec,
    depth_scale: float = 1.0,
    radial_offset_mm: float = 0.0,
) -> cq.Workplane:
    root_half_width_mm = (spec.resolved_pitch_mm * THREAD_ROOT_FLAT_FRACTION) / 2.0
    crest_half_width_mm = (spec.resolved_pitch_mm * (1.0 - THREAD_CREST_FLAT_FRACTION)) / 2.0
    outer_x_mm = radial_offset_mm + THREAD_CUT_CLEARANCE_MM
    inner_x_mm = radial_offset_mm + ((spec.minor_radius_mm - spec.major_radius_mm) * depth_scale)
    return (
        cq.Workplane(sweep_plane)
        .polyline(
            [
                (outer_x_mm, -(crest_half_width_mm + spec.thread_profile_overlap_mm)),
                (inner_x_mm, -root_half_width_mm),
                (inner_x_mm, root_half_width_mm),
                (outer_x_mm, crest_half_width_mm + spec.thread_profile_overlap_mm),
            ]
        )
        .close()
    )


def _build_head_runout_void(spec: BoltSpec) -> cq.Solid | None:
    runout_height_mm = min(spec.thread_head_runout_height_mm, spec.thread_start_mm)
    if runout_height_mm <= 0.0:
        return None

    runout_start_mm = spec.thread_start_mm - runout_height_mm
    loft_wires: list[cq.Wire] = []

    for section_index in range(THREAD_HEAD_RUNOUT_SECTION_COUNT + 1):
        u = section_index / THREAD_HEAD_RUNOUT_SECTION_COUNT
        z_mm = runout_start_mm + (u * runout_height_mm)
        profile_value, _ = _runout_profile_value_and_slope(
            spec.thread_head_runout_profile,
            u,
        )
        depth_scale = max(THREAD_HEAD_RUNOUT_MIN_DEPTH_SCALE, profile_value)
        radial_offset_mm = (1.0 - profile_value) * (
            (spec.major_radius_mm - spec.minor_radius_mm) + THREAD_CUT_CLEARANCE_MM
        )
        loft_wires.append(
            _build_thread_profile(
                _thread_sweep_plane_at(spec, z_mm),
                spec,
                depth_scale=depth_scale,
                radial_offset_mm=radial_offset_mm,
            ).val()
        )

    return cq.Solid.makeLoft(loft_wires)


def _thread_sweep_plane_at(spec: BoltSpec, z_mm: float) -> cq.Plane:
    theta_rad = _thread_phase_rad(spec, z_mm)
    return cq.Plane(
        origin=(
            spec.major_radius_mm * math.cos(theta_rad),
            spec.major_radius_mm * math.sin(theta_rad),
            z_mm,
        ),
        xDir=(math.cos(theta_rad), math.sin(theta_rad), 0.0),
        normal=(-math.sin(theta_rad), math.cos(theta_rad), 0.0),
    )


def _thread_helix_segment(spec: BoltSpec, z_start_mm: float, z_end_mm: float) -> cq.Wire:
    if z_end_mm <= z_start_mm:
        raise ValueError("z_end_mm must be greater than z_start_mm for a helix segment")

    helix = cq.Wire.makeHelix(
        spec.resolved_pitch_mm,
        z_end_mm - z_start_mm,
        spec.major_radius_mm,
        center=(0.0, 0.0, z_start_mm),
        dir=(0.0, 0.0, 1.0),
    )
    return helix.rotate(
        (0.0, 0.0, z_start_mm),
        (0.0, 0.0, z_start_mm + 1.0),
        math.degrees(_thread_phase_rad(spec, z_start_mm)),
    )


def _thread_phase_rad(spec: BoltSpec, z_mm: float) -> float:
    return 2.0 * math.pi * (z_mm - spec.thread_start_mm) / spec.resolved_pitch_mm


def _runout_profile_value_and_slope(profile_name: str, value: float) -> tuple[float, float]:
    u = max(0.0, min(1.0, value))
    if profile_name == "smoothstep":
        return (u * u * (3.0 - (2.0 * u)), (6.0 * u) - (6.0 * u * u))
    if profile_name == "ease_in_quad":
        return (u * u, 2.0 * u)
    if profile_name == "ease_in_cubic":
        return (u * u * u, 3.0 * u * u)
    if profile_name == "ease_in_quart":
        return (u * u * u * u, 4.0 * u * u * u)
    raise ValueError(f"Unsupported thread_head_runout_profile: {profile_name}")


def _build_t25_socket_cut(spec: BoltSpec) -> cq.Workplane:
    return (
        cq.Workplane("XY", origin=(0.0, 0.0, -spec.head_height_mm))
        .polyline(T25_PROFILE_POINTS_MM)
        .close()
        .extrude(spec.drive_depth_mm)
    )
