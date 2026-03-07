from __future__ import annotations

from pathlib import Path

import cadquery as cq
import numpy as np
from PIL import Image, ImageDraw

from cad.bolt import build_bolt_canonical
from cad.params import DEFAULT_BOLT_SPEC
from cad.projection import projection_from_svg
from cad.reference_stl import load_reference_stl, project_reference_mesh
from cad.torx import T25_PROFILE_POINTS_MM


MODEL_OUTLINE_RGBA = (0, 160, 0, 255)
BACKGROUND_RGBA = (255, 255, 255, 255)


def check_t25() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    stl_path = repo_root / "ref" / "M5x18-20241126.stl"
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    mesh = load_reference_stl(stl_path)
    top_projection = project_reference_mesh(mesh, view="top")
    model_projection = _model_top_projection()

    overlay_path = export_dir / "t25_check_overlay.png"
    report_path = export_dir / "t25_check_report.txt"

    _render_overlay(top_projection, model_projection, overlay_path)
    _write_report(mesh, report_path)

    print(f"exported {overlay_path}")
    print(f"exported {report_path}")


def _model_top_projection():
    bolt = build_bolt_canonical(DEFAULT_BOLT_SPEC)
    svg = cq.exporters.getSVG(
        bolt.val(),
        opts={
            "width": 500,
            "height": 500,
            "marginLeft": 20,
            "marginTop": 20,
            "projectionDir": (-1, 0, 0),
            "showAxes": False,
            "showHidden": False,
        },
    )
    return projection_from_svg(svg)


def _render_overlay(reference_projection, model_projection, output_path: Path, pixels_per_mm: float = 40.0, margin_px: int = 20) -> None:
    width = round(reference_projection.width * pixels_per_mm) + margin_px * 2
    height = round(reference_projection.height * pixels_per_mm) + margin_px * 2
    image = Image.new("RGBA", (width, height), BACKGROUND_RGBA)
    draw = ImageDraw.Draw(image, "RGBA")

    order = np.argsort(reference_projection.triangle_depths)
    for index in order:
        polygon = [
            (
                margin_px + (u - reference_projection.min_u) * pixels_per_mm,
                margin_px + (reference_projection.max_v - v) * pixels_per_mm,
            )
            for u, v in reference_projection.triangles_uv[index]
        ]
        shade = int(round(reference_projection.triangle_shades[index]))
        draw.polygon(polygon, fill=(shade, shade, shade, 255))

    for path in model_projection.paths:
        mapped = [
            (
                margin_px + (point[0] - reference_projection.min_u) * pixels_per_mm,
                margin_px + (reference_projection.max_v - point[1]) * pixels_per_mm,
            )
            for point in path
        ]
        if len(mapped) >= 2:
            draw.line(mapped, fill=MODEL_OUTLINE_RGBA, width=2)

    image.save(output_path)


def _write_report(mesh, output_path: Path) -> None:
    stl_profile = _extract_stl_socket_profile(mesh)
    model_profile = np.asarray(T25_PROFILE_POINTS_MM, dtype=float)

    stl_angles = np.arctan2(stl_profile[:, 1], stl_profile[:, 0])
    stl_angles = np.where(stl_angles < 0.0, stl_angles + 2.0 * np.pi, stl_angles)
    stl_radii = np.linalg.norm(stl_profile, axis=1)

    model_angles = np.arctan2(model_profile[:, 1], model_profile[:, 0])
    model_angles = np.where(model_angles < 0.0, model_angles + 2.0 * np.pi, model_angles)
    model_radii = np.linalg.norm(model_profile, axis=1)

    order = np.argsort(model_angles)
    model_angles = model_angles[order]
    model_radii = model_radii[order]

    extended_angles = np.concatenate(
        [
            model_angles[-8:] - 2.0 * np.pi,
            model_angles,
            model_angles[:8] + 2.0 * np.pi,
        ]
    )
    extended_radii = np.concatenate([model_radii[-8:], model_radii, model_radii[:8]])
    interpolated_model_radii = np.interp(stl_angles, extended_angles, extended_radii)

    radial_errors = interpolated_model_radii - stl_radii
    socket_depth_stl = _extract_stl_socket_depth_mm(mesh)
    socket_depth_model = DEFAULT_BOLT_SPEC.drive_depth_mm

    report = "\n".join(
        [
            "T25 socket check",
            "reference=ref/M5x18-20241126.stl",
            "model_profile_source=cad/torx.py",
            "projection_check=exports/t25_check_overlay.png",
            f"socket_depth_model_mm={socket_depth_model:.6f}",
            f"socket_depth_stl_mm={socket_depth_stl:.6f}",
            f"socket_depth_delta_mm={socket_depth_model - socket_depth_stl:.6f}",
            f"socket_profile_sample_count={len(stl_profile)}",
            f"socket_profile_rms_error_mm={float(np.sqrt(np.mean(radial_errors ** 2))):.6f}",
            f"socket_profile_max_abs_error_mm={float(np.max(np.abs(radial_errors))):.6f}",
            f"socket_profile_min_radius_mm={float(np.min(stl_radii)):.6f}",
            f"socket_profile_max_radius_mm={float(np.max(stl_radii)):.6f}",
        ]
    )
    output_path.write_text(report + "\n", encoding="ascii")


def _extract_stl_socket_profile(mesh) -> np.ndarray:
    points = mesh.points_mm
    head_face_x = float(np.min(points[:, 0]))
    plane_points = points[np.isclose(points[:, 0], head_face_x, atol=1e-6)]
    yz = plane_points[:, 1:3]
    radii = np.linalg.norm(yz, axis=1)
    return yz[radii < 3.0]


def _extract_stl_socket_depth_mm(mesh) -> float:
    x_values = np.unique(np.round(mesh.points_mm[:, 0], 6))
    head_face_x = float(np.min(x_values))
    cavity_floor_candidates = x_values[(x_values > head_face_x) & (x_values < 0.0)]
    if len(cavity_floor_candidates) == 0:
        raise ValueError("Could not infer socket floor plane from reference STL")
    cavity_floor_x = float(np.min(cavity_floor_candidates))
    return cavity_floor_x - head_face_x


if __name__ == "__main__":
    check_t25()
