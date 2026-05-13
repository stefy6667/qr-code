#!/usr/bin/env python3
import base64
import csv
import io
import json
import os
import sqlite3
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, UTC
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get('DATA_ROOT', str(ROOT / 'data')))
DB_PATH = Path(os.environ.get('DB_PATH', str(DATA_ROOT / 'app.db')))
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000').rstrip('/')
OUT_DIR = ROOT / 'artifacts'
OUT_DIR.mkdir(exist_ok=True)

VARIANTS = [
    ('tshirtWhite', 'tricou-alb', '#f8fafc'),
    ('tshirtBlack', 'tricou-negru', '#111827'),
    ('hoodieWhite', 'hanorac-alb', '#f8fafc'),
    ('hoodieBlack', 'hanorac-negru', '#111827'),
]


def fetch_qr_data_uri(scan_url: str) -> str:
    q = urllib.parse.quote(scan_url, safe='')
    api = f'https://api.qrserver.com/v1/create-qr-code/?size=620x620&data={q}'
    try:
        with urllib.request.urlopen(api, timeout=20) as resp:
            payload = resp.read()
        return 'data:image/png;base64,' + base64.b64encode(payload).decode('ascii')
    except Exception:
        return api


def fallback_garment_svg(kind: str, bg: str) -> str:
    label = 'Tricou' if 'tshirt' in kind else 'Hanorac'
    stroke = '#334155' if 'Black' in kind else '#cbd5e1'
    fill = '#0f172a' if 'Black' in kind else '#ffffff'
    return f'''
    <rect x="0" y="0" width="1800" height="2200" fill="{bg}"/>
    <rect x="450" y="320" width="900" height="1520" rx="120" fill="{fill}" stroke="{stroke}" stroke-width="8"/>
    <text x="900" y="920" text-anchor="middle" font-family="Arial" font-size="64" fill="#64748b">{label} mockup</text>
    '''


def compose_svg(title: str, edit_code: str, variant_key: str, template_data_url: str, qr_data_url: str) -> str:
    bg = '#0f172a' if 'Black' in variant_key else '#f8fafc'
    text_color = '#e2e8f0' if 'Black' in variant_key else '#334155'
    qr_y = 900 if 'hoodie' in variant_key else 950

    if template_data_url:
        garment = f'<image href="{template_data_url}" x="100" y="120" width="1600" height="1900" preserveAspectRatio="xMidYMid meet"/>'
    else:
        garment = fallback_garment_svg(variant_key, bg)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="2200" viewBox="0 0 1800 2200">
  <rect x="0" y="0" width="1800" height="2200" fill="{bg}"/>
  {garment}
  <rect x="566" y="{qr_y - 24}" width="668" height="668" fill="#ffffff"/>
  <image href="{qr_data_url}" x="590" y="{qr_y}" width="620" height="620"/>
  <text x="900" y="860" text-anchor="middle" font-family="Arial" font-size="44" font-weight="700" fill="{text_color}">{title}</text>
  <text x="900" y="1640" text-anchor="middle" font-family="Arial" font-size="34" fill="{text_color}">Cod editare: {edit_code}</text>
</svg>'''


def main():
    if not DB_PATH.exists():
        raise SystemExit(f'Database not found: {DB_PATH}')

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute('SELECT slug, title, edit_code, product_templates_json FROM qr_codes ORDER BY id DESC').fetchall()
    conn.close()

    ts = datetime.now(UTC).strftime('%Y%m%d-%H%M%S')
    zip_path = OUT_DIR / f'qr-product-mockups-{ts}.zip'
    manifest = io.StringIO()
    writer = csv.writer(manifest)
    writer.writerow(['slug', 'title', 'variant', 'file'])

    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for row in rows:
            slug = row['slug']
            title = row['title'] or 'QR Product'
            edit_code = row['edit_code']
            scan_url = f'{BASE_URL}/c/{slug}'
            qr_uri = fetch_qr_data_uri(scan_url)
            templates = json.loads(row['product_templates_json']) if row['product_templates_json'] else {}

            for key, label, _bg in VARIANTS:
                svg = compose_svg(title, edit_code, key, templates.get(key, ''), qr_uri)
                filename = f'{slug}-{label}.svg'
                zf.writestr(filename, svg.encode('utf-8'))
                writer.writerow([slug, title, label, filename])

        zf.writestr('manifest.csv', manifest.getvalue().encode('utf-8'))

    print(zip_path)


if __name__ == '__main__':
    main()
