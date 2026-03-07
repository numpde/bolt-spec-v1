from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path

import cadquery as cq
from PIL import Image, ImageDraw

from cad.bolt import build_bolt, build_bolt_canonical
from cad.params import BoltSpec, DEFAULT_BOLT_SPEC, M6_BOLT_SPEC
from cad.projection import projection_from_svg


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export comparable head-runout variants")
    parser.add_argument("--size", choices=("m5", "m6"), default="m5")
    parser.add_argument("--threaded-length-mm", type=float)
    return parser.parse_args()


def spec_for_size(size: str) -> BoltSpec:
    if size == "m5":
        return DEFAULT_BOLT_SPEC
    if size == "m6":
        return M6_BOLT_SPEC
    raise ValueError(f"Unsupported size: {size}")


def export_runout_variants(base_spec: BoltSpec, size_label: str) -> None:
    repo_root = Path(__file__).resolve().parent.parent
    export_dir = repo_root / "exports" / "runout_variants"
    export_dir.mkdir(parents=True, exist_ok=True)

    variants = [
        (
            "smoothstep_q25",
            "Gentle symmetric fade; slowest exit from the full thread.",
            replace(
                base_spec,
                thread_head_runout_turns=0.25,
                thread_head_runout_profile="smoothstep",
            ),
        ),
        (
            "ease_in_quad_q25",
            "Quarter-turn fade with faster radial escape near the head.",
            replace(
                base_spec,
                thread_head_runout_turns=0.25,
                thread_head_runout_profile="ease_in_quad",
            ),
        ),
        (
            "ease_in_cubic_q25",
            "More aggressive smooth fade; current recommended middle ground.",
            replace(
                base_spec,
                thread_head_runout_turns=0.25,
                thread_head_runout_profile="ease_in_cubic",
            ),
        ),
        (
            "ease_in_quart_q25",
            "Most aggressive quarter-turn fade; shortest visible runout.",
            replace(
                base_spec,
                thread_head_runout_turns=0.25,
                thread_head_runout_profile="ease_in_quart",
            ),
        ),
    ]

    report_lines = [
        f"base_size={size_label}",
        f"nominal_diameter_mm={base_spec.nominal_diameter_mm}",
        f"pitch_mm={base_spec.resolved_pitch_mm}",
        "",
    ]

    for variant_name, description, spec in variants:
        bolt = build_bolt(spec)
        canonical = build_bolt_canonical(spec)

        stl_path = export_dir / f"bolt_{size_label}_{variant_name}.stl"
        iso_svg_path = export_dir / f"bolt_{size_label}_{variant_name}_iso.svg"
        iso_png_path = export_dir / f"bolt_{size_label}_{variant_name}_iso.png"

        cq.exporters.export(bolt, str(stl_path))

        iso_svg = _projected_svg(canonical, projection_dir=(1, -1, 1), width=700, height=500)
        iso_svg_path.write_text(iso_svg, encoding="utf-8")
        _render_projection_png(projection_from_svg(iso_svg), iso_png_path)

        report_lines.extend(
            [
                f"{variant_name}: {description}",
                f"stl={stl_path.name}",
                f"iso={iso_png_path.name}",
                f"runout_turns={spec.thread_head_runout_turns}",
                f"runout_profile={spec.thread_head_runout_profile}",
                "",
            ]
        )

        print(f"exported {stl_path}")
        print(f"exported {iso_svg_path}")
        print(f"exported {iso_png_path}")

    report_path = export_dir / f"bolt_{size_label}_runout_variants_report.txt"
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"exported {report_path}")


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


def _render_projection_png(projection, output_path: Path, pixels_per_mm: float = 24.0, margin_px: int = 20) -> None:
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
    spec = spec_for_size(args.size)
    size_label = args.size
    if args.threaded_length_mm is not None:
        spec = replace(spec, threaded_length_mm=args.threaded_length_mm)
        size_label = f"{args.size}_tl{args.threaded_length_mm:g}"
    export_runout_variants(spec, size_label)
