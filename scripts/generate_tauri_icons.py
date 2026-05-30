"""Generate deterministic Tauri desktop icons without external image tools.

The release workflow builds on Windows, Linux, and macOS. Tauri's bundler
expects platform-specific icon assets, so this script writes a small icon set
from a single in-repo drawing routine. The artwork is intentionally simple:
the important invariant is reproducibility, not branding polish.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"


Color = tuple[int, int, int, int]
Image = list[list[Color]]


def _clamp_channel(value: float) -> int:
    return max(0, min(255, int(round(value))))


def _mix(a: Color, b: Color, t: float) -> Color:
    return (
        _clamp_channel(a[0] * (1 - t) + b[0] * t),
        _clamp_channel(a[1] * (1 - t) + b[1] * t),
        _clamp_channel(a[2] * (1 - t) + b[2] * t),
        _clamp_channel(a[3] * (1 - t) + b[3] * t),
    )


def _blend(dst: Color, src: Color, alpha: float) -> Color:
    a = max(0.0, min(1.0, alpha * (src[3] / 255)))
    return (
        _clamp_channel(dst[0] * (1 - a) + src[0] * a),
        _clamp_channel(dst[1] * (1 - a) + src[1] * a),
        _clamp_channel(dst[2] * (1 - a) + src[2] * a),
        255,
    )


def _empty_image(size: int) -> Image:
    image: Image = []
    center = (size - 1) / 2
    radius = center * 1.35
    top = (15, 27, 49, 255)
    bottom = (16, 112, 111, 255)
    for y in range(size):
        row: list[Color] = []
        for x in range(size):
            vertical = y / max(1, size - 1)
            radial = math.hypot(x - center, y - center) / radius
            base = _mix(top, bottom, vertical * 0.75 + radial * 0.25)
            row.append(base)
        image.append(row)
    return image


def _draw_disc(image: Image, cx: float, cy: float, radius: float, color: Color, alpha: float = 1) -> None:
    size = len(image)
    inner = max(0.0, radius - 1.5)
    outer = radius + 1.5
    min_x = max(0, int(cx - outer - 1))
    max_x = min(size - 1, int(cx + outer + 1))
    min_y = max(0, int(cy - outer - 1))
    max_y = min(size - 1, int(cy + outer + 1))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            distance = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if distance <= outer:
                coverage = 1.0 if distance <= inner else max(0.0, outer - distance) / max(0.1, outer - inner)
                image[y][x] = _blend(image[y][x], color, coverage * alpha)


def _draw_line(
    image: Image,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    width: float,
    color: Color,
    alpha: float = 1,
) -> None:
    size = len(image)
    min_x = max(0, int(min(x0, x1) - width - 2))
    max_x = min(size - 1, int(max(x0, x1) + width + 2))
    min_y = max(0, int(min(y0, y1) - width - 2))
    max_y = min(size - 1, int(max(y0, y1) + width + 2))
    dx = x1 - x0
    dy = y1 - y0
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            py = y + 0.5
            t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / length_sq))
            nearest_x = x0 + t * dx
            nearest_y = y0 + t * dy
            distance = math.hypot(px - nearest_x, py - nearest_y)
            if distance <= width:
                coverage = 1.0 if distance <= width - 1 else max(0.0, width - distance)
                image[y][x] = _blend(image[y][x], color, coverage * alpha)


def _draw_ring(image: Image, cx: float, cy: float, rx: float, ry: float, rotation: float, width: float, color: Color) -> None:
    points: list[tuple[float, float]] = []
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)
    for step in range(144):
        theta = 2 * math.pi * step / 144
        x = rx * math.cos(theta)
        y = ry * math.sin(theta)
        points.append((cx + x * cos_r - y * sin_r, cy + x * sin_r + y * cos_r))
    for index, (x0, y0) in enumerate(points):
        x1, y1 = points[(index + 1) % len(points)]
        _draw_line(image, x0, y0, x1, y1, width, color, 0.72)


def _draw_icon(size: int) -> Image:
    image = _empty_image(size)
    c = size / 2
    accent = (245, 198, 80, 255)
    teal = (69, 211, 194, 255)
    blue = (113, 173, 255, 255)
    white = (248, 252, 255, 255)

    _draw_disc(image, c, c, size * 0.405, (6, 13, 27, 255), 0.64)
    _draw_ring(image, c, c, size * 0.34, size * 0.155, 0.0, max(1.4, size * 0.011), teal)
    _draw_ring(image, c, c, size * 0.34, size * 0.155, math.pi / 3, max(1.4, size * 0.011), blue)
    _draw_ring(image, c, c, size * 0.34, size * 0.155, -math.pi / 3, max(1.4, size * 0.011), accent)

    vertices = []
    for step in range(6):
        theta = math.pi / 6 + step * math.pi / 3
        vertices.append((c + math.cos(theta) * size * 0.255, c + math.sin(theta) * size * 0.255))
    for index, (x0, y0) in enumerate(vertices):
        x1, y1 = vertices[(index + 1) % len(vertices)]
        _draw_line(image, x0, y0, x1, y1, max(1.6, size * 0.014), white, 0.9)
    for x, y in vertices:
        _draw_disc(image, x, y, max(2.2, size * 0.026), accent, 0.95)
    _draw_disc(image, c, c, max(3.0, size * 0.038), white, 0.95)

    return image


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def _encode_png(image: Image) -> bytes:
    height = len(image)
    width = len(image[0])
    raw = bytearray()
    for row in image:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    return b"\x89PNG\r\n\x1a\n" + b"".join(
        [
            _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            _png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            _png_chunk(b"IEND", b""),
        ]
    )


def _resize_nearest(image: Image, target_size: int) -> Image:
    source_size = len(image)
    if source_size == target_size:
        return image
    resized: Image = []
    for y in range(target_size):
        row: list[Color] = []
        sy = min(source_size - 1, int(y * source_size / target_size))
        for x in range(target_size):
            sx = min(source_size - 1, int(x * source_size / target_size))
            row.append(image[sy][sx])
        resized.append(row)
    return resized


def _write_ico(entries: dict[int, bytes], path: Path) -> None:
    sizes = sorted(entries)
    header = struct.pack("<HHH", 0, 1, len(sizes))
    directory = bytearray()
    data = bytearray()
    offset = 6 + len(sizes) * 16
    for size in sizes:
        png = entries[size]
        width = 0 if size == 256 else size
        directory.extend(struct.pack("<BBBBHHII", width, width, 0, 0, 1, 32, len(png), offset))
        data.extend(png)
        offset += len(png)
    path.write_bytes(header + bytes(directory) + bytes(data))


def _write_icns(entries: dict[str, bytes], path: Path) -> None:
    chunks = bytearray()
    for kind, png in entries.items():
        chunks.extend(kind.encode("ascii"))
        chunks.extend(struct.pack(">I", len(png) + 8))
        chunks.extend(png)
    path.write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + bytes(chunks))


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    source = _draw_icon(1024)
    png_by_size: dict[int, bytes] = {}
    for size in (16, 32, 48, 64, 128, 256, 512, 1024):
        png_by_size[size] = _encode_png(_resize_nearest(source, size))

    outputs = {
        "icon.png": png_by_size[512],
        "32x32.png": png_by_size[32],
        "128x128.png": png_by_size[128],
        "128x128@2x.png": png_by_size[256],
    }
    for name, content in outputs.items():
        (ICON_DIR / name).write_bytes(content)

    _write_ico({size: png_by_size[size] for size in (16, 32, 48, 64, 128, 256)}, ICON_DIR / "icon.ico")
    _write_icns(
        {
            "icp4": png_by_size[16],
            "icp5": png_by_size[32],
            "icp6": png_by_size[64],
            "ic07": png_by_size[128],
            "ic08": png_by_size[256],
            "ic09": png_by_size[512],
            "ic10": png_by_size[1024],
        },
        ICON_DIR / "icon.icns",
    )


if __name__ == "__main__":
    main()
