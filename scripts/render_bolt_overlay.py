from __future__ import annotations

from pathlib import Path

import cadquery as cq
from PIL import Image, ImageDraw

from cad.bolt import build_bolt_canonical
from cad.calibration import DEFAULT_SIDE_VIEW_CALIBRATION
from cad.params import DEFAULT_BOLT_SPEC
from cad.projection import projection_from_svg


BOLT_OUTLINE_RGBA = (0, 160, 0, 255)
ANCHOR_RGBA = (255, 0, 0, 180)


def render_bolt_overlay() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    source_path = repo_root / "ref" / "alibaba-image-preview.png"
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    if not source_path.exists():
        raise FileNotFoundError(f"Reference image not found: {source_path}")

    source = Image.open(source_path).convert("RGBA")
    projection = _side_projection()

    original_overlay_path = export_dir / "bolt_overlay_original.png"
    rectified_reference_path = export_dir / "bolt_reference_side_rectified.png"
    rectified_overlay_path = export_dir / "bolt_overlay_rectified.png"

    _draw_original_overlay(source, projection, original_overlay_path)
    _draw_rectified_overlay(
        source,
        projection,
        output_reference_path=rectified_reference_path,
        output_overlay_path=rectified_overlay_path,
    )

    print(f"exported {original_overlay_path}")
    print(f"exported {rectified_reference_path}")
    print(f"exported {rectified_overlay_path}")


def _side_projection():
    bolt = build_bolt_canonical(DEFAULT_BOLT_SPEC)
    svg = cq.exporters.getSVG(
        bolt.val(),
        opts={
            "width": 900,
            "height": 320,
            "marginLeft": 20,
            "marginTop": 20,
            "projectionDir": (0, 0, 1),
            "showAxes": False,
            "showHidden": False,
        },
    )
    return projection_from_svg(svg)


def _draw_original_overlay(source: Image.Image, projection, output_path: Path) -> None:
    calibration = DEFAULT_SIDE_VIEW_CALIBRATION
    layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: (
            calibration.under_head_x_px + point[0] * calibration.px_per_mm_x,
            calibration.center_y_px - point[1] * calibration.px_per_mm_y,
        ),
        color=BOLT_OUTLINE_RGBA,
        width=2,
    )

    for x in (calibration.under_head_x_px, calibration.tip_x_px):
        draw.line((x, 90, x, 250), fill=ANCHOR_RGBA, width=1)

    Image.alpha_composite(source, layer).save(output_path)


def _draw_rectified_overlay(
    source: Image.Image,
    projection,
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
    under_head_x = (calibration.under_head_x_px - calibration.crop_left_px) * scale_x
    center_y = (calibration.center_y_px - calibration.crop_top_px) * scale_y

    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: (
            under_head_x + point[0] * pixels_per_mm,
            center_y - point[1] * pixels_per_mm,
        ),
        color=BOLT_OUTLINE_RGBA,
        width=max(2, round(pixels_per_mm * 0.08)),
    )
    Image.alpha_composite(overlay, layer).save(output_overlay_path)


def _draw_projection_paths(draw: ImageDraw.ImageDraw, projection, point_mapper, color, width: int) -> None:
    for path in projection.paths:
        mapped = [point_mapper(point) for point in path]
        if len(mapped) >= 2:
            draw.line(mapped, fill=color, width=width)


if __name__ == "__main__":
    render_bolt_overlay()
