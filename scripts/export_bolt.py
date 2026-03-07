from __future__ import annotations

import argparse
from pathlib import Path

import cadquery as cq

from cad.bolt import build_bolt, build_bolt_canonical, build_bolt_discrete
from cad.params import BoltSpec, DEFAULT_BOLT_SPEC, M6_BOLT_SPEC
from cad.projection import projection_from_svg


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a parametric bolt model")
    parser.add_argument("--size", choices=("m5", "m6"), default="m5")
    parser.add_argument("--no-previews", action="store_true")
    parser.add_argument("--discrete", action="store_true")
    return parser.parse_args()


def spec_for_size(size: str) -> BoltSpec:
    if size == "m5":
        return DEFAULT_BOLT_SPEC
    if size == "m6":
        return M6_BOLT_SPEC
    raise ValueError(f"Unsupported size: {size}")


def export_bolt(
    spec: BoltSpec,
    size_label: str,
    render_previews: bool = True,
    discrete: bool = False,
) -> None:
    repo_root = Path(__file__).resolve().parent.parent
    export_dir = repo_root / "exports"
    export_dir.mkdir(exist_ok=True)

    suffix = "_discrete" if discrete else ""
    bolt = build_bolt_discrete(spec) if discrete else build_bolt(spec)

    step_path = export_dir / f"bolt_{size_label}{suffix}.step"
    stl_path = export_dir / f"bolt_{size_label}{suffix}.stl"

    cq.exporters.export(bolt, str(step_path))
    cq.exporters.export(bolt, str(stl_path))

    print(f"exported {step_path}")
    print(f"exported {stl_path}")

    if discrete or not render_previews:
        return

    canonical = build_bolt_canonical(spec)
    side_svg_path = export_dir / f"bolt_{size_label}_side.svg"
    side_png_path = export_dir / f"bolt_{size_label}_side.png"
    top_svg_path = export_dir / f"bolt_{size_label}_top.svg"
    top_png_path = export_dir / f"bolt_{size_label}_top.png"
    iso_svg_path = export_dir / f"bolt_{size_label}_iso.svg"
    iso_png_path = export_dir / f"bolt_{size_label}_iso.png"

    side_svg = projected_svg(canonical, projection_dir=(0, 0, 1), width=900, height=320)
    side_svg_path.write_text(side_svg, encoding="utf-8")
    _render_projection_png(projection_from_svg(side_svg), side_png_path)

    top_svg = projected_svg(canonical, projection_dir=(1, 0, 0), width=500, height=500)
    top_svg_path.write_text(top_svg, encoding="utf-8")
    _render_projection_png(projection_from_svg(top_svg), top_png_path)

    iso_svg = projected_svg(canonical, projection_dir=(1, -1, 1), width=700, height=500)
    iso_svg_path.write_text(iso_svg, encoding="utf-8")
    _render_projection_png(projection_from_svg(iso_svg), iso_png_path)

    print(f"exported {side_svg_path}")
    print(f"exported {side_png_path}")
    print(f"exported {top_svg_path}")
    print(f"exported {top_png_path}")
    print(f"exported {iso_svg_path}")
    print(f"exported {iso_png_path}")


def projected_svg(
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


def _render_projection_png(projection, output_path: Path, pixels_per_mm: float = 30.0, margin_px: int = 20) -> None:
    from PIL import Image, ImageDraw

    image = Image.new(
        "RGBA",
        (
            round(projection.width * pixels_per_mm) + margin_px * 2,
            round(projection.height * pixels_per_mm) + margin_px * 2,
        ),
        (255, 255, 255, 255),
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


if __name__ == "__main__":
    args = parse_args()
    export_bolt(
        spec_for_size(args.size),
        args.size,
        render_previews=not args.no_previews,
        discrete=args.discrete,
    )
