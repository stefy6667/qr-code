"""
Raster (PNG) QR rendering — a Pillow + numpy re-implementation of the exact
geometry used by qr_style.py's SVG generators (build_svg / build_generic_svg),
used for DTF bulk export where print houses want PNG files instead of SVG,
with a FULLY TRANSPARENT background (no solid color square) so DTF film only
deposits ink where the QR design actually is.

Why not just convert the existing SVGs with cairosvg? cairosvg needs the
system library libcairo2, which isn't guaranteed present on Render's native
Python runtime (no apt-get access in the build step). Pillow and numpy both
ship self-contained wheels with no system library dependency, so they're
safe to add to requirements.txt for this environment.

This module deliberately duplicates qr_style.py's geometry constants (quiet
zone, EC-level rules, radius factors, finder layout) rather than importing
the SVG-string-building internals, since the two renderers draw with
completely different primitives (SVG path strings vs. Pillow polygons).
Keep the two in sync if the look of any preset changes.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from functools import lru_cache


def _ensure_installed(import_name: str, pip_name: str = None) -> None:
    """Self-healing dependency check: if `import_name` isn't importable,
    install it via pip right now instead of crashing.

    Why this exists: this app's Render deploy has a custom Build Command
    that (for reasons outside this code's control — a dashboard setting,
    not anything in the repo) sometimes skips `pip install -r
    requirements.txt` entirely. The previous dependency (segno) never
    exposed this because it's vendored as plain Python source directly in
    the repo. numpy/Pillow ship compiled C extensions and can't be vendored
    that way, so if the build step didn't install them, we install them
    here at first import instead of crash-looping forever.
    """
    try:
        __import__(import_name)
        return
    except ImportError:
        pass
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--quiet', pip_name or import_name])


_ensure_installed('numpy')
_ensure_installed('PIL', 'Pillow')

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from qr_style import PRESETS, GENERIC_PRESETS, SUPPORTED_ICONS

FONT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'fonts', 'DejaVuSans-Bold.ttf')


# ---------------------------------------------------------------------------
# Color / gradient helpers
# ---------------------------------------------------------------------------

def _hex_to_rgb(hex_color: str) -> tuple:
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def _build_colorstop_lut(colorstops: list, lut_size: int = 512) -> np.ndarray:
    """Precompute a small (lut_size, 3) uint8 lookup table across t=0..1,
    so applying a gradient to a full-resolution canvas becomes a single
    fancy-index gather instead of several full-size np.where passes."""
    offsets = np.array([s[0] for s in colorstops], dtype=np.float32)
    colors = np.array([_hex_to_rgb(s[1]) for s in colorstops], dtype=np.float32)
    xs = np.linspace(0, 1, lut_size, dtype=np.float32)
    idx = np.clip(np.searchsorted(offsets, xs, side='right') - 1, 0, len(offsets) - 2)
    o0, o1 = offsets[idx], offsets[idx + 1]
    c0, c1 = colors[idx], colors[idx + 1]
    span = np.maximum(o1 - o0, 1e-9)
    local_t = np.clip((xs - o0) / span, 0, 1)
    lut_colors = c0 + (c1 - c0) * local_t[:, None]
    return np.clip(lut_colors, 0, 255).astype(np.uint8)


def _apply_lut(t: np.ndarray, lut: np.ndarray) -> np.ndarray:
    idx = np.clip((t * (len(lut) - 1)).astype(np.int32), 0, len(lut) - 1)
    return lut[idx]


def _linear_gradient_array(size_px: int, x0, y0, x1, y1, colorstops) -> np.ndarray:
    """Mirrors canvas createLinearGradient / SVG userSpaceOnUse linearGradient.
    x0,y0,x1,y1 are fractions (0..1) of size_px, matching the qrStylePresets
    convention used throughout this codebase."""
    xs = np.linspace(0, 1, size_px, dtype=np.float32)
    ys = np.linspace(0, 1, size_px, dtype=np.float32)
    gx, gy = np.meshgrid(xs, ys)
    dx, dy = x1 - x0, y1 - y0
    denom = dx * dx + dy * dy
    if denom == 0:
        denom = 1e-9
    t = ((gx - x0) * dx + (gy - y0) * dy) / denom
    np.clip(t, 0, 1, out=t)
    return _apply_lut(t, _build_colorstop_lut(colorstops))


def _radial_gradient_array(size_px: int, x0, y0, r0, x1, y1, r1, colorstops) -> np.ndarray:
    """Mirrors canvas createRadialGradient for the concentric case (our only
    actual use — `ember`): two circles sharing the same center, gradient
    interpolated by distance from center between r0 and r1."""
    xs = np.linspace(0, 1, size_px, dtype=np.float32)
    ys = np.linspace(0, 1, size_px, dtype=np.float32)
    gx, gy = np.meshgrid(xs, ys)
    dist = np.sqrt((gx - x1) ** 2 + (gy - y1) ** 2)
    span = max(r1 - r0, 1e-9)
    t = np.clip((dist - r0) / span, 0, 1)
    return _apply_lut(t, _build_colorstop_lut(colorstops))


def _fill_array(fill, size_px: int) -> np.ndarray:
    """Resolve a qrStylePresets-style `fill` (hex string or gradient dict)
    into a (size_px, size_px, 3) uint8 RGB array."""
    if isinstance(fill, str):
        rgb = _hex_to_rgb(fill)
        return np.full((size_px, size_px, 3), rgb, dtype=np.uint8)
    ftype = fill.get('type')
    pos = fill.get('position') or []
    stops = fill.get('colorStops') or []
    if ftype == 'linear-gradient' and len(pos) == 4:
        return _linear_gradient_array(size_px, *pos, stops)
    if ftype == 'radial-gradient' and len(pos) == 6:
        return _radial_gradient_array(size_px, *pos, stops)
    return np.zeros((size_px, size_px, 3), dtype=np.uint8)


# ---------------------------------------------------------------------------
# Module-shape tessellation (per-corner rounded rect, matching
# qr_style.py's `_module_path_per_corner`, but as polygon points for Pillow)
# ---------------------------------------------------------------------------

def _quad_bezier_points(p0, p1, p2, n=6):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


def _module_polygon(x, y, w, h, r, nw, ne, se, sw, n_arc=5):
    """Polygon points for one module, corners rounded only where flagged —
    same semantics as qr_style.py's `_module_path_per_corner`."""
    pts = [(x + r, y) if nw else (x, y)]
    if ne:
        pts.append((x + w - r, y))
        pts.extend(_quad_bezier_points((x + w - r, y), (x + w, y), (x + w, y + r), n_arc))
    else:
        pts.append((x + w, y))
    if se:
        pts.append((x + w, y + h - r))
        pts.extend(_quad_bezier_points((x + w, y + h - r), (x + w, y + h), (x + w - r, y + h), n_arc))
    else:
        pts.append((x + w, y + h))
    if sw:
        pts.append((x + r, y + h))
        pts.extend(_quad_bezier_points((x + r, y + h), (x, y + h), (x, y + h - r), n_arc))
    else:
        pts.append((x, y + h))
    if nw:
        pts.append((x, y + r))
        pts.extend(_quad_bezier_points((x, y + r), (x, y), (x + r, y), n_arc))
    else:
        pts.append((x, y))
    return pts


# ---------------------------------------------------------------------------
# Mask builders — one per rendering engine, mirroring qr_style.py exactly
# ---------------------------------------------------------------------------

def _build_mask_generic(matrix, n, quiet, module_size, size_px, radius_factor, supersample=1):
    """Mask for the 7 `qr-creator`-replica presets: every dark module gets
    per-corner rounding based on neighbor adjacency, finder patterns get NO
    special treatment (same loop as everything else)."""
    ss = supersample
    mask = Image.new('L', (size_px * ss, size_px * ss), 0)
    draw = ImageDraw.Draw(mask)
    ms = module_size * ss

    def is_dark(r, c):
        if r < 0 or r >= n or c < 0 or c >= n:
            return False
        return bool(matrix[r][c])

    for r in range(n):
        for c in range(n):
            if not is_dark(r, c):
                continue
            x = (c + quiet) * ms
            y = (r + quiet) * ms
            rad = radius_factor * ms
            nw = (not is_dark(r - 1, c)) and (not is_dark(r, c - 1))
            ne = (not is_dark(r - 1, c)) and (not is_dark(r, c + 1))
            se = (not is_dark(r + 1, c)) and (not is_dark(r, c + 1))
            sw = (not is_dark(r + 1, c)) and (not is_dark(r, c - 1))
            if rad <= 0.01:
                draw.rectangle([x, y, x + ms, y + ms], fill=255)
            else:
                draw.polygon(_module_polygon(x, y, ms, ms, rad, nw, ne, se, sw), fill=255)
    if ss > 1:
        mask = mask.resize((size_px, size_px), Image.LANCZOS)
    return mask


def _build_mask_server(matrix, n, quiet, module_size, size_px, cfg, supersample=1):
    """Mask for the 3 original server presets: data modules are either
    'classic_pixels' (sharp squares only) or square-when-connected /
    circle-when-isolated, PLUS the 3 finder patterns get a distinct
    ring+center-dot treatment (not part of the regular module loop)."""
    ss = supersample
    mask = Image.new('L', (size_px * ss, size_px * ss), 0)
    draw = ImageDraw.Draw(mask)
    ms = module_size * ss

    finder_positions = [(0, 0), (0, n - 7), (n - 7, 0)]

    def in_finder(r, c):
        for fr, fc in finder_positions:
            if fr <= r < fr + 7 and fc <= c < fc + 7:
                return True
        return False

    def is_data(r, c):
        if r < 0 or r >= n or c < 0 or c >= n:
            return False
        return bool(matrix[r][c]) and not in_finder(r, c)

    classic_pixels = bool(cfg.get('classic_pixels'))
    circle_r = ms * 0.42

    for r in range(n):
        for c in range(n):
            if not is_data(r, c):
                continue
            x = (c + quiet) * ms
            y = (r + quiet) * ms
            if classic_pixels:
                draw.rectangle([x, y, x + ms, y + ms], fill=255)
                continue
            has_neighbor = (
                is_data(r - 1, c) or is_data(r + 1, c)
                or is_data(r, c - 1) or is_data(r, c + 1)
            )
            if has_neighbor:
                draw.rectangle([x, y, x + ms, y + ms], fill=255)
            else:
                cx_d = x + ms / 2
                cy_d = y + ms / 2
                draw.ellipse([cx_d - circle_r, cy_d - circle_r, cx_d + circle_r, cy_d + circle_r], fill=255)

    # Finder rings: outer rounded square (filled) minus inner rounded square
    # (cut out, i.e. drawn back to 0) leaves a ring; then a separate rounded
    # center square restores the middle dot.
    outer_r = min(ms * cfg['finder_corner_radius_modules'], 3.5 * ms)
    inner_r = max(min(outer_r - ms, 2.5 * ms), 0)
    center_r = min(ms * cfg['finder_center_radius_modules'], 1.5 * ms)
    for fr, fc in finder_positions:
        x = (fc + quiet) * ms
        y = (fr + quiet) * ms
        draw.rounded_rectangle([x, y, x + 7 * ms, y + 7 * ms], radius=outer_r, fill=255)
        draw.rounded_rectangle(
            [x + ms, y + ms, x + 6 * ms, y + 6 * ms], radius=inner_r, fill=0
        )
        draw.rounded_rectangle(
            [x + 2 * ms, y + 2 * ms, x + 5 * ms, y + 5 * ms], radius=center_r, fill=255
        )

    if ss > 1:
        mask = mask.resize((size_px, size_px), Image.LANCZOS)
    return mask


def _compose_ink_layer(mask: Image.Image, fill, size_px: int) -> Image.Image:
    """Combine a 0/255 ink mask with a solid color or gradient fill into an
    RGBA image that's fully transparent everywhere the mask is 0."""
    fill_rgb = _fill_array(fill, size_px)
    rgba = np.zeros((size_px, size_px, 4), dtype=np.uint8)
    rgba[..., :3] = fill_rgb
    rgba[..., 3] = np.array(mask)
    return Image.fromarray(rgba, mode='RGBA')


@lru_cache(maxsize=64)
def _cached_server_fill_array(preset: str, size_px: int) -> np.ndarray:
    """Gradient/solid fill for one of the 3 server presets, cached per
    (preset, size) — identical for every code sharing that model in a
    batch, so we only pay the gradient-computation cost once per model
    instead of once per code, which matters a lot for bulk DTF export."""
    cfg = PRESETS[preset]
    fill = {
        'type': 'linear-gradient', 'position': [0, 0, 0, 1],
        'colorStops': [[0, cfg['gradient_top']], [0.5, cfg['gradient_mid']], [1, cfg['gradient_bottom']]],
    }
    return _fill_array(fill, size_px)


@lru_cache(maxsize=64)
def _cached_generic_fill_array(preset: str, size_px: int) -> np.ndarray:
    """Same caching idea for the 7 qr-creator-replica presets."""
    cfg = GENERIC_PRESETS[preset]
    return _fill_array(cfg['fill'], size_px)


def _compose_ink_layer_from_rgb(mask: Image.Image, fill_rgb: np.ndarray, size_px: int) -> Image.Image:
    """Like _compose_ink_layer, but takes an already-resolved (cached) fill
    array instead of recomputing the gradient/solid color every call."""
    rgba = np.zeros((size_px, size_px, 4), dtype=np.uint8)
    rgba[..., :3] = fill_rgb
    rgba[..., 3] = np.asarray(mask)
    return Image.fromarray(rgba, mode='RGBA')


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_print_ready_png(
    data: str,
    preset: str = 'whiteOnBlack',
    edit_code: str = '',
    qr_size_mm: float = 170.0,
    dpi: int = 300,
    label_gap_mm: float = 6.0,
    label_height_mm: float = 22.0,
    center_icon: str = None,  # accepted for API symmetry; not yet rendered in raster mode
) -> bytes:
    """Render a print-ready, TRANSPARENT-background PNG for DTF: only the
    QR's own ink (modules + finder rings, no surrounding solid square) plus
    a small white label with the edit/configuration code underneath.

    Physical size is embedded via the PNG's DPI metadata: at `dpi` dots per
    inch, `qr_size_mm` millimeters maps to an exact pixel count, so any RIP
    or design software that reads DPI shows the correct real-world size with
    no manual scaling.
    """
    import segno

    mm_to_px = dpi / 25.4
    qr_px = round(qr_size_mm * mm_to_px)
    label_gap_px = round(label_gap_mm * mm_to_px)
    label_h_px = round(label_height_mm * mm_to_px)
    canvas_w = qr_px
    canvas_h = qr_px + label_gap_px + label_h_px

    if preset in PRESETS:
        cfg = PRESETS[preset]
        ec_level = 'l'  # no-icon path; icon not supported in raster mode yet
        qr = segno.make(data, error=ec_level, boost_error=False)
        matrix = qr.matrix
        n = len(matrix)
        quiet = 2
        module_size = qr_px / (n + quiet * 2)
        mask = _build_mask_server(matrix, n, quiet, module_size, qr_px, cfg)
        fill_rgb = _cached_server_fill_array(preset, qr_px)
        ink = _compose_ink_layer_from_rgb(mask, fill_rgb, qr_px)
    elif preset in GENERIC_PRESETS:
        cfg = GENERIC_PRESETS[preset]
        qr = segno.make(data, error='h', boost_error=False)
        matrix = qr.matrix
        n = len(matrix)
        quiet = 2
        module_size = qr_px / (n + quiet * 2)
        mask = _build_mask_generic(matrix, n, quiet, module_size, qr_px, cfg.get('radius', 0))
        fill_rgb = _cached_generic_fill_array(preset, qr_px)
        ink = _compose_ink_layer_from_rgb(mask, fill_rgb, qr_px)
    else:
        raise ValueError(f'Unknown preset: {preset}')

    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    canvas.paste(ink, (0, 0), ink)

    code = (edit_code or '').strip()
    if code:
        draw = ImageDraw.Draw(canvas)
        label_w = min(canvas_w * 0.92, 140 * mm_to_px)
        label_x = (canvas_w - label_w) / 2
        label_y = qr_px + label_gap_px
        radius = label_h_px * 0.22
        draw.rounded_rectangle(
            [label_x, label_y, label_x + label_w, label_y + label_h_px],
            radius=radius, fill=(255, 255, 255, 255), outline=(10, 10, 10, 255), width=max(1, round(0.4 * mm_to_px)),
        )
        font_size = round(label_h_px * 0.46)
        font = ImageFont.truetype(FONT_PATH, font_size)
        text_w = draw.textlength(code, font=font)
        draw.text(
            (canvas_w / 2 - text_w / 2, label_y + label_h_px * 0.22),
            code, font=font, fill=(10, 10, 10, 255),
        )

    buf = io.BytesIO()
    canvas.save(buf, format='PNG', dpi=(dpi, dpi), compress_level=1)
    return buf.getvalue()
