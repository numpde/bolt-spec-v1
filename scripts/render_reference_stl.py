from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from cad.calibration import DEFAULT_SIDE_VIEW_CALIBRATION
from cad.reference_stl import ProjectedMesh, load_reference_stl, project_reference_mesh


CANONICAL_BACKGROUND = (255, 255, 255, 255)
OVERLAY_ALPHA = 120


def _render_projected_mesh(
    projection: ProjectedMesh,
    output_path: Path,
    pixels_per_mm: float = 30.0,
    margin_px: int = 20,
) -> None:
    width = round(projection.width * pixels_per_mm) + margin_px * 2
    height = round(projection.height * pixels_per_mm) + margin_px * 2
    image = Image.new("RGBA", (width, height), CANONICAL_BACKGROUND)
    draw = ImageDraw.Draw(image, "RGBA")

    order = np.argsort(projection.triangle_depths)
    for index in order:
        polygon = [
            (
                margin_px + (u - projection.min_u) * pixels_per_mm,
                margin_px + (projection.max_v - v) * pixels_per_mm,
            )
            for u, v in projection.triangles_uv[index]
        ]
        shade = int(round(projection.triangle_shades[index]))
        draw.polygon(polygon, fill=(shade, shade, shade, 255))

    image.save(output_path)


def _render_side_overlay(
    reference_image_path: Path,
    projection: ProjectedMesh,
    output_path: Path,
) -> None:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    base = Image.open(reference_image_path).convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    order = np.argsort(projection.triangle_depths)
    for index in order:
        polygon = [
            (
                calibration.under_head_x_px + u * calibration.px_per_mm_x,
                calibration.center_y_px - v * calibration.px_per_mm_y,
            )
            for u, v in projection.triangles_uv[index]
        ]
        shade = int(round(projection.triangle_shades[index]))
        draw.polygon(polygon, fill=(shade, 0, 0, 255))

    alpha = layer.getchannel("A").point(lambda value: int(round(value * OVERLAY_ALPHA / 255.0)))
    layer.putalpha(alpha)
    Image.alpha_composite(base, layer).save(output_path)


def _write_report(mesh_bounds_m, mesh_bounds_mm, output_path: Path) -> None:
    report = "\n".join(
        [
            "Reference STL inspection",
            "source=ref/M5x18-20241126.stl",
            "input_units=meters",
            "canonical_units=millimeters",
            "canonical_axis_x=fastener length, under-head at x=0, tip at positive x",
            "canonical_axis_y=original x radial axis",
            "canonical_axis_z=original y radial axis",
            f"source_bounds_m={mesh_bounds_m}",
            f"canonical_bounds_mm={mesh_bounds_mm}",
        ]
    )
    output_path.write_text(report + "\n", encoding="ascii")


def render_reference_stl() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    stl_path = repo_root / "ref" / "M5x18-20241126.stl"
    reference_image_path = repo_root / "ref" / "alibaba-image-preview.png"
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    if not stl_path.exists():
        raise FileNotFoundError(f"Reference STL not found: {stl_path}")

    mesh = load_reference_stl(stl_path)
    side_projection = project_reference_mesh(mesh, view="side")
    top_projection = project_reference_mesh(mesh, view="top")

    side_path = export_dir / "reference_stl_side.png"
    top_path = export_dir / "reference_stl_top.png"
    side_overlay_path = export_dir / "reference_stl_side_overlay.png"
    report_path = export_dir / "reference_stl_report.txt"

    _render_projected_mesh(side_projection, side_path)
    _render_projected_mesh(top_projection, top_path)

    if reference_image_path.exists():
        _render_side_overlay(reference_image_path, side_projection, side_overlay_path)

    _write_report(mesh.source_bounds_m, mesh.bounds_mm, report_path)

    print(f"exported {side_path}")
    print(f"exported {top_path}")
    if reference_image_path.exists():
        print(f"exported {side_overlay_path}")
    print(f"exported {report_path}")


if __name__ == "__main__":
    render_reference_stl()
