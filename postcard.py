"""
Generate postcard SVGs by compositing onto pre-made PNG templates.

The templates (`assets/postcard_tshirt.png`, `assets/postcard_hoodie.png`)
are designed in Romanian and contain placeholders for:
  - A main QR on the garment (with corner brackets already drawn).
  - A small "re-edit" QR in the bottom-left card.
  - An empty dashed "FOLOSEȘTE CODUL:" box for the edit code text.

This module composites:
  - The styled scan QR onto the garment.
  - A plain B/W edit QR into the re-edit slot.
  - The edit code text into the dashed box.

Only Romanian is supported right now; the templates are RO-only.
"""

from __future__ import annotations

import base64
import os
from xml.sax.saxutils import escape as xml_escape

import qr_style


ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')

# Native template resolution. Composite math uses pixel coordinates against
# the original 1536x1024 images.
TEMPLATE_W = 1536
TEMPLATE_H = 1024


# Placeholder regions per garment, in template pixel space.
COORDS = {
    'tshirt': {
        # QR fits INSIDE the corner brackets drawn on the template.
        'qr_main':  (273, 333, 415, 478),
        'qr_edit':  (145, 743, 245, 843),
        'code_box': (90,  880, 565, 925),
    },
    'hoodie': {
        'qr_main':  (268, 333, 397, 462),
        'qr_edit':  (143, 765, 243, 865),
        'code_box': (90,  895, 565, 940),
    },
}



def _txt(s: str) -> str:
    return xml_escape(s)


def _load_template_base64(garment: str) -> tuple[str, str]:
    """Return (mime, base64-encoded content) for the garment template."""
    fname = f'postcard_{garment}.png'
    path = os.path.join(ASSETS_DIR, fname)
    with open(path, 'rb') as f:
        data = f.read()
    return 'image/png', base64.b64encode(data).decode('ascii')


def _styled_qr_inner(data: str, preset: str, center_icon: str = None) -> str:
    """Inner SVG content of a styled QR (without outer <svg> wrapper), drawn
    in a 1200x1200 coordinate space so the caller can scale it."""
    full = qr_style.build_svg(data, size=1200, preset=preset, center_icon=center_icon)
    inner_start = full.index('>') + 1
    inner_end = full.rindex('</svg>')
    return full[inner_start:inner_end]


def _plain_qr_svg(data: str, x: float, y: float, size: float,
                  fg: str = '#0a0a0a', bg: str = '#ffffff') -> str:
    """Plain black/white QR for the small edit-code QR (scans well at small size)."""
    import segno
    qr = segno.make(data, error='m', boost_error=True)
    matrix = qr.matrix
    n = len(matrix)
    quiet = 4
    total = n + quiet * 2
    mod = size / total
    out = [
        f'<g transform="translate({x:.1f},{y:.1f})">',
        f'<rect width="{size:.1f}" height="{size:.1f}" fill="{bg}" rx="{size*0.04:.1f}"/>',
        f'<g fill="{fg}">',
    ]
    for r, row in enumerate(matrix):
        for c, v in enumerate(row):
            if not v:
                continue
            mx = (c + quiet) * mod
            my = (r + quiet) * mod
            out.append(f'<rect x="{mx:.2f}" y="{my:.2f}" width="{mod:.2f}" height="{mod:.2f}"/>')
    out.append('</g></g>')
    return ''.join(out)


def build_postcard_svg(
    *,
    scan_url: str,
    edit_url: str,
    edit_code: str,
    short_domain: str = '',  # accepted but not drawn — already on the template
    garment: str = 'tshirt',
    qr_preset: str = 'instagramGlow',
    qr_center_icon: str = None,
) -> str:
    if garment not in ('tshirt', 'hoodie'):
        garment = 'tshirt'

    coords = COORDS[garment]
    mime, b64 = _load_template_base64(garment)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {TEMPLATE_W} {TEMPLATE_H}" '
        f'width="{TEMPLATE_W}" height="{TEMPLATE_H}" '
        f'shape-rendering="geometricPrecision" '
        f'text-rendering="geometricPrecision">',
        f'<image x="0" y="0" width="{TEMPLATE_W}" height="{TEMPLATE_H}" '
        f'preserveAspectRatio="none" '
        f'xlink:href="data:{mime};base64,{b64}"/>',
    ]

    # Main scan QR on the garment, centered in placeholder.
    # Uses a plain black-and-white QR (not the styled gradient one) — the
    # postcard is a print template, so a clean B/W QR matches the rest of
    # the design and prints cleanly on garments.
    x1, y1, x2, y2 = coords['qr_main']
    qw, qh = x2 - x1, y2 - y1
    s = min(qw, qh)
    qx = x1 + (qw - s) / 2
    qy = y1 + (qh - s) / 2
    parts.append(_plain_qr_svg(scan_url, qx, qy, s))

    # Small edit QR, centered in its placeholder.
    ex1, ey1, ex2, ey2 = coords['qr_edit']
    es = min(ex2 - ex1, ey2 - ey1)
    edx = ex1 + ((ex2 - ex1) - es) / 2
    edy = ey1 + ((ey2 - ey1) - es) / 2
    parts.append(_plain_qr_svg(edit_url, edx, edy, es))

    # Edit code text in the dashed box.
    cx1, cy1, cx2, cy2 = coords['code_box']
    cxc = (cx1 + cx2) / 2
    cyc = (cy1 + cy2) / 2
    parts.append(
        f'<text x="{cxc:.1f}" y="{cyc + 10:.1f}" '
        f'font-family="Helvetica, Arial, sans-serif" font-weight="700" '
        f'font-size="28" fill="#0a0a0a" text-anchor="middle" '
        f'letter-spacing="2">{_txt(edit_code)}</text>'
    )

    parts.append('</svg>')
    return ''.join(parts)
