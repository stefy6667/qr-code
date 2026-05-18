"""
Generate printable postcards as composite SVG.

Two layouts (tshirt / hoodie) × two languages (ro / en).
Each postcard is a single A4-landscape SVG:
  - LEFT panel: "Your garment tells a story" + garment illustration with the
    real scan QR rendered on it (uses the QR's saved style + center icon),
    plus a "for re-editing" sub-section with a small QR encoding the edit
    URL and the bare edit code printed underneath.
  - RIGHT panel: "How to care for your garment" with 6 care instructions.

The result is a vector PDF-quality printable that the user can save as PNG
or print to PDF directly from their browser.
"""

from __future__ import annotations

from xml.sax.saxutils import escape as xml_escape

import qr_style


# A4 landscape at 96 DPI = 1123 x 794, but we use a clean 1500x1000 viewBox
# that prints crisply at any size while keeping a near-A4-landscape aspect.
CANVAS_W = 1500
CANVAS_H = 1000

# Translations for both languages and both garment kinds. Strings live here so
# editing copy doesn't touch the layout code below.
T = {
    'ro': {
        'tshirt': {
            'title1': 'TRICOUL TĂU SPUNE',
            'title2': 'O POVESTE',
            'subtitle': 'Scanează QR-ul de pe tricou și descoperă mai mult.',
            'care_title1': 'CUM SĂ ÎNGRIJEȘTI',
            'care_title2': 'TRICOUL TĂU',
            'garment_label': 'tricou',
            'garment_dos_text': 'Spală-l pe dos pentru a proteja designul și QR-ul.',
            'machine_dry_text': 'Uscarea la mașină poate micșora tricoul și poate afecta printul.',
            'natural_dry_text': 'Cel mai bine este să îl usuci pe umeraș, la aer liber, ferit de soare direct.',
            'footer': 'Ai grijă de tricoul tău, iar el va spune povestea ta, mult timp.',
            'turn_inside_out_title': 'ÎNTOARCE TRICOUL PE DOS',
        },
        'hoodie': {
            'title1': 'HANORACUL TĂU',
            'title2': 'SPUNE O POVESTE',
            'subtitle': 'Scanează QR-ul de pe hanorac și descoperă mai mult.',
            'care_title1': 'CUM SĂ ÎNGRIJEȘTI',
            'care_title2': 'HANORACUL TĂU',
            'garment_label': 'hanorac',
            'garment_dos_text': 'Spală-l pe dos pentru a proteja designul și QR-ul.',
            'machine_dry_text': 'Uscarea la mașină poate micșora hanoracul și poate afecta printul.',
            'natural_dry_text': 'Cel mai bine este să îl usuci pe umeraș, la aer liber, ferit de soare direct.',
            'footer': 'Ai grijă de hanoracul tău, iar el va spune povestea ta, mult timp.',
            'turn_inside_out_title': 'ÎNTOARCE HANORACUL PE DOS',
        },
        'common': {
            'how_works': 'CUM FUNCȚIONEAZĂ',
            'how_works2': 'QR CODE-UL?',
            'step1_title': 'DESCHIDE\nCAMERA',
            'step1_body': 'Deschide aplicația Camera pe telefon.',
            'step2_title': 'SCANEAZĂ',
            'step3_title': 'DESCOPERĂ',
            'step3_body': 'Accesează conținutul unic creat special pentru tine.',
            'for_re_edit': 'PENTRU REEDITARE (DACĂ ESTE CAZUL)',
            'edit_scan_text': 'Scanează QR-ul de mai jos pentru a re-edita conținutul.',
            'or_direct': 'SAU ACCESEAZĂ DIRECT:',
            'use_code': 'FOLOSEȘTE CODUL:',
            'thanks': 'ÎȚI MULȚUMIM CĂ NE SUSȚII!',
            'for_long_time': 'PENTRU CA EL SĂ ARATE BINE, MAI MULT TIMP',
            'wash_30': 'SPALĂ LA 30°C',
            'wash_30_body': 'Folosește apă rece sau călduță (max. 30°C). Protejezi materialul și printul.',
            'no_bleach': 'NU FOLOSI ÎNĂLBITOR',
            'no_bleach_body': 'Produsele agresive pot deteriora culorile și materialul.',
            'no_dryer': 'NU USCA ÎN USCĂTOR',
            'low_iron': 'CĂLCARE LA TEMPERATURĂ MICĂ',
            'low_iron_body': 'Călcați pe dos, la temperatură scăzută. Nu călcați direct pe print sau pe QR code.',
            'natural_dry': 'USUCĂ NATURAL',
        },
    },
    'en': {
        'tshirt': {
            'title1': 'YOUR T-SHIRT TELLS',
            'title2': 'A STORY',
            'subtitle': 'Scan the QR code on the t-shirt and discover more.',
            'care_title1': 'HOW TO CARE FOR',
            'care_title2': 'YOUR T-SHIRT',
            'garment_label': 't-shirt',
            'garment_dos_text': 'Wash inside-out to protect the design and the QR.',
            'machine_dry_text': 'Machine drying may shrink the t-shirt and damage the print.',
            'natural_dry_text': 'Air-dry on a hanger, away from direct sunlight.',
            'footer': "Care for your t-shirt, and it'll tell your story for a long time.",
            'turn_inside_out_title': 'TURN T-SHIRT INSIDE-OUT',
        },
        'hoodie': {
            'title1': 'YOUR HOODIE',
            'title2': 'TELLS A STORY',
            'subtitle': 'Scan the QR code on the hoodie and discover more.',
            'care_title1': 'HOW TO CARE FOR',
            'care_title2': 'YOUR HOODIE',
            'garment_label': 'hoodie',
            'garment_dos_text': 'Wash inside-out to protect the design and the QR.',
            'machine_dry_text': 'Machine drying may shrink the hoodie and damage the print.',
            'natural_dry_text': 'Air-dry on a hanger, away from direct sunlight.',
            'footer': "Care for your hoodie, and it'll tell your story for a long time.",
            'turn_inside_out_title': 'TURN HOODIE INSIDE-OUT',
        },
        'common': {
            'how_works': 'HOW DOES',
            'how_works2': 'THE QR CODE WORK?',
            'step1_title': 'OPEN\nCAMERA',
            'step1_body': 'Open the Camera app on your phone.',
            'step2_title': 'SCAN',
            'step3_title': 'DISCOVER',
            'step3_body': 'Access unique content created just for you.',
            'for_re_edit': 'FOR RE-EDITING (IF NEEDED)',
            'edit_scan_text': 'Scan the QR below to re-edit the content.',
            'or_direct': 'OR ACCESS DIRECTLY:',
            'use_code': 'USE THE CODE:',
            'thanks': 'THANK YOU FOR SUPPORTING US!',
            'for_long_time': 'SO IT LOOKS GREAT FOR A LONG TIME',
            'wash_30': 'WASH AT 30°C',
            'wash_30_body': 'Use cold or lukewarm water (max. 30°C). Protects the fabric and the print.',
            'no_bleach': "DON'T USE BLEACH",
            'no_bleach_body': 'Aggressive chemicals can damage colors and fabric.',
            'no_dryer': "DON'T MACHINE DRY",
            'low_iron': 'IRON AT LOW TEMPERATURE',
            'low_iron_body': "Iron inside-out, on low heat. Don't iron directly on the print or QR.",
            'natural_dry': 'AIR DRY',
        },
    },
}


def _txt(s: str) -> str:
    """XML-escape a string for safe embedding in SVG text content."""
    return xml_escape(s)


def _draw_tshirt_outline(x: float, y: float, w: float, h: float) -> str:
    """Black-line t-shirt silhouette filling roughly the box (x,y,w,h)."""
    # Coordinates are normalized to the bounding box. The shirt has a wide
    # body, short sleeves jutting up-and-out, a small neck dip at the top.
    cx = x + w / 2
    body_top = y + h * 0.12
    body_bot = y + h * 0.95
    body_left = x + w * 0.18
    body_right = x + w * 0.82
    sleeve_top = y + h * 0.05
    sleeve_l_outer = x + w * 0.02
    sleeve_r_outer = x + w * 0.98
    sleeve_drop = y + h * 0.30
    neck_l = cx - w * 0.10
    neck_r = cx + w * 0.10
    neck_dip = y + h * 0.16
    return (
        '<g fill="#0a0a0a">'
        f'<path d="'
        f'M {sleeve_l_outer:.1f} {sleeve_top:.1f} '
        f'L {neck_l:.1f} {body_top:.1f} '
        f'Q {cx:.1f} {neck_dip:.1f} {neck_r:.1f} {body_top:.1f} '
        f'L {sleeve_r_outer:.1f} {sleeve_top:.1f} '
        f'L {body_right:.1f} {sleeve_drop:.1f} '
        f'L {body_right:.1f} {body_bot:.1f} '
        f'L {body_left:.1f} {body_bot:.1f} '
        f'L {body_left:.1f} {sleeve_drop:.1f} '
        f'Z" />'
        '</g>'
    )


def _draw_hoodie_outline(x: float, y: float, w: float, h: float) -> str:
    """Black hoodie silhouette with hood and front pocket."""
    cx = x + w / 2
    body_top = y + h * 0.20
    body_bot = y + h * 0.95
    body_left = x + w * 0.20
    body_right = x + w * 0.80
    sleeve_top = y + h * 0.18
    sleeve_l_outer = x + w * 0.02
    sleeve_r_outer = x + w * 0.98
    sleeve_drop = y + h * 0.36
    hood_top = y + h * 0.02
    hood_l = cx - w * 0.18
    hood_r = cx + w * 0.18
    return (
        '<g fill="#0a0a0a">'
        # Hood (rounded rectangle on top, behind body)
        f'<path d="'
        f'M {hood_l:.1f} {body_top + h*0.02:.1f} '
        f'Q {hood_l - w*0.02:.1f} {hood_top:.1f} {cx:.1f} {hood_top:.1f} '
        f'Q {hood_r + w*0.02:.1f} {hood_top:.1f} {hood_r:.1f} {body_top + h*0.02:.1f} '
        f'Z" />'
        # Body + sleeves
        f'<path d="'
        f'M {sleeve_l_outer:.1f} {sleeve_top:.1f} '
        f'L {body_left:.1f} {body_top:.1f} '
        f'L {hood_l:.1f} {body_top:.1f} '
        f'Q {cx:.1f} {body_top + h*0.05:.1f} {hood_r:.1f} {body_top:.1f} '
        f'L {body_right:.1f} {body_top:.1f} '
        f'L {sleeve_r_outer:.1f} {sleeve_top:.1f} '
        f'L {body_right:.1f} {sleeve_drop:.1f} '
        f'L {body_right:.1f} {body_bot:.1f} '
        f'L {body_left:.1f} {body_bot:.1f} '
        f'L {body_left:.1f} {sleeve_drop:.1f} '
        f'Z" />'
        # Front pocket detail
        f'<path d="'
        f'M {cx - w*0.15:.1f} {y + h*0.65:.1f} '
        f'L {cx + w*0.15:.1f} {y + h*0.65:.1f} '
        f'L {cx + w*0.12:.1f} {y + h*0.80:.1f} '
        f'L {cx - w*0.12:.1f} {y + h*0.80:.1f} Z" '
        f'fill="#1f1f1f" />'
        '</g>'
    )


def _phone_icon(x: float, y: float, w: float, h: float,
                inner_svg: str = '') -> str:
    """Phone silhouette outline. Optional inner_svg drawn inside the screen."""
    r = w * 0.12
    return (
        f'<g>'
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
        f'rx="{r:.1f}" ry="{r:.1f}" fill="none" stroke="#0a0a0a" stroke-width="3"/>'
        f'<circle cx="{x + w/2:.1f}" cy="{y + h - h*0.06:.1f}" r="{w*0.05:.1f}" '
        f'fill="none" stroke="#0a0a0a" stroke-width="2.5"/>'
        f'{inner_svg}'
        '</g>'
    )


def _step_circle(x: float, y: float, r: float, num: str) -> str:
    """Numbered step bubble (filled black circle with white digit)."""
    return (
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#0a0a0a"/>'
        f'<text x="{x:.1f}" y="{y + r*0.35:.1f}" '
        f'font-family="Helvetica, Arial, sans-serif" font-weight="700" '
        f'font-size="{r*1.1:.1f}" fill="#ffffff" text-anchor="middle">{num}</text>'
    )


def _care_icon(kind: str, x: float, y: float, size: float) -> str:
    """Tiny black-line care icon. `kind` ∈ {wash30, garment_dos_tshirt,
    garment_dos_hoodie, no_bleach, no_dryer, low_iron, natural_dry_tshirt,
    natural_dry_hoodie}."""
    s = size
    cx = x + s / 2
    cy = y + s / 2
    sw = max(2, s * 0.04)  # stroke width
    if kind == 'wash30':
        return (
            f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
            # bucket
            f'<path d="M {x+s*0.10:.1f} {y+s*0.30:.1f} L {x+s*0.90:.1f} {y+s*0.30:.1f} '
            f'L {x+s*0.78:.1f} {y+s*0.85:.1f} L {x+s*0.22:.1f} {y+s*0.85:.1f} Z"/>'
            # water wave
            f'<path d="M {x+s*0.20:.1f} {y+s*0.50:.1f} Q {x+s*0.35:.1f} {y+s*0.42:.1f} {x+s*0.50:.1f} {y+s*0.50:.1f} '
            f'T {x+s*0.80:.1f} {y+s*0.50:.1f}"/>'
            '</g>'
            # 30° text
            f'<text x="{cx:.1f}" y="{cy+s*0.20:.1f}" font-family="Helvetica, Arial, sans-serif" '
            f'font-weight="700" font-size="{s*0.22:.1f}" fill="#0a0a0a" text-anchor="middle">30°</text>'
        )
    if kind == 'garment_dos_tshirt':
        return _draw_tshirt_outline(x + s*0.10, y + s*0.05, s*0.80, s*0.90).replace('#0a0a0a', 'none').replace(
            '<g fill="none">', f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round">')
    if kind == 'garment_dos_hoodie':
        return _draw_hoodie_outline(x + s*0.10, y + s*0.05, s*0.80, s*0.90).replace('fill="#0a0a0a"', f'fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round"').replace('fill="#1f1f1f"', 'fill="none"')
    if kind == 'no_bleach':
        # Triangle with big X over it
        return (
            f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
            f'<path d="M {cx:.1f} {y+s*0.15:.1f} L {x+s*0.92:.1f} {y+s*0.85:.1f} L {x+s*0.08:.1f} {y+s*0.85:.1f} Z"/>'
            f'<line x1="{x+s*0.20:.1f}" y1="{y+s*0.30:.1f}" x2="{x+s*0.80:.1f}" y2="{y+s*0.85:.1f}"/>'
            f'<line x1="{x+s*0.80:.1f}" y1="{y+s*0.30:.1f}" x2="{x+s*0.20:.1f}" y2="{y+s*0.85:.1f}"/>'
            '</g>'
        )
    if kind == 'no_dryer':
        # Square (with circle inside, like tumble dryer) crossed out
        return (
            f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
            f'<rect x="{x+s*0.15:.1f}" y="{y+s*0.20:.1f}" width="{s*0.70:.1f}" height="{s*0.65:.1f}" rx="{s*0.05:.1f}"/>'
            f'<circle cx="{cx:.1f}" cy="{cy + s*0.05:.1f}" r="{s*0.20:.1f}"/>'
            f'<line x1="{x+s*0.10:.1f}" y1="{y+s*0.15:.1f}" x2="{x+s*0.90:.1f}" y2="{y+s*0.90:.1f}"/>'
            f'<line x1="{x+s*0.90:.1f}" y1="{y+s*0.15:.1f}" x2="{x+s*0.10:.1f}" y2="{y+s*0.90:.1f}"/>'
            '</g>'
        )
    if kind == 'low_iron':
        # Iron with single dot (low temp)
        return (
            f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
            f'<path d="M {x+s*0.10:.1f} {y+s*0.70:.1f} '
            f'L {x+s*0.20:.1f} {y+s*0.35:.1f} '
            f'Q {x+s*0.30:.1f} {y+s*0.25:.1f} {x+s*0.50:.1f} {y+s*0.25:.1f} '
            f'L {x+s*0.85:.1f} {y+s*0.25:.1f} '
            f'Q {x+s*0.92:.1f} {y+s*0.30:.1f} {x+s*0.92:.1f} {y+s*0.70:.1f} Z"/>'
            '</g>'
            # Single dot (low temp marker)
            f'<circle cx="{cx:.1f}" cy="{cy - s*0.05:.1f}" r="{s*0.05:.1f}" fill="#0a0a0a"/>'
        )
    if kind in ('natural_dry_tshirt', 'natural_dry_hoodie'):
        # Clothesline with hanging garment
        line_y = y + s * 0.20
        return (
            f'<g fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
            # clothesline
            f'<line x1="{x+s*0.05:.1f}" y1="{line_y:.1f}" x2="{x+s*0.95:.1f}" y2="{line_y:.1f}"/>'
            # clothespin lines (small ticks)
            f'<line x1="{x+s*0.30:.1f}" y1="{line_y - s*0.04:.1f}" x2="{x+s*0.30:.1f}" y2="{line_y + s*0.04:.1f}"/>'
            f'<line x1="{x+s*0.70:.1f}" y1="{line_y - s*0.04:.1f}" x2="{x+s*0.70:.1f}" y2="{line_y + s*0.04:.1f}"/>'
            '</g>'
            # garment hanging below
            + (_draw_tshirt_outline(x + s*0.18, line_y + s*0.02, s*0.64, s*0.65) if kind == 'natural_dry_tshirt'
               else _draw_hoodie_outline(x + s*0.18, line_y + s*0.02, s*0.64, s*0.70)).replace(
                'fill="#0a0a0a"', f'fill="none" stroke="#0a0a0a" stroke-width="{sw:.1f}" stroke-linejoin="round"'
            ).replace('fill="#1f1f1f"', 'fill="none"')
        )
    return ''


def _multiline(text: str, x: float, y: float, font_size: float,
               font_weight: str = '400', fill: str = '#0a0a0a',
               text_anchor: str = 'start', line_height: float = 1.25) -> str:
    """Render multi-line text by splitting on \\n."""
    lines = text.split('\n')
    out = []
    dy = font_size * line_height
    for i, line in enumerate(lines):
        out.append(
            f'<text x="{x:.1f}" y="{y + i*dy:.1f}" '
            f'font-family="Helvetica, Arial, sans-serif" font-weight="{font_weight}" '
            f'font-size="{font_size:.1f}" fill="{fill}" text-anchor="{text_anchor}">'
            f'{_txt(line)}</text>'
        )
    return ''.join(out)


def _embed_qr_svg(data: str, x: float, y: float, size: float,
                  preset: str = 'instagramGlow',
                  center_icon: str = None) -> str:
    """Embed a styled QR centered at (x, y) with given total size."""
    qr_svg = qr_style.build_svg(data, size=1200, preset=preset, center_icon=center_icon)
    # Strip the outer <svg> wrapper and wrap in a <g> with transform.
    inner_start = qr_svg.index('>') + 1
    inner_end = qr_svg.rindex('</svg>')
    inner = qr_svg[inner_start:inner_end]
    scale = size / 1200
    return (
        f'<g transform="translate({x:.1f},{y:.1f}) scale({scale:.4f})">{inner}</g>'
    )


def _embed_plain_qr_svg(data: str, x: float, y: float, size: float,
                        fg: str = '#0a0a0a', bg: str = '#ffffff') -> str:
    """A plain black-and-white QR (used for the edit-code QR)."""
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
    short_domain: str,
    garment: str = 'tshirt',
    lang: str = 'ro',
    qr_preset: str = 'instagramGlow',
    qr_center_icon: str = None,
) -> str:
    """Compose a full postcard SVG.

    Args:
        scan_url: full URL encoded into the QR printed on the garment.
        edit_url: full URL encoded into the small re-edit QR.
        edit_code: human-readable code printed in the "USE THE CODE" box.
        short_domain: short site URL (e.g. "app.silentsignals.ro") printed
            under the re-edit QR.
        garment: 'tshirt' or 'hoodie'.
        lang: 'ro' or 'en'.
        qr_preset: styled-QR preset to use for the main QR on the garment.
        qr_center_icon: optional brand icon for the main QR.
    """
    if garment not in ('tshirt', 'hoodie'):
        garment = 'tshirt'
    if lang not in ('ro', 'en'):
        lang = 'ro'
    t = T[lang][garment]
    c = T[lang]['common']

    # Background — warm off-white like the reference
    bg = '#F7F1E3'
    panel_left = bg
    panel_right = '#FAF5E6'

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {CANVAS_W} {CANVAS_H}" width="{CANVAS_W}" height="{CANVAS_H}" '
        f'shape-rendering="geometricPrecision" text-rendering="geometricPrecision">',
        f'<rect width="{CANVAS_W}" height="{CANVAS_H}" fill="{bg}"/>',
    ]

    # Subtle vertical divider line
    parts.append(
        f'<line x1="{CANVAS_W/2:.1f}" y1="40" x2="{CANVAS_W/2:.1f}" y2="{CANVAS_H-40}" '
        f'stroke="#E5DDC8" stroke-width="2"/>'
    )

    # ============ LEFT PANEL ============
    L = 50   # left padding
    LW = CANVAS_W / 2 - 100  # left panel content width

    # Title
    parts.append(_multiline(
        f'{t["title1"]}\n{t["title2"]}',
        L + 40, 90, 44, font_weight='800'
    ))
    # Subtitle
    parts.append(_multiline(
        t['subtitle'], L + 40, 180, 18, fill='#2a2a2a'
    ))

    # Garment illustration + scan QR overlay
    garment_x = L + 30
    garment_y = 220
    garment_w = 420
    garment_h = 470
    if garment == 'tshirt':
        parts.append(_draw_tshirt_outline(garment_x, garment_y, garment_w, garment_h))
    else:
        parts.append(_draw_hoodie_outline(garment_x, garment_y, garment_w, garment_h))
    # QR on garment chest. Render with a thin lighter-colored corner-bracket
    # frame around it, like the reference photos.
    qr_size_on_garment = 160
    qr_cx = garment_x + garment_w * 0.55
    qr_cy = garment_y + garment_h * 0.45
    qr_x = qr_cx - qr_size_on_garment / 2
    qr_y = qr_cy - qr_size_on_garment / 2
    # Corner brackets
    bw = 4
    bl = 28  # bracket arm length
    bracket_color = '#7a6b4f'
    for (sx, sy, dx1, dy1, dx2, dy2) in [
        (qr_x, qr_y, bl, 0, 0, bl),                                   # TL
        (qr_x + qr_size_on_garment, qr_y, -bl, 0, 0, bl),             # TR
        (qr_x, qr_y + qr_size_on_garment, bl, 0, 0, -bl),             # BL
        (qr_x + qr_size_on_garment, qr_y + qr_size_on_garment, -bl, 0, 0, -bl),  # BR
    ]:
        parts.append(
            f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{sx+dx1:.1f}" y2="{sy+dy1:.1f}" '
            f'stroke="{bracket_color}" stroke-width="{bw}"/>'
            f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{sx+dx2:.1f}" y2="{sy+dy2:.1f}" '
            f'stroke="{bracket_color}" stroke-width="{bw}"/>'
        )
    parts.append(_embed_qr_svg(
        scan_url, qr_x, qr_y, qr_size_on_garment,
        preset=qr_preset, center_icon=qr_center_icon,
    ))

    # "How does the QR code work?" section on the right of the garment
    HW_X = L + 480
    HW_Y = 250
    parts.append(_multiline(
        f'{c["how_works"]}\n{c["how_works2"]}',
        HW_X, HW_Y, 22, font_weight='800'
    ))
    # Three numbered steps
    step_x = HW_X + 10
    step_y = HW_Y + 80
    step_gap = 110
    for i, (title, body) in enumerate([
        (c['step1_title'], c['step1_body']),
        (c['step2_title'], t['subtitle'].split('și')[0].strip() if lang == 'ro' else f"Point the camera at the QR on the {t['garment_label']}."),
        (c['step3_title'], c['step3_body']),
    ]):
        sy = step_y + i * step_gap
        parts.append(_step_circle(step_x, sy + 8, 18, str(i + 1)))
        # phone icon
        ph_x = step_x + 50
        ph_y = sy - 18
        parts.append(_phone_icon(ph_x, ph_y, 38, 60))
        # Title + body to the right of phone
        tx = ph_x + 55
        parts.append(_multiline(title, tx, sy - 4, 15, font_weight='800'))
        # body wraps
        title_lines = title.count('\n') + 1
        parts.append(_multiline(body, tx, sy - 4 + title_lines * 19 + 6, 12, fill='#2a2a2a'))
        # arrow down to next step
        if i < 2:
            parts.append(
                f'<line x1="{step_x + 18:.1f}" y1="{sy + 30:.1f}" '
                f'x2="{step_x + 18:.1f}" y2="{sy + step_gap - 18:.1f}" '
                f'stroke="#bbb59a" stroke-width="1.5" stroke-dasharray="3,3"/>'
            )

    # ===== Re-edit panel at the bottom of the left panel =====
    re_x = L + 20
    re_y = 720
    re_w = LW + 20
    re_h = 240
    parts.append(
        f'<rect x="{re_x:.1f}" y="{re_y:.1f}" width="{re_w:.1f}" height="{re_h:.1f}" '
        f'rx="20" fill="#EFE7CF"/>'
    )
    # Heart icon
    heart_x = re_x + 25
    heart_y = re_y + 35
    parts.append(
        f'<path d="M {heart_x:.1f} {heart_y:.1f} '
        f'q -10 -10 -20 0 q 0 12 20 22 q 20 -10 20 -22 q -10 -10 -20 0 Z" '
        f'fill="none" stroke="#0a0a0a" stroke-width="2"/>'
    )
    parts.append(_multiline(
        c['for_re_edit'], re_x + 65, re_y + 35, 14, font_weight='800'
    ))
    parts.append(_multiline(
        c['edit_scan_text'], re_x + 65, re_y + 58, 12, fill='#2a2a2a'
    ))
    # Small edit QR (black-on-white, simpler so it scans well at small size)
    edit_qr_size = 100
    parts.append(_embed_plain_qr_svg(
        edit_url, re_x + 30, re_y + 80, edit_qr_size, fg='#0a0a0a', bg='#ffffff'
    ))
    # Right side: "or access directly" + short URL pill
    parts.append(_multiline(
        c['or_direct'], re_x + 160, re_y + 110, 13, font_weight='700'
    ))
    pill_x = re_x + 160
    pill_y = re_y + 122
    pill_w = 220
    pill_h = 34
    parts.append(
        f'<rect x="{pill_x:.1f}" y="{pill_y:.1f}" width="{pill_w:.1f}" height="{pill_h:.1f}" '
        f'rx="{pill_h/2:.1f}" fill="#ffffff" stroke="#d4cba6" stroke-width="1.5"/>'
    )
    parts.append(_multiline(
        short_domain, pill_x + pill_w/2, pill_y + 22, 14, font_weight='600', text_anchor='middle'
    ))
    # "USE THE CODE:" label + filled box with edit_code
    parts.append(_multiline(
        c['use_code'], re_x + 20, re_y + 200, 13, font_weight='800'
    ))
    code_x = re_x + 130
    code_y = re_y + 185
    code_w = re_w - 150
    code_h = 26
    parts.append(
        f'<rect x="{code_x:.1f}" y="{code_y:.1f}" width="{code_w:.1f}" height="{code_h:.1f}" '
        f'rx="6" fill="none" stroke="#bbb59a" stroke-width="1.5" stroke-dasharray="4,3"/>'
    )
    parts.append(_multiline(
        edit_code, code_x + code_w/2, code_y + 18, 15, font_weight='700',
        text_anchor='middle', fill='#0a0a0a'
    ))
    # Thanks footer
    parts.append(_multiline(
        c['thanks'], re_x + re_w/2, re_y + re_h + 18, 13, font_weight='700', text_anchor='middle'
    ))
    parts.append(
        f'<path d="M {re_x + re_w/2:.1f} {re_y + re_h + 30:.1f} '
        f'q -7 -7 -14 0 q 0 9 14 16 q 14 -7 14 -16 q -7 -7 -14 0 Z" '
        f'fill="none" stroke="#0a0a0a" stroke-width="1.5"/>'
    )

    # ============ RIGHT PANEL ============
    RX = CANVAS_W / 2 + 50
    RW = CANVAS_W / 2 - 100

    # Washer icon (top-left of right panel)
    wx = RX + 20
    wy = 60
    ws = 70
    parts.append(
        f'<g fill="none" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round">'
        f'<rect x="{wx:.1f}" y="{wy:.1f}" width="{ws:.1f}" height="{ws*0.9:.1f}" rx="6"/>'
        f'<circle cx="{wx + ws/2:.1f}" cy="{wy + ws*0.55:.1f}" r="{ws*0.28:.1f}"/>'
        f'</g>'
        f'<path d="M {wx + ws*0.5:.1f} {wy + ws*0.45:.1f} '
        f'q -4 -4 -8 0 q 0 6 8 10 q 8 -4 8 -10 q -4 -4 -8 0 Z" fill="#0a0a0a"/>'
    )

    # Title
    parts.append(_multiline(
        f'{t["care_title1"]}\n{t["care_title2"]}',
        RX + 120, 95, 36, font_weight='800'
    ))
    # Subtitle (dashed em-line + text + heart)
    parts.append(_multiline(
        f'— {c["for_long_time"]} —',
        RX + RW/2, 195, 14, fill='#2a2a2a', font_weight='600', text_anchor='middle'
    ))

    # 6 care rows
    care_items = [
        ('wash30',                        c['wash_30'],                                t.get('garment_dos_text', '') and c['wash_30_body']),
        ('garment_dos_' + garment,        t['turn_inside_out_title'],                  t['garment_dos_text']),
        ('no_bleach',                     c['no_bleach'],                              c['no_bleach_body']),
        ('no_dryer',                      c['no_dryer'],                               t['machine_dry_text']),
        ('low_iron',                      c['low_iron'],                               c['low_iron_body']),
        ('natural_dry_' + garment,        c['natural_dry'],                            t['natural_dry_text']),
    ]
    row_top = 230
    row_h = 105
    icon_size = 70
    for i, (icon_kind, title, body) in enumerate(care_items):
        ry = row_top + i * row_h
        parts.append(_care_icon(icon_kind, RX + 20, ry, icon_size))
        tx = RX + 20 + icon_size + 24
        parts.append(_multiline(title, tx, ry + 22, 17, font_weight='800'))
        parts.append(_multiline(body or '', tx, ry + 44, 12.5, fill='#2a2a2a'))
        # Separator line
        if i < len(care_items) - 1:
            parts.append(
                f'<line x1="{RX + 20:.1f}" y1="{ry + row_h - 8:.1f}" '
                f'x2="{RX + RW - 20:.1f}" y2="{ry + row_h - 8:.1f}" '
                f'stroke="#E5DDC8" stroke-width="1.5"/>'
            )

    # Footer pill at the bottom of right panel
    foot_x = RX + 20
    foot_y = row_top + len(care_items) * row_h + 15
    foot_w = RW - 40
    foot_h = 50
    parts.append(
        f'<rect x="{foot_x:.1f}" y="{foot_y:.1f}" width="{foot_w:.1f}" height="{foot_h:.1f}" '
        f'rx="{foot_h/2:.1f}" fill="#EFE7CF"/>'
    )
    # Leaf icon (left)
    lx = foot_x + 22
    ly = foot_y + foot_h/2
    parts.append(
        f'<path d="M {lx:.1f} {ly:.1f} '
        f'q -2 -14 12 -16 q 2 14 -12 16 Z" '
        f'fill="none" stroke="#0a0a0a" stroke-width="1.5"/>'
    )
    parts.append(_multiline(
        t['footer'], foot_x + foot_w/2, foot_y + foot_h/2 + 5, 13,
        font_weight='600', text_anchor='middle', fill='#0a0a0a'
    ))
    # Heart (right)
    hx = foot_x + foot_w - 25
    hy = foot_y + foot_h/2
    parts.append(
        f'<path d="M {hx:.1f} {hy:.1f} '
        f'q -7 -7 -14 0 q 0 9 14 16 q 14 -7 14 -16 q -7 -7 -14 0 Z" '
        f'fill="none" stroke="#0a0a0a" stroke-width="1.5"/>'
    )

    parts.append('</svg>')
    return ''.join(parts)
