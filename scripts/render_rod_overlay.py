from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from cad.calibration import DEFAULT_SIDE_VIEW_CALIBRATION
from cad.params import DEFAULT_ROD_SPEC
from cad.projection import Projection2D, canonical_side_projection_svg, projection_from_svg
from cad.rod import build_rod


ROD_OUTLINE_RGBA = (255, 0, 0, 255)
ANCHOR_RGBA = (255, 0, 0, 180)
CANONICAL_OUTLINE_RGBA = (0, 0, 0, 255)
CANONICAL_BACKGROUND_RGBA = (255, 255, 255, 255)


def _draw_original_overlay(
    source: Image.Image,
    projection: Projection2D,
    output_path: Path,
) -> None:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    overlay = source.copy().convert("RGBA")
    layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: _map_model_point_to_original(point, projection),
        color=ROD_OUTLINE_RGBA,
        width=2,
    )

    for x in (calibration.under_head_x_px, calibration.tip_x_px):
        draw.line((x, 90, x, 250), fill=ANCHOR_RGBA, width=1)

    for y in (calibration.shaft_top_y_px, calibration.shaft_bottom_y_px):
        draw.line((140, y, 500, y), fill=ANCHOR_RGBA, width=1)

    Image.alpha_composite(overlay, layer).save(output_path)


def _draw_rectified_overlay(
    source: Image.Image,
    projection: Projection2D,
    output_reference_path: Path,
    output_overlay_path: Path,
    pixels_per_mm: float = 30.0,
) -> None:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    crop_box = (
        calibration.crop_left_px,
        calibration.crop_top_px,
        calibration.crop_right_px,
        calibration.crop_bottom_px,
    )
    crop = source.crop(crop_box).convert("RGBA")

    scale_x = pixels_per_mm / calibration.px_per_mm_x
    scale_y = pixels_per_mm / calibration.px_per_mm_y
    rectified_size = (
        round(crop.width * scale_x),
        round(crop.height * scale_y),
    )
    rectified = crop.resize(rectified_size, Image.Resampling.LANCZOS)
    rectified.save(output_reference_path)

    overlay = rectified.copy()
    layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: _map_model_point_to_rectified(
            point,
            projection,
            pixels_per_mm=pixels_per_mm,
        ),
        color=ROD_OUTLINE_RGBA,
        width=max(2, round(pixels_per_mm * 0.08)),
    )
    Image.alpha_composite(overlay, layer).save(output_overlay_path)


def _export_canonical_projection(
    projection: Projection2D,
    output_path: Path,
    pixels_per_mm: float = 30.0,
    margin_px: int = 20,
) -> None:
    image = Image.new(
        "RGBA",
        (
            round(projection.width * pixels_per_mm) + margin_px * 2,
            round(projection.height * pixels_per_mm) + margin_px * 2,
        ),
        CANONICAL_BACKGROUND_RGBA,
    )
    draw = ImageDraw.Draw(image, "RGBA")
    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: (
            margin_px + (point[0] - projection.min_x) * pixels_per_mm,
            margin_px + (projection.max_y - point[1]) * pixels_per_mm,
        ),
        color=CANONICAL_OUTLINE_RGBA,
        width=max(2, round(pixels_per_mm * 0.08)),
    )
    image.save(output_path)


def _map_model_point_to_original(
    point: tuple[float, float],
    projection: Projection2D,
) -> tuple[float, float]:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    x_mm, y_mm = point
    x_px = calibration.under_head_x_px + (x_mm - projection.min_x) * calibration.px_per_mm_x
    y_px = calibration.center_y_px - y_mm * calibration.px_per_mm_y
    return (x_px, y_px)


def _map_model_point_to_rectified(
    point: tuple[float, float],
    projection: Projection2D,
    pixels_per_mm: float,
) -> tuple[float, float]:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    scale_x = pixels_per_mm / calibration.px_per_mm_x
    scale_y = pixels_per_mm / calibration.px_per_mm_y
    under_head_x = (calibration.under_head_x_px - calibration.crop_left_px) * scale_x
    center_y = (calibration.center_y_px - calibration.crop_top_px) * scale_y

    x_mm, y_mm = point
    x_px = under_head_x + (x_mm - projection.min_x) * pixels_per_mm
    y_px = center_y - y_mm * pixels_per_mm
    return (x_px, y_px)


def _draw_projection_paths(
    draw: ImageDraw.ImageDraw,
    projection: Projection2D,
    point_mapper,
    color: tuple[int, int, int, int],
    width: int,
) -> None:
    for path in projection.paths:
        mapped = [point_mapper(point) for point in path]
        if len(mapped) >= 2:
            draw.line(mapped, fill=color, width=width)


def _write_report(output_path: Path, projection: Projection2D) -> None:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    spec = DEFAULT_ROD_SPEC
    report = "\n".join(
        [
            "Rod overlay calibration",
            "projection_source=cadquery.exporters.getSVG",
            "projection_dir=(0,-1,0)",
            f"rod_length_mm={spec.length_mm}",
            f"rod_diameter_mm={spec.diameter_mm}",
            f"projection_bbox_min_x_mm={projection.min_x}",
            f"projection_bbox_max_x_mm={projection.max_x}",
            f"projection_bbox_min_y_mm={projection.min_y}",
            f"projection_bbox_max_y_mm={projection.max_y}",
            f"under_head_x_px={calibration.under_head_x_px}",
            f"tip_x_px={calibration.tip_x_px}",
            f"shaft_top_y_px={calibration.shaft_top_y_px}",
            f"shaft_bottom_y_px={calibration.shaft_bottom_y_px}",
            f"px_per_mm_x={calibration.px_per_mm_x:.6f}",
            f"px_per_mm_y={calibration.px_per_mm_y:.6f}",
            f"mm_per_px_x={calibration.mm_per_px_x:.6f}",
            f"mm_per_px_y={calibration.mm_per_px_y:.6f}",
            f"relative_scale_delta={calibration.relative_scale_delta:.6%}",
        ]
    )
    output_path.write_text(report + "\n", encoding="ascii")


def render_rod_overlay() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    source_path = repo_root / "ref" / "alibaba-image-preview.png"
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    if not source_path.exists():
        raise FileNotFoundError(f"Reference image not found: {source_path}")

    source = Image.open(source_path)
    rod = build_rod(DEFAULT_ROD_SPEC)
    canonical_svg = canonical_side_projection_svg(rod)
    projection = projection_from_svg(canonical_svg)

    canonical_svg_path = export_dir / "rod_projection_canonical.svg"
    canonical_png_path = export_dir / "rod_projection_canonical.png"
    original_overlay_path = export_dir / "rod_overlay_original.png"
    rectified_reference_path = export_dir / "reference_side_rectified.png"
    rectified_overlay_path = export_dir / "rod_overlay_rectified.png"
    report_path = export_dir / "rod_overlay_report.txt"

    canonical_svg_path.write_text(canonical_svg, encoding="utf-8")
    _export_canonical_projection(projection, canonical_png_path)
    _draw_original_overlay(source, projection, original_overlay_path)
    _draw_rectified_overlay(
        source,
        projection,
        output_reference_path=rectified_reference_path,
        output_overlay_path=rectified_overlay_path,
    )
    _write_report(report_path, projection)

    print(f"exported {canonical_svg_path}")
    print(f"exported {canonical_png_path}")
    print(f"exported {original_overlay_path}")
    print(f"exported {rectified_reference_path}")
    print(f"exported {rectified_overlay_path}")
    print(f"exported {report_path}")


if __name__ == "__main__":
    render_rod_overlay()
