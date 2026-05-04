#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get('DATA_ROOT', str(ROOT / 'data'))).resolve()
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(DATA_ROOT / 'uploads'))).resolve()
PUBLIC_DIR = ROOT / 'public'
DB_PATH = Path(os.environ.get('DB_PATH', str(DATA_ROOT / 'app.db'))).resolve()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(exist_ok=True)

ADMIN_USER = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'change-me-now')
SESSION_SECRET = os.environ.get('SESSION_SECRET', 'dev-secret-change-me')
PORT = int(os.environ.get('PORT', '3000'))
BASE_URL = os.environ.get('BASE_URL', f'http://localhost:{PORT}')


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def init_db():
    conn = db()
    conn.executescript(
        '''
        CREATE TABLE IF NOT EXISTS qr_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            edit_code TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            content_json TEXT,
            reviews_enabled INTEGER NOT NULL DEFAULT 0,
            review_embed_url TEXT,
            review_button_label TEXT,
            qr_style_preset TEXT NOT NULL DEFAULT 'aurora',
            product_templates_json TEXT
        );
        '''
    )
    columns = {row['name'] for row in conn.execute("PRAGMA table_info(qr_codes)").fetchall()}
    if 'reviews_enabled' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN reviews_enabled INTEGER NOT NULL DEFAULT 0")
    if 'review_embed_url' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN review_embed_url TEXT")
    if 'review_button_label' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN review_button_label TEXT")
    if 'qr_style_preset' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN qr_style_preset TEXT NOT NULL DEFAULT 'aurora'")
    if 'product_templates_json' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN product_templates_json TEXT")
    conn.commit()
    conn.close()


def sign_value(value: str) -> str:
    sig = hmac.new(SESSION_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f'{value}.{sig}'


def verify_signed_value(value: str | None) -> str | None:
    if not value or '.' not in value:
        return None
    raw, sig = value.rsplit('.', 1)
    expected = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected):
        return raw
    return None


def random_code(length=8):
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def random_slug(length=10):
    alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def json_response(handler, payload, status=200):
    data = json.dumps(payload).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def xml_response(handler, xml: str, status=200):
    data = xml.encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/xml; charset=utf-8')
    handler.send_header('Content-Length', str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def parse_body(handler):
    length = int(handler.headers.get('Content-Length', '0'))
    raw = handler.rfile.read(length) if length else b'{}'
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def save_data_url(data_url: str):
    if not data_url or not data_url.startswith('data:'):
        return None
    header, encoded = data_url.split(',', 1)
    mime = header.split(';')[0][5:]
    ext = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
    }.get(mime)
    if not ext:
        return None
    filename = f'{secrets.token_hex(16)}{ext}'
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(base64.b64decode(encoded))
    return f'/uploads/{filename}'


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith('/uploads/'):
            return self.serve_file(UPLOAD_DIR / path.replace('/uploads/', '', 1))
        if path == '/api/session':
            return self.handle_session()
        if path == '/api/admin/qr-codes':
            return self.handle_admin_list()
        if path.startswith('/api/public/qr/'):
            slug = path.split('/')[-1]
            return self.handle_public_qr(slug)
        if path == '/':
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path.startswith('/admin'):
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path == '/edit' or path.startswith('/edit/'):
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path.startswith('/c/'):
            slug = path.split('/')[-1]
            if parsed.query:
                params = parse_qs(parsed.query)
                if params.get('edit') == ['1']:
                    return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
            conn = db()
            row = conn.execute('SELECT content_json FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
            conn.close()
            if row and row['content_json']:
                try:
                    content = json.loads(row['content_json'])
                except json.JSONDecodeError:
                    content = {}
                action_link = content.get('actionLink') if isinstance(content, dict) else None
                action_url = action_link.get('url') if isinstance(action_link, dict) else None
                if isinstance(action_url, str):
                    action_url = action_url.strip()
                    if action_url.startswith('http://') or action_url.startswith('https://'):
                        self.send_response(302)
                        self.send_header('Location', action_url)
                        self.end_headers()
                        return
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path.startswith('/assets/'):
            return self.serve_file(PUBLIC_DIR / path.replace('/assets/', '', 1))
        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/api/login':
            return self.handle_login()
        if path == '/api/logout':
            return self.handle_logout()
        if path == '/api/admin/qr-codes':
            return self.handle_admin_create()
        if path == '/twilio/voice':
            return self.handle_twilio_voice()
        if path.startswith('/api/admin/qr/') and path.endswith('/settings'):
            slug = path.split('/')[-2]
            return self.handle_admin_settings(slug)
        if path.startswith('/api/public/qr/') and path.endswith('/verify-edit-code'):
            slug = path.split('/')[-2]
            return self.handle_public_verify(slug)
        if path.startswith('/api/public/qr/') and path.endswith('/save'):
            slug = path.split('/')[-2]
            return self.handle_public_save(slug)
        self.send_error(404)

    def serve_file(self, filepath: Path, content_type=None):
        if not filepath.exists() or not filepath.is_file():
            return self.send_error(404)
        data = filepath.read_bytes()
        if not content_type:
            if filepath.suffix == '.css':
                content_type = 'text/css; charset=utf-8'
            elif filepath.suffix == '.js':
                content_type = 'application/javascript; charset=utf-8'
            elif filepath.suffix == '.png':
                content_type = 'image/png'
            elif filepath.suffix == '.jpg' or filepath.suffix == '.jpeg':
                content_type = 'image/jpeg'
            elif filepath.suffix == '.webp':
                content_type = 'image/webp'
            elif filepath.suffix == '.mp4':
                content_type = 'video/mp4'
            elif filepath.suffix == '.webm':
                content_type = 'video/webm'
            else:
                content_type = 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def get_cookies(self):
        cookie = SimpleCookie()
        if self.headers.get('Cookie'):
            cookie.load(self.headers.get('Cookie'))
        return cookie

    def is_admin(self):
        cookies = self.get_cookies()
        session = cookies.get('session')
        return verify_signed_value(session.value if session else None) == ADMIN_USER

    def require_admin(self):
        if not self.is_admin():
            json_response(self, {'error': 'Unauthorized'}, 401)
            return False
        return True

    def handle_session(self):
        json_response(self, {'authenticated': self.is_admin(), 'username': ADMIN_USER if self.is_admin() else None})

    def handle_login(self):
        body = parse_body(self)
        if body.get('username') == ADMIN_USER and body.get('password') == ADMIN_PASSWORD:
            cookie_value = sign_value(ADMIN_USER)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Set-Cookie', f'session={cookie_value}; HttpOnly; Path=/; SameSite=Lax')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
            return
        json_response(self, {'error': 'Credențiale invalide'}, 401)

    def handle_logout(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Set-Cookie', 'session=; Max-Age=0; Path=/; SameSite=Lax')
        self.end_headers()
        self.wfile.write(json.dumps({'ok': True}).encode())

    def handle_admin_list(self):
        if not self.require_admin():
            return
        conn = db()
        rows = conn.execute('SELECT * FROM qr_codes ORDER BY id DESC').fetchall()
        conn.close()
        payload = []
        for row in rows:
            content = json.loads(row['content_json']) if row['content_json'] else None
            product_templates = json.loads(row['product_templates_json']) if row['product_templates_json'] else {}
            payload.append({
                'id': row['id'],
                'slug': row['slug'],
                'editCode': row['edit_code'],
                'title': row['title'],
                'createdAt': row['created_at'],
                'updatedAt': row['updated_at'],
                'content': content,
                'googleReviews': {
                    'enabled': bool(row['reviews_enabled']),
                    'embedUrl': row['review_embed_url'] or '',
                    'buttonLabel': row['review_button_label'] or 'Recenzii Google',
                },
                'qrStylePreset': row['qr_style_preset'] or 'aurora',
                'productTemplates': product_templates,
                'scanUrl': f'{BASE_URL}/c/{row["slug"]}',
                'qrImageUrl': f'https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&data={quote(f"{BASE_URL}/c/{row["slug"]}", safe="")}',
            })
        json_response(self, {'items': payload})

    def handle_admin_create(self):
        if not self.require_admin():
            return
        body = parse_body(self)
        title = (body.get('title') or '').strip() or 'Cod QR nou'
        conn = db()
        slug = random_slug()
        edit_code = random_code()
        conn.execute('INSERT INTO qr_codes (slug, edit_code, title) VALUES (?, ?, ?)', (slug, edit_code, title))
        conn.commit()
        conn.close()
        json_response(self, {'ok': True, 'slug': slug, 'editCode': edit_code})

    def handle_twilio_voice(self):
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Response>'
            '<Say voice="alice" language="en-US">'
            'The QR Studio Twilio webhook endpoint is reachable, but voice flow is not configured yet.'
            '</Say>'
            '<Pause length="1"/>'
            '<Say voice="alice" language="en-US">Please contact support to configure your call flow.</Say>'
            '</Response>'
        )
        return xml_response(self, twiml)

    def handle_admin_settings(self, slug):
        if not self.require_admin():
            return
        body = parse_body(self)
        conn = db()
        row = conn.execute('SELECT slug FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        if not row:
            conn.close()
            return json_response(self, {'error': 'Codul QR nu există.'}, 404)
        reviews_enabled = 1 if body.get('googleReviews', {}).get('enabled') else 0
        review_embed_url = (body.get('googleReviews', {}).get('embedUrl') or '').strip()
        review_button_label = (body.get('googleReviews', {}).get('buttonLabel') or 'Recenzii Google').strip()
        qr_style_preset = (body.get('qrStylePreset') or 'aurora').strip() or 'aurora'
        product_templates = body.get('productTemplates') if isinstance(body.get('productTemplates'), dict) else {}
        product_templates_json = json.dumps(product_templates)
        title = (body.get('title') or '').strip()
        if title:
            conn.execute(
                'UPDATE qr_codes SET title = ?, reviews_enabled = ?, review_embed_url = ?, review_button_label = ?, qr_style_preset = ?, product_templates_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
                (title, reviews_enabled, review_embed_url, review_button_label, qr_style_preset, product_templates_json, slug),
            )
        else:
            conn.execute(
                'UPDATE qr_codes SET reviews_enabled = ?, review_embed_url = ?, review_button_label = ?, qr_style_preset = ?, product_templates_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
                (reviews_enabled, review_embed_url, review_button_label, qr_style_preset, product_templates_json, slug),
            )
        conn.commit()
        conn.close()
        return json_response(self, {'ok': True})

    def handle_public_qr(self, slug):
        conn = db()
        row = conn.execute('SELECT * FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        conn.close()
        if not row:
            return json_response(self, {'error': 'Codul QR nu există.'}, 404)
        content = json.loads(row['content_json']) if row['content_json'] else None
        json_response(self, {
            'slug': row['slug'],
            'title': row['title'],
            'editCodeHint': row['edit_code'][-3:],
            'hasContent': bool(content),
            'content': content,
            'googleReviews': {
                'enabled': bool(row['reviews_enabled']),
                'embedUrl': row['review_embed_url'] or '',
                'buttonLabel': row['review_button_label'] or 'Recenzii Google',
            },
        })

    def handle_public_verify(self, slug):
        body = parse_body(self)
        conn = db()
        row = conn.execute('SELECT edit_code FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        conn.close()
        if not row:
            return json_response(self, {'error': 'Codul QR nu există.'}, 404)
        supplied_code = (body.get('editCode') or '').strip().upper()
        if supplied_code != row['edit_code']:
            return json_response(self, {'error': 'Codul de editare este invalid.'}, 403)
        return json_response(self, {'ok': True})

    def handle_public_save(self, slug):
        body = parse_body(self)
        conn = db()
        row = conn.execute('SELECT * FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        if not row:
            conn.close()
            return json_response(self, {'error': 'Codul QR nu există.'}, 404)
        supplied_code = (body.get('editCode') or '').strip().upper()
        existing_content = json.loads(row['content_json']) if row['content_json'] else None
        if existing_content and supplied_code != row['edit_code']:
            conn.close()
            return json_response(self, {'error': 'Codul de editare este invalid.'}, 403)

        image_url = body.get('imageUrl')
        video_url = body.get('videoUrl')
        if body.get('imageDataUrl'):
            image_url = save_data_url(body['imageDataUrl'])
        if body.get('videoDataUrl'):
            video_url = save_data_url(body['videoDataUrl'])
        content = {
            'headline': (body.get('headline') or '').strip(),
            'body': (body.get('body') or '').strip(),
            'buttonLabel': (body.get('buttonLabel') or 'Editează cu codul unic').strip(),
            'theme': {
                'background': body.get('theme', {}).get('background', '#0f172a'),
                'foreground': body.get('theme', {}).get('foreground', '#f8fafc'),
                'accent': body.get('theme', {}).get('accent', '#38bdf8'),
                'fontFamily': body.get('theme', {}).get('fontFamily', 'Inter, sans-serif'),
                'textAlign': body.get('theme', {}).get('textAlign', 'left'),
            },
            'imageUrl': image_url,
            'videoUrl': video_url,
            'actionLink': body.get('actionLink') if isinstance(body.get('actionLink'), dict) else None,
        }
        conn.execute('UPDATE qr_codes SET content_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?', (json.dumps(content), slug))
        conn.commit()
        conn.close()
        json_response(self, {'ok': True})

    def log_message(self, format, *args):
        sys.stdout.write('%s - - [%s] %s\n' % (self.address_string(), self.log_date_time_string(), format % args))


if __name__ == '__main__':
    init_db()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Server running on http://0.0.0.0:{PORT}')
    server.serve_forever()
