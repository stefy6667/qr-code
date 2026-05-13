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

# segno is imported lazily inside build_svg() so the module can be loaded
# (and the rest of the server can start) even if the dependency isn't yet
# installed in the runtime environment.


# Named presets. Keep the keys in sync with the frontend `qrStylePresets`.
PRESETS = {
    'instagramGlow': {
        'gradient_top': '#8B5CF6',     # violet
        'gradient_mid': '#EC4899',     # pink
        'gradient_bottom': '#F97316',  # orange
        'background': '#0a0a0a',       # near-black, matches reference
        'finder_corner_radius_modules': 1.8,  # how rounded the outer finder ring is
        'finder_center_radius_modules': 0.9,  # how rounded the inner finder square is
        'dot_radius_factor': 0.5,             # 0..0.5; 0.5 = circles fill their cell
    },
    'instagramGlowLight': {
        'gradient_top': '#7C3AED',
        'gradient_mid': '#DB2777',
        'gradient_bottom': '#EA580C',
        'background': '#FFFFFF',
        'finder_corner_radius_modules': 1.8,
        'finder_center_radius_modules': 0.9,
        'dot_radius_factor': 0.5,
    },
}


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
) -> str:
    """
    Return an SVG string for the given data, styled per `preset` with
    optional color overrides.
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
            if not val or in_finder(r, c):
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

    parts.append('</svg>')
    return ''.join(parts)
