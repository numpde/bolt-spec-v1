from __future__ import annotations

from dataclasses import dataclass
import re
import xml.etree.ElementTree as ET

import cadquery as cq


NUMBER_PATTERN = r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?"
TOKEN_PATTERN = re.compile(rf"[MLZmlz]|{NUMBER_PATTERN}")


@dataclass(frozen=True)
class Projection2D:
    paths: tuple[tuple[tuple[float, float], ...], ...]
    min_x: float
    max_x: float
    min_y: float
    max_y: float

    @property
    def width(self) -> float:
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        return self.max_y - self.min_y


def canonical_side_projection_svg(shape: cq.Workplane) -> str:
    """Generate a fixed orthographic side projection as SVG text."""
    return cq.exporters.getSVG(
        shape.val(),
        opts={
            "width": 800,
            "height": 300,
            "marginLeft": 20,
            "marginTop": 20,
            "projectionDir": (0, -1, 0),
            "showAxes": False,
            "showHidden": False,
        },
    )


def projection_from_svg(svg_text: str) -> Projection2D:
    root = ET.fromstring(svg_text)
    paths: list[tuple[tuple[float, float], ...]] = []
    all_points: list[tuple[float, float]] = []

    for element in root.iter():
        if not element.tag.endswith("path"):
            continue
        polyline = _parse_path_points(element.attrib["d"])
        if not polyline:
            continue
        paths.append(tuple(polyline))
        all_points.extend(polyline)

    if not all_points:
        raise ValueError("No projected path data found in SVG export")

    xs = [point[0] for point in all_points]
    ys = [point[1] for point in all_points]
    return Projection2D(
        paths=tuple(paths),
        min_x=min(xs),
        max_x=max(xs),
        min_y=min(ys),
        max_y=max(ys),
    )


def _parse_path_points(path_data: str) -> list[tuple[float, float]]:
    tokens = TOKEN_PATTERN.findall(path_data)
    points: list[tuple[float, float]] = []
    current_command: str | None = None
    index = 0

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            current_command = token
            index += 1
            if current_command in {"Z", "z"}:
                continue

        if current_command not in {"M", "m", "L", "l"}:
            raise ValueError(f"Unsupported SVG path command in projection: {current_command}")

        if index + 1 >= len(tokens):
            break

        x = float(tokens[index])
        y = float(tokens[index + 1])
        points.append((x, y))
        index += 2

    return points
