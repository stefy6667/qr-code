"""
Stylized QR code SVG generator.

Renders QR codes with:
 - rounded-square ring finder patterns (the 3 corner squares), à la Instagram
 - rounded/dot data modules
 - linear gradient fill (configurable colors)
 - configurable background

Uses error correction level H (~30%) so the stylization stays well within
the QR spec's recoverable noise margin, keeping scans reliable across phones.
"""

import os
import sys

# Make the vendored copy of segno importable. We prepend `vendor/` only if the
# package isn't already importable, so pip-installed environments keep working.
_VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor')
if os.path.isdir(os.path.join(_VENDOR, 'segno')) and _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)


# Named presets. Keep the keys in sync with the frontend `qrStylePresets`.
PRESETS = {
    'instagramGlow': {
        # Colors sampled from the reference t-shirt: vivid purple top, magenta
        # mid, orange bottom — exact vertical gradient like the printed design.
        'gradient_top': '#A011DB',     # vivid purple (top of reference)
        'gradient_mid': '#C026D3',     # magenta transition (mid)
        'gradient_bottom': '#F97316',  # saturated orange (bottom of reference)
        'background': '#0a0a0a',       # near-black, matches t-shirt fabric
        # Reference finders look like ROUNDED SQUARES, not full circles.
        # 7-module outer ring with ~1.5-module radius reads as the iconic
        # "rounded square O", and the 3-module center with ~0.8-module
        # radius reads as a soft inner pellet.
        'finder_corner_radius_modules': 1.5,
        'finder_center_radius_modules': 0.8,
        'module_fill_factor': 0.85,    # ~15% gap so each module reads as a discrete pixel
    },
    'instagramGlowLight': {
        'gradient_top': '#7C3AED',
        'gradient_mid': '#DB2777',
        'gradient_bottom': '#EA580C',
        'background': '#FFFFFF',
        'finder_corner_radius_modules': 1.5,
        'finder_center_radius_modules': 0.8,
        'module_fill_factor': 0.85,
    },
}


# Brand icons placed in the center of the QR.
# Each entry holds the brand-colored backdrop spec + the foreground shapes.
# Rendered into an `icon_size`-wide square centered at (cx, cy).
# `icon_size` is the FULL icon span; inside, we draw a white "halo" rounded
# square (so the icon stands out against any QR background) and then the
# brand square with the glyph.
SUPPORTED_ICONS = {'facebook', 'instagram', 'tiktok'}


def _center_icon_svg(icon_key: str, cx: float, cy: float, icon_size: float) -> str:
    """Build SVG fragment for a centered brand icon."""
    halo_r = icon_size * 0.20
    parts = [
        # white halo so the icon reads against any background
        f'<rect x="{cx - icon_size / 2:.2f}" y="{cy - icon_size / 2:.2f}" '
        f'width="{icon_size:.2f}" height="{icon_size:.2f}" '
        f'rx="{halo_r:.2f}" ry="{halo_r:.2f}" fill="#ffffff"/>'
    ]
    pad = icon_size * 0.10
    inner = icon_size - pad * 2
    ix = cx - inner / 2
    iy = cy - inner / 2
    inner_r = inner * 0.20

    if icon_key == 'facebook':
        parts.append(
            f'<rect x="{ix:.2f}" y="{iy:.2f}" width="{inner:.2f}" height="{inner:.2f}" '
            f'rx="{inner_r:.2f}" ry="{inner_r:.2f}" fill="#1877F2"/>'
        )
        # Stylized lowercase "f" built from a single path so it doesn't depend on
        # any system font when the SVG is rasterized into a canvas.
        # Coordinates are expressed as offsets from (ix, iy) on an `inner`-sized box.
        s = inner
        # Pre-compute key points; the f sits roughly centered in the inner box,
        # with its vertical stroke slightly right of center.
        x_stem = ix + s * 0.50
        x_stem_r = ix + s * 0.66
        x_left = ix + s * 0.35
        x_right = ix + s * 0.78
        y_top = iy + s * 0.16
        y_hook = iy + s * 0.30
        y_bar_top = iy + s * 0.42
        y_bar_bot = iy + s * 0.56
        y_bot = iy + s * 0.86
        parts.append(
            '<path fill="#ffffff" d="'
            f'M {x_right:.2f} {y_top:.2f} '
            f'L {x_right - s * 0.04:.2f} {y_bar_bot:.2f} '
            f'L {x_stem_r:.2f} {y_bar_bot:.2f} '
            f'L {x_stem_r:.2f} {y_bot:.2f} '
            f'L {x_stem:.2f} {y_bot:.2f} '
            f'L {x_stem:.2f} {y_bar_bot:.2f} '
            f'L {x_left:.2f} {y_bar_bot:.2f} '
            f'L {x_left:.2f} {y_bar_top:.2f} '
            f'L {x_stem:.2f} {y_bar_top:.2f} '
            f'L {x_stem:.2f} {y_hook:.2f} '
            f'Q {x_stem:.2f} {y_top:.2f} {x_stem + s * 0.14:.2f} {y_top:.2f} '
            'Z"/>'
        )
    elif icon_key == 'instagram':
        # Instagram brand gradient (diagonal yellow → magenta → purple)
        grad_id = 'igGrad'
        parts.append(
            f'<defs><linearGradient id="{grad_id}" x1="0" y1="1" x2="1" y2="0">'
            '<stop offset="0%" stop-color="#FCAF45"/>'
            '<stop offset="50%" stop-color="#E1306C"/>'
            '<stop offset="100%" stop-color="#5B51D8"/>'
            '</linearGradient></defs>'
            f'<rect x="{ix:.2f}" y="{iy:.2f}" width="{inner:.2f}" height="{inner:.2f}" '
            f'rx="{inner_r:.2f}" ry="{inner_r:.2f}" fill="url(#{grad_id})"/>'
        )
        # Camera outline (rounded rect) + inner lens circle + top-right indicator dot
        stroke = inner * 0.08
        cam_pad = inner * 0.20
        cam_x = ix + cam_pad
        cam_y = iy + cam_pad
        cam_s = inner - 2 * cam_pad
        cam_r = cam_s * 0.24
        lens_r = cam_s * 0.22
        dot_r = cam_s * 0.06
        dot_offset = cam_s * 0.18
        parts.append(
            f'<rect x="{cam_x:.2f}" y="{cam_y:.2f}" width="{cam_s:.2f}" height="{cam_s:.2f}" '
            f'rx="{cam_r:.2f}" ry="{cam_r:.2f}" fill="none" '
            f'stroke="#ffffff" stroke-width="{stroke:.2f}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{lens_r:.2f}" fill="none" '
            f'stroke="#ffffff" stroke-width="{stroke:.2f}"/>'
            f'<circle cx="{cam_x + cam_s - dot_offset:.2f}" cy="{cam_y + dot_offset:.2f}" '
            f'r="{dot_r:.2f}" fill="#ffffff"/>'
        )
    elif icon_key == 'tiktok':
        parts.append(
            f'<rect x="{ix:.2f}" y="{iy:.2f}" width="{inner:.2f}" height="{inner:.2f}" '
            f'rx="{inner_r:.2f}" ry="{inner_r:.2f}" fill="#000000"/>'
        )
        # TikTok "d" mark: vertical stroke that hooks at the top, plus a
        # filled circle bottom-left (the eighth-note bubble).
        s = inner
        stem_w = s * 0.13
        stem_x = ix + s * 0.55
        stem_top = iy + s * 0.18
        stem_bot = iy + s * 0.68
        # Stem
        parts.append(
            f'<rect x="{stem_x:.2f}" y="{stem_top:.2f}" '
            f'width="{stem_w:.2f}" height="{stem_bot - stem_top:.2f}" fill="#ffffff"/>'
        )
        # Hook at top of stem extending right
        hook_w = s * 0.18
        hook_h = s * 0.13
        parts.append(
            f'<rect x="{stem_x:.2f}" y="{stem_top:.2f}" '
            f'width="{hook_w:.2f}" height="{hook_h:.2f}" fill="#ffffff"/>'
        )
        # Filled bubble bottom-left
        bubble_r = s * 0.14
        bubble_cx = stem_x - s * 0.08
        bubble_cy = stem_bot + s * 0.02
        parts.append(
            f'<circle cx="{bubble_cx:.2f}" cy="{bubble_cy:.2f}" r="{bubble_r:.2f}" '
            f'fill="#ffffff"/>'
        )
        # Cyan ghost (offset down-left a touch) to evoke the brand's chromatic mark
        parts.append(
            f'<circle cx="{bubble_cx - s * 0.04:.2f}" cy="{bubble_cy + s * 0.02:.2f}" '
            f'r="{bubble_r * 0.55:.2f}" fill="#25F4EE" opacity="0.85"/>'
        )
        # Magenta ghost (offset up-right a touch)
        parts.append(
            f'<circle cx="{bubble_cx + s * 0.04:.2f}" cy="{bubble_cy - s * 0.02:.2f}" '
            f'r="{bubble_r * 0.55:.2f}" fill="#FE2C55" opacity="0.85"/>'
        )
    return ''.join(parts)


def _rounded_rect_path(x: float, y: float, w: float, h: float, r: float) -> str:
    """Clockwise rounded-rect subpath ending with z. r is corner radius."""
    return (
        f'M {x + r} {y} '
        f'h {w - 2 * r} a {r} {r} 0 0 1 {r} {r} '
        f'v {h - 2 * r} a {r} {r} 0 0 1 {-r} {r} '
        f'h {-(w - 2 * r)} a {r} {r} 0 0 1 {-r} {-r} '
        f'v {-(h - 2 * r)} a {r} {r} 0 0 1 {r} {-r} z'
    )


def build_svg(
    data: str,
    size: int = 1200,
    preset: str = 'instagramGlow',
    gradient_top: str = None,
    gradient_mid: str = None,
    gradient_bottom: str = None,
    background: str = None,
    center_icon: str = None,
) -> str:
    """
    Return an SVG string for the given data, styled per `preset` with
    optional color overrides and an optional center brand icon
    (`facebook` / `instagram` / `tiktok`).
    """
    try:
        import segno
    except ImportError as e:
        raise RuntimeError(
            "The 'segno' package is required for styled QR generation. "
            "Add `pip install -r requirements.txt` to your build command."
        ) from e

    cfg = dict(PRESETS.get(preset) or PRESETS['instagramGlow'])
    if gradient_top:
        cfg['gradient_top'] = gradient_top
    if gradient_mid:
        cfg['gradient_mid'] = gradient_mid
    if gradient_bottom:
        cfg['gradient_bottom'] = gradient_bottom
    if background:
        cfg['background'] = background

    icon_key = center_icon if center_icon in SUPPORTED_ICONS else None

    qr = segno.make(data, error='h', boost_error=False)
    matrix = qr.matrix
    n = len(matrix)
    quiet = 4
    total = n + quiet * 2
    module_size = size / total

    finder_positions = [(0, 0), (0, n - 7), (n - 7, 0)]

    def in_finder(r: int, c: int) -> bool:
        for fr, fc in finder_positions:
            if fr <= r < fr + 7 and fc <= c < fc + 7:
                return True
        return False

    # Center icon footprint (in matrix coords). Icon spans ~22% of the QR
    # data area; at error-correction H this stays well within the ~30%
    # recoverable margin. We also clear a slightly larger "blanking" area
    # so the icon's halo doesn't touch any module.
    icon_modules = 0
    icon_size_px = 0.0
    if icon_key:
        icon_modules = max(5, int(round(n * 0.22)))
        # Round up to odd so the icon centers on a module
        if icon_modules % 2 == 0:
            icon_modules += 1
        icon_size_px = icon_modules * module_size
    center_r = n // 2
    center_c = n // 2
    half = icon_modules // 2

    def in_icon(r: int, c: int) -> bool:
        if not icon_key:
            return False
        return (center_r - half <= r <= center_r + half
                and center_c - half <= c <= center_c + half)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
        f'shape-rendering="geometricPrecision">',
        '<defs>',
        '<linearGradient id="qrGrad" x1="0" y1="0" x2="0" y2="1">',
        f'<stop offset="0%" stop-color="{cfg["gradient_top"]}"/>',
        f'<stop offset="50%" stop-color="{cfg["gradient_mid"]}"/>',
        f'<stop offset="100%" stop-color="{cfg["gradient_bottom"]}"/>',
        '</linearGradient>',
        '</defs>',
        f'<rect width="{size}" height="{size}" fill="{cfg["background"]}"/>',
    ]

    # data modules
    r_dot = module_size * cfg['dot_radius_factor']
    parts.append('<g fill="url(#qrGrad)">')
    for r, row in enumerate(matrix):
        for c, val in enumerate(row):
            if not val or in_finder(r, c) or in_icon(r, c):
                continue
            cx = (c + quiet + 0.5) * module_size
            cy = (r + quiet + 0.5) * module_size
            parts.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r_dot:.2f}"/>')
    parts.append('</g>')

    # finder patterns: rounded-square ring + inner rounded-square dot
    outer_r = module_size * cfg['finder_corner_radius_modules']
    inner_r = module_size * cfg['finder_corner_radius_modules'] * 0.72
    center_r = module_size * cfg['finder_center_radius_modules']
    parts.append('<g fill="url(#qrGrad)" fill-rule="evenodd">')
    for fr, fc in finder_positions:
        x = (fc + quiet) * module_size
        y = (fr + quiet) * module_size
        ring_d = (
            _rounded_rect_path(x, y, 7 * module_size, 7 * module_size, outer_r)
            + ' '
            + _rounded_rect_path(x + module_size, y + module_size,
                                 5 * module_size, 5 * module_size, inner_r)
        )
        parts.append(f'<path d="{ring_d}"/>')
        parts.append(
            f'<rect x="{x + 2 * module_size:.2f}" y="{y + 2 * module_size:.2f}" '
            f'width="{3 * module_size:.2f}" height="{3 * module_size:.2f}" '
            f'rx="{center_r:.2f}" ry="{center_r:.2f}"/>'
        )
    parts.append('</g>')

    # center brand icon overlay (rendered last so it sits on top of any data)
    if icon_key and icon_size_px > 0:
        # Slightly shrink the visual icon vs the blanked module area so the
        # icon's halo doesn't visually touch nearby modules.
        visual_size = icon_size_px * 0.88
        parts.append(_center_icon_svg(icon_key, size / 2, size / 2, visual_size))

    parts.append('</svg>')
    return ''.join(parts)
