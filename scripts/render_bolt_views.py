from __future__ import annotations

import argparse
from pathlib import Path

import cadquery as cq
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from cad.bolt import build_bolt_canonical, build_smooth_bolt
from cad.calibration import DEFAULT_SIDE_VIEW_CALIBRATION
from cad.params import BoltSpec, DEFAULT_BOLT_SPEC, M6_BOLT_SPEC
from cad.projection import Projection2D, projection_from_svg
from cad.reference_stl import ProjectedMesh, load_reference_stl, project_reference_mesh
from cad.torx import T25_PROFILE_POINTS_MM


MODEL_OUTLINE_RGBA = (0, 160, 0, 255)
BACKGROUND_RGBA = (255, 255, 255, 255)
DRAWING_LINE_RGBA = (0, 0, 0, 255)
DIMENSION_RGBA = (32, 32, 32, 255)
CENTERLINE_RGBA = (150, 150, 150, 255)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render side and top views for a bolt model")
    parser.add_argument("--size", choices=("m5", "m6"), default="m5")
    return parser.parse_args()


def spec_for_size(size: str) -> BoltSpec:
    if size == "m5":
        return DEFAULT_BOLT_SPEC
    if size == "m6":
        return M6_BOLT_SPEC
    raise ValueError(f"Unsupported size: {size}")


def render_bolt_views(size: str) -> None:
    repo_root = Path(__file__).resolve().parent.parent
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    spec = spec_for_size(size)
    threaded_canonical = build_bolt_canonical(spec)
    smooth_canonical = build_smooth_bolt(spec).rotate((0, 0, 0), (0, 1, 0), 90)

    side_svg = _projected_svg(threaded_canonical, projection_dir=(0, 0, 1), width=900, height=320)
    top_svg = _projected_svg(smooth_canonical, projection_dir=(-1, 0, 0), width=500, height=500)

    side_projection = projection_from_svg(side_svg)
    top_projection = projection_from_svg(top_svg)

    side_svg_path = export_dir / f"bolt_{size}_side.svg"
    side_png_path = export_dir / f"bolt_{size}_side.png"
    top_svg_path = export_dir / f"bolt_{size}_top.svg"
    top_png_path = export_dir / f"bolt_{size}_top.png"

    side_svg_path.write_text(side_svg, encoding="utf-8")
    top_svg_path.write_text(top_svg, encoding="utf-8")
    _render_projection_png(side_projection, side_png_path)
    _render_projection_png(top_projection, top_png_path, pixels_per_mm=40.0)

    annotated_png_path = export_dir / f"bolt_{size}_annotated.png"
    _render_annotated_sheet(spec, side_projection, top_projection, annotated_png_path)

    print(f"exported {side_svg_path}")
    print(f"exported {side_png_path}")
    print(f"exported {top_svg_path}")
    print(f"exported {top_png_path}")
    print(f"exported {annotated_png_path}")

    if size == "m5":
        reference_image_path = repo_root / "ref" / "alibaba-image-preview.png"
        reference_stl_path = repo_root / "ref" / "M5x18-20241126.stl"

        if not reference_image_path.exists():
            raise FileNotFoundError(f"Reference image not found: {reference_image_path}")
        if not reference_stl_path.exists():
            raise FileNotFoundError(f"Reference STL not found: {reference_stl_path}")

        source = Image.open(reference_image_path).convert("RGBA")
        original_overlay_path = export_dir / "bolt_m5_side_overlay_original.png"
        rectified_reference_path = export_dir / "bolt_m5_side_reference_rectified.png"
        rectified_overlay_path = export_dir / "bolt_m5_side_overlay_rectified.png"

        _draw_side_overlay_original(source, side_projection, original_overlay_path)
        _draw_side_overlay_rectified(
            source,
            side_projection,
            output_reference_path=rectified_reference_path,
            output_overlay_path=rectified_overlay_path,
        )

        mesh = load_reference_stl(reference_stl_path)
        reference_top = project_reference_mesh(mesh, view="top")
        top_overlay_path = export_dir / "bolt_m5_top_overlay.png"
        _render_top_reference_overlay(reference_top, top_projection, top_overlay_path)

        print(f"exported {original_overlay_path}")
        print(f"exported {rectified_reference_path}")
        print(f"exported {rectified_overlay_path}")
        print(f"exported {top_overlay_path}")


def _projected_svg(
    shape: cq.Workplane,
    projection_dir: tuple[float, float, float],
    width: int,
    height: int,
) -> str:
    return cq.exporters.getSVG(
        shape.val(),
        opts={
            "width": width,
            "height": height,
            "marginLeft": 20,
            "marginTop": 20,
            "projectionDir": projection_dir,
            "showAxes": False,
            "showHidden": False,
        },
    )
def _render_projection_png(
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
        BACKGROUND_RGBA,
    )
    draw = ImageDraw.Draw(image, "RGBA")
    for path in projection.paths:
        mapped = [
            (
                margin_px + (point[0] - projection.min_x) * pixels_per_mm,
                margin_px + (projection.max_y - point[1]) * pixels_per_mm,
            )
            for point in path
        ]
        if len(mapped) >= 2:
            draw.line(mapped, fill=(0, 0, 0, 255), width=max(2, round(pixels_per_mm * 0.08)))
    image.save(output_path)


def _draw_side_overlay_original(source: Image.Image, projection: Projection2D, output_path: Path) -> None:
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
        color=MODEL_OUTLINE_RGBA,
        width=2,
    )

    Image.alpha_composite(source, layer).save(output_path)


def _draw_side_overlay_rectified(
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
    under_head_x = (calibration.under_head_x_px - calibration.crop_left_px) * scale_x
    center_y = (calibration.center_y_px - calibration.crop_top_px) * scale_y

    _draw_projection_paths(
        draw=draw,
        projection=projection,
        point_mapper=lambda point: (
            under_head_x + point[0] * pixels_per_mm,
            center_y - point[1] * pixels_per_mm,
        ),
        color=MODEL_OUTLINE_RGBA,
        width=max(2, round(pixels_per_mm * 0.08)),
    )

    Image.alpha_composite(overlay, layer).save(output_overlay_path)


def _render_top_reference_overlay(
    reference_projection: ProjectedMesh,
    model_projection: Projection2D,
    output_path: Path,
    pixels_per_mm: float = 40.0,
    margin_px: int = 20,
) -> None:
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


def _draw_projection_paths(draw: ImageDraw.ImageDraw, projection: Projection2D, point_mapper, color, width: int) -> None:
    for path in projection.paths:
        mapped = [point_mapper(point) for point in path]
        if len(mapped) >= 2:
            draw.line(mapped, fill=color, width=width)


def _render_annotated_sheet(
    spec: BoltSpec,
    side_projection: Projection2D,
    top_projection: Projection2D,
    output_path: Path,
) -> None:
    canvas_width = 1180
    canvas_height = 420
    side_scale_px_per_mm = 28.0
    top_scale_px_per_mm = 34.0
    side_origin_x_px = 205.0
    side_center_y_px = 225.0
    top_center_x_px = 960.0
    top_center_y_px = side_center_y_px

    image = Image.new("RGBA", (canvas_width, canvas_height), BACKGROUND_RGBA)
    draw = ImageDraw.Draw(image, "RGBA")
    font = _load_font(16)
    small_font = _load_font(14)

    side_mapper = lambda point: (
        side_origin_x_px + point[0] * side_scale_px_per_mm,
        side_center_y_px - point[1] * side_scale_px_per_mm,
    )
    top_mapper = lambda point: (
        top_center_x_px + point[0] * top_scale_px_per_mm,
        top_center_y_px - point[1] * top_scale_px_per_mm,
    )

    _draw_projection_paths(draw, side_projection, side_mapper, DRAWING_LINE_RGBA, 2)
    _draw_projection_paths(draw, top_projection, top_mapper, DRAWING_LINE_RGBA, 2)
    _draw_side_socket_hidden_outline(draw, side_mapper, spec)

    _draw_dashed_line(
        draw,
        side_mapper((-spec.head_height_mm - 0.9, 0.0)),
        side_mapper((spec.under_head_length_mm + 1.2, 0.0)),
        CENTERLINE_RGBA,
    )
    _draw_dashed_line(
        draw,
        top_mapper((-spec.head_radius_mm - 0.6, 0.0)),
        top_mapper((spec.head_radius_mm + 0.6, 0.0)),
        CENTERLINE_RGBA,
    )
    _draw_dashed_line(
        draw,
        top_mapper((0.0, -spec.head_radius_mm - 0.6)),
        top_mapper((0.0, spec.head_radius_mm + 0.6)),
        CENTERLINE_RGBA,
    )

    top_of_head_mm = spec.head_radius_mm
    top_of_shank_mm = spec.major_radius_mm
    overall_dim_y_mm = top_of_head_mm + 2.4
    threaded_dim_y_mm = top_of_shank_mm + 1.8
    head_dim_y_mm = top_of_head_mm + 1.2
    bottom_dim_y_mm = -spec.head_radius_mm - 1.8
    left_dim_x_mm = -spec.head_height_mm - 1.6
    shank_dim_x_mm = spec.thread_start_mm * 0.55
    thread_note_x_mm = spec.under_head_length_mm + 1.8

    _draw_horizontal_dimension(
        image,
        draw,
        side_mapper,
        x1_mm=0.0,
        x2_mm=spec.under_head_length_mm,
        feature_y_mm=top_of_head_mm,
        dim_y_mm=overall_dim_y_mm,
        text=_format_dim(spec.under_head_length_mm),
        font=font,
    )
    _draw_horizontal_dimension(
        image,
        draw,
        side_mapper,
        x1_mm=spec.thread_start_mm,
        x2_mm=spec.under_head_length_mm,
        feature_y_mm=top_of_shank_mm,
        dim_y_mm=threaded_dim_y_mm,
        text=_format_dim(spec.threaded_length_mm),
        font=font,
    )
    _draw_horizontal_dimension(
        image,
        draw,
        side_mapper,
        x1_mm=-spec.head_height_mm,
        x2_mm=0.0,
        feature_y_mm=top_of_head_mm,
        dim_y_mm=head_dim_y_mm,
        text=_format_dim(spec.head_height_mm),
        font=font,
    )
    _draw_horizontal_dimension(
        image,
        draw,
        side_mapper,
        x1_mm=-spec.head_height_mm,
        x2_mm=-spec.head_height_mm + spec.drive_depth_mm,
        feature_y_mm=-spec.head_radius_mm,
        dim_y_mm=bottom_dim_y_mm,
        text=_format_dim(spec.drive_depth_mm),
        font=font,
    )
    _draw_vertical_dimension(
        image,
        draw,
        side_mapper,
        x_mm=left_dim_x_mm,
        y1_mm=-spec.head_radius_mm,
        y2_mm=spec.head_radius_mm,
        feature_x_mm=-spec.head_height_mm,
        text=f"\u2300{_format_dim(spec.head_diameter_mm)}",
        font=font,
    )
    _draw_vertical_dimension(
        image,
        draw,
        side_mapper,
        x_mm=shank_dim_x_mm,
        y1_mm=-spec.major_radius_mm,
        y2_mm=spec.major_radius_mm,
        feature_x_mm=spec.thread_start_mm * 0.72,
        text=f"\u2300{_format_dim(spec.nominal_diameter_mm)}",
        font=font,
    )

    _draw_rotated_text_with_background(
        image,
        side_mapper((thread_note_x_mm, 0.0)),
        f"M{int(round(spec.nominal_diameter_mm))}",
        small_font,
        angle=90,
    )

    t25_target = min(T25_PROFILE_POINTS_MM, key=lambda point: point[1])
    t25_target_px = top_mapper(t25_target)
    t25_text_pos = (top_center_x_px - 76, top_center_y_px + spec.head_radius_mm * top_scale_px_per_mm + 32)
    t25_elbow = (top_center_x_px - 30, top_center_y_px + spec.head_radius_mm * top_scale_px_per_mm + 10)
    draw.line([t25_text_pos, t25_elbow, t25_target_px], fill=DIMENSION_RGBA, width=1)
    _draw_text_with_background(image, t25_text_pos, "T25", font, anchor="lt")

    image.save(output_path)


def _draw_side_socket_hidden_outline(draw: ImageDraw.ImageDraw, mapper, spec: BoltSpec) -> None:
    socket_half_height_mm = max(abs(point[1]) for point in T25_PROFILE_POINTS_MM)
    x_start_mm = -spec.head_height_mm
    x_end_mm = x_start_mm + spec.drive_depth_mm
    y_top_mm = socket_half_height_mm
    y_bottom_mm = -socket_half_height_mm

    _draw_dashed_line(draw, mapper((x_start_mm, y_top_mm)), mapper((x_end_mm, y_top_mm)), CENTERLINE_RGBA)
    _draw_dashed_line(draw, mapper((x_start_mm, y_bottom_mm)), mapper((x_end_mm, y_bottom_mm)), CENTERLINE_RGBA)
    _draw_dashed_line(draw, mapper((x_end_mm, y_bottom_mm)), mapper((x_end_mm, y_top_mm)), CENTERLINE_RGBA)


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for font_name in ("DejaVuSans.ttf", "DejaVuSansMono.ttf"):
        try:
            return ImageFont.truetype(font_name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _format_dim(value: float) -> str:
    if abs(value - round(value)) < 1e-6:
        return str(int(round(value)))
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    color,
    dash_px: float = 8.0,
    gap_px: float = 5.0,
) -> None:
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    length = float((dx * dx + dy * dy) ** 0.5)
    if length <= 0.0:
        return
    ux = dx / length
    uy = dy / length
    distance = 0.0
    while distance < length:
        seg_start = distance
        seg_end = min(distance + dash_px, length)
        draw.line(
            [
                (x1 + ux * seg_start, y1 + uy * seg_start),
                (x1 + ux * seg_end, y1 + uy * seg_end),
            ],
            fill=color,
            width=1,
        )
        distance += dash_px + gap_px


def _draw_horizontal_dimension(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    mapper,
    x1_mm: float,
    x2_mm: float,
    feature_y_mm: float,
    dim_y_mm: float,
    text: str,
    font,
) -> None:
    p1_feature = mapper((x1_mm, feature_y_mm))
    p2_feature = mapper((x2_mm, feature_y_mm))
    p1_dim = mapper((x1_mm, dim_y_mm))
    p2_dim = mapper((x2_mm, dim_y_mm))
    draw.line([p1_feature, p1_dim], fill=DIMENSION_RGBA, width=1)
    draw.line([p2_feature, p2_dim], fill=DIMENSION_RGBA, width=1)
    draw.line([p1_dim, p2_dim], fill=DIMENSION_RGBA, width=1)
    _draw_arrowhead(draw, p1_dim, (1.0, 0.0))
    _draw_arrowhead(draw, p2_dim, (-1.0, 0.0))
    mid = ((p1_dim[0] + p2_dim[0]) / 2.0, p1_dim[1] - 8.0)
    _draw_text_with_background(image, mid, text, font, anchor="mm")


def _draw_vertical_dimension(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    mapper,
    x_mm: float,
    y1_mm: float,
    y2_mm: float,
    feature_x_mm: float,
    text: str,
    font,
) -> None:
    p1_feature = mapper((feature_x_mm, y1_mm))
    p2_feature = mapper((feature_x_mm, y2_mm))
    p1_dim = mapper((x_mm, y1_mm))
    p2_dim = mapper((x_mm, y2_mm))
    draw.line([p1_feature, p1_dim], fill=DIMENSION_RGBA, width=1)
    draw.line([p2_feature, p2_dim], fill=DIMENSION_RGBA, width=1)
    draw.line([p1_dim, p2_dim], fill=DIMENSION_RGBA, width=1)
    _draw_arrowhead(draw, p1_dim, (0.0, -1.0))
    _draw_arrowhead(draw, p2_dim, (0.0, 1.0))
    mid = (p1_dim[0] - 12.0, (p1_dim[1] + p2_dim[1]) / 2.0)
    _draw_rotated_text_with_background(image, mid, text, font, angle=90)


def _draw_arrowhead(draw: ImageDraw.ImageDraw, tip: tuple[float, float], direction: tuple[float, float]) -> None:
    dx, dy = direction
    length = float((dx * dx + dy * dy) ** 0.5)
    if length <= 0.0:
        return
    ux = dx / length
    uy = dy / length
    px = -uy
    py = ux
    arrow_length = 9.0
    arrow_half_width = 3.5
    base = (tip[0] - ux * arrow_length, tip[1] - uy * arrow_length)
    p1 = (base[0] + px * arrow_half_width, base[1] + py * arrow_half_width)
    p2 = (base[0] - px * arrow_half_width, base[1] - py * arrow_half_width)
    draw.polygon([tip, p1, p2], fill=DIMENSION_RGBA)


def _draw_text_with_background(image: Image.Image, position: tuple[float, float], text: str, font, anchor: str) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    bbox = draw.textbbox(position, text, font=font, anchor=anchor)
    padding = 2
    bg_box = (bbox[0] - padding, bbox[1] - padding, bbox[2] + padding, bbox[3] + padding)
    draw.rectangle(bg_box, fill=BACKGROUND_RGBA)
    draw.text(position, text, font=font, fill=DIMENSION_RGBA, anchor=anchor)


def _draw_rotated_text_with_background(
    image: Image.Image,
    center: tuple[float, float],
    text: str,
    font,
    angle: float,
) -> None:
    temp = Image.new("RGBA", (160, 80), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp, "RGBA")
    bbox = temp_draw.textbbox((80, 40), text, font=font, anchor="mm")
    padding = 2
    bg_box = (bbox[0] - padding, bbox[1] - padding, bbox[2] + padding, bbox[3] + padding)
    temp_draw.rectangle(bg_box, fill=BACKGROUND_RGBA)
    temp_draw.text((80, 40), text, font=font, fill=DIMENSION_RGBA, anchor="mm")
    rotated = temp.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    upper_left = (
        int(round(center[0] - rotated.width / 2.0)),
        int(round(center[1] - rotated.height / 2.0)),
    )
    image.alpha_composite(rotated, upper_left)


if __name__ == "__main__":
    args = parse_args()
    render_bolt_views(args.size)
