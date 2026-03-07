from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from vtkmodules.util.numpy_support import vtk_to_numpy
from vtkmodules.vtkIOGeometry import vtkSTLReader


ViewName = Literal["side", "top"]


@dataclass(frozen=True)
class ReferenceMesh:
    points_mm: np.ndarray
    faces: np.ndarray
    source_bounds_m: tuple[float, float, float, float, float, float]

    @property
    def bounds_mm(self) -> tuple[float, float, float, float, float, float]:
        mins = self.points_mm.min(axis=0)
        maxs = self.points_mm.max(axis=0)
        return (
            float(mins[0]),
            float(maxs[0]),
            float(mins[1]),
            float(maxs[1]),
            float(mins[2]),
            float(maxs[2]),
        )


@dataclass(frozen=True)
class ProjectedMesh:
    triangles_uv: np.ndarray
    triangle_depths: np.ndarray
    triangle_shades: np.ndarray
    min_u: float
    max_u: float
    min_v: float
    max_v: float

    @property
    def width(self) -> float:
        return self.max_u - self.min_u

    @property
    def height(self) -> float:
        return self.max_v - self.min_v


def load_reference_stl(path: Path) -> ReferenceMesh:
    reader = vtkSTLReader()
    reader.SetFileName(str(path))
    reader.Update()
    poly = reader.GetOutput()

    points_m = vtk_to_numpy(poly.GetPoints().GetData()).astype(float)
    polys = vtk_to_numpy(poly.GetPolys().GetData()).reshape(-1, 4)
    face_sizes = polys[:, 0]
    if not np.all(face_sizes == 3):
        raise ValueError("Expected only triangles in STL polydata")

    faces = polys[:, 1:4].astype(int)

    # The reference STL is axis-aligned already:
    # original z axis is the fastener axis, x/y form the radial plane.
    # Convert to a canonical mm frame:
    # - canonical x: fastener length, increasing from under-head toward tip
    # - canonical y/z: radial plane
    points_mm = np.column_stack(
        [
            -points_m[:, 2] * 1000.0,
            points_m[:, 0] * 1000.0,
            points_m[:, 1] * 1000.0,
        ]
    )

    return ReferenceMesh(
        points_mm=points_mm,
        faces=faces,
        source_bounds_m=tuple(float(value) for value in poly.GetBounds()),
    )


def project_reference_mesh(mesh: ReferenceMesh, view: ViewName) -> ProjectedMesh:
    points = mesh.points_mm
    faces = mesh.faces
    triangles_3d = points[faces]

    if view == "side":
        triangles_uv = triangles_3d[:, :, [0, 2]]
        triangle_depths = triangles_3d[:, :, 1].mean(axis=1)
        light_dir = _normalize(np.array([0.2, 1.0, 0.5]))
    elif view == "top":
        triangles_uv = triangles_3d[:, :, [1, 2]]
        # Look from the head side toward the tip so the socket is visible.
        face_x = triangles_3d[:, :, 0].mean(axis=1)
        triangle_depths = -face_x
        light_dir = _normalize(np.array([-1.0, -0.25, 0.8]))
    else:
        raise ValueError(f"Unsupported view: {view}")

    normals = np.cross(
        triangles_3d[:, 1] - triangles_3d[:, 0],
        triangles_3d[:, 2] - triangles_3d[:, 0],
    )
    normal_lengths = np.linalg.norm(normals, axis=1)
    safe_normals = normals.copy()
    safe_normals[normal_lengths > 0] /= normal_lengths[normal_lengths > 0][:, None]

    # Use absolute lighting so inconsistent triangle winding in the STL
    # does not produce black patches.
    intensity = np.abs(safe_normals @ light_dir)
    normal_shade = 45.0 + 190.0 * np.clip(intensity, 0.0, 1.0)

    if view == "top":
        face_x = triangles_3d[:, :, 0].mean(axis=1)
        near = face_x.min()
        far = face_x.max()
        depth_norm = (face_x - near) / max(far - near, 1e-9)
        depth_shade = 235.0 - 150.0 * np.clip(depth_norm, 0.0, 1.0)
        triangle_shades = 0.35 * normal_shade + 0.65 * depth_shade
    else:
        triangle_shades = normal_shade

    mins = triangles_uv.reshape(-1, 2).min(axis=0)
    maxs = triangles_uv.reshape(-1, 2).max(axis=0)
    return ProjectedMesh(
        triangles_uv=triangles_uv,
        triangle_depths=triangle_depths,
        triangle_shades=triangle_shades,
        min_u=float(mins[0]),
        max_u=float(maxs[0]),
        min_v=float(mins[1]),
        max_v=float(maxs[1]),
    )


def _normalize(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector
    return vector / norm
