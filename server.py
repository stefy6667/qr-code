#!/usr/bin/env python3
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import sys
import zipfile
from datetime import datetime
from typing import Optional
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import qr_style
import qr_raster
import postcard

ROOT = Path(__file__).resolve().parent

# Sentinel batch label used to refer to codes that have NO batch_label set
# (bulk-created without a name, or single one-off codes). Lets the
# batches-list/delete/export endpoints address that group explicitly,
# without risking an accidental match-everything bug from treating a plain
# empty string as "no filter".
NO_BATCH_SENTINEL = '__no_batch__'
DATA_ROOT = Path(os.environ.get('DATA_ROOT', str(ROOT / 'data'))).resolve()
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(DATA_ROOT / 'uploads'))).resolve()
PUBLIC_DIR = ROOT / 'public'
DB_PATH = Path(os.environ.get('DB_PATH', str(DATA_ROOT / 'app.db'))).resolve()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(exist_ok=True)

ADMIN_USER = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'change-me-now')
ADMIN_PATH = '/private-admin'
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
            product_templates_json TEXT,
            scan_count INTEGER NOT NULL DEFAULT 0,
            like_count INTEGER NOT NULL DEFAULT 0,
            dislike_count INTEGER NOT NULL DEFAULT 0
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
    if 'scan_count' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN scan_count INTEGER NOT NULL DEFAULT 0")
    if 'like_count' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0")
    if 'dislike_count' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN dislike_count INTEGER NOT NULL DEFAULT 0")
    if 'center_icon' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN center_icon TEXT")
    if 'batch_label' not in columns:
        conn.execute("ALTER TABLE qr_codes ADD COLUMN batch_label TEXT")
    conn.commit()
    conn.close()


def sign_value(value: str) -> str:
    sig = hmac.new(SESSION_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f'{value}.{sig}'


def verify_signed_value(value: Optional[str]) -> Optional[str]:
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


def svg_response(handler, svg: str, status=200, cacheable: bool = True):
    data = svg.encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'image/svg+xml; charset=utf-8')
    handler.send_header('Content-Length', str(len(data)))
    # The QR design is deterministic per (data, preset, size, colors).
    # Browsers can cache it; we send no-store for safety on the per-slug
    # endpoint since BASE_URL changes would change the encoded payload.
    handler.send_header('Cache-Control', 'public, max-age=3600' if cacheable else 'no-store')
    handler.send_header('Access-Control-Allow-Origin', '*')
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



def content_action_url(content):
    if not isinstance(content, dict):
        return ''
    action_link = content.get('actionLink')
    action_url = action_link.get('url') if isinstance(action_link, dict) else ''
    return action_url.strip() if isinstance(action_url, str) else ''


def content_has_external_link(content):
    action_url = content_action_url(content)
    return action_url.startswith('http://') or action_url.startswith('https://')


def content_has_votable_material(content):
    if not isinstance(content, dict):
        return False
    return any(str(content.get(key) or '').strip() for key in ('body', 'headline', 'imageUrl', 'videoUrl'))


def content_is_voting_eligible(content):
    if not isinstance(content, dict):
        return False
    return bool(content.get('votingEligible')) and content_has_votable_material(content) and not content_has_external_link(content)

def increment_scan_count(slug):
    conn = db()
    conn.execute('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE slug = ?', (slug,))
    conn.commit()
    conn.close()


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
        if path == '/api/admin/export-csv':
            return self.handle_export_csv(parsed)
        if path == '/api/admin/export-dtf-zip':
            return self.handle_export_dtf_zip(parsed)
        if path == '/api/admin/batches':
            return self.handle_list_batches()
        if path == '/api/public/top-voting':
            return self.handle_top_voting()
        if path.startswith('/api/public/qr/'):
            slug = path.split('/')[-1]
            return self.handle_public_qr(slug)
        if path == '/qr.svg':
            return self.handle_qr_svg_raw(parsed)
        if path.startswith('/qr/') and path.endswith('.svg'):
            slug = path[len('/qr/'):-len('.svg')]
            return self.handle_qr_svg_for_slug(slug, parsed)
        if path.startswith('/admin/postcard/'):
            slug = path[len('/admin/postcard/'):]
            return self.handle_postcard(slug, parsed)
        if path == '/':
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path == '/admin' or path.startswith('/admin/'):
            self.send_response(302)
            self.send_header('Location', '/edit')
            self.end_headers()
            return
        if path == ADMIN_PATH or path.startswith(f'{ADMIN_PATH}/'):
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path == '/edit' or path.startswith('/edit/'):
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path == '/top-voting' or path.startswith('/top-voting/'):
            return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
        if path.startswith('/c/'):
            slug = path.split('/')[-1]
            if parsed.query:
                params = parse_qs(parsed.query)
                if params.get('edit') == ['1']:
                    return self.serve_file(PUBLIC_DIR / 'index.html', content_type='text/html; charset=utf-8')
            increment_scan_count(slug)
            conn = db()
            row = conn.execute('SELECT content_json FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
            conn.close()
            if row and row['content_json']:
                try:
                    content = json.loads(row['content_json'])
                except json.JSONDecodeError:
                    content = {}
                action_url = content_action_url(content)
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
        if path == '/api/admin/bulk-create':
            return self.handle_bulk_create()
        if path == '/api/admin/delete-batch':
            return self.handle_delete_batch()
        if path == '/twilio/voice':
            return self.handle_twilio_voice()
        if path.startswith('/api/admin/qr/') and path.endswith('/settings'):
            slug = path.split('/')[-2]
            return self.handle_admin_settings(slug)
        if path == '/api/public/resolve-edit-code':
            return self.handle_resolve_edit_code()
        if path.startswith('/api/public/qr/') and path.endswith('/verify-edit-code'):
            slug = path.split('/')[-2]
            return self.handle_public_verify(slug)
        if path.startswith('/api/public/qr/') and path.endswith('/save'):
            slug = path.split('/')[-2]
            return self.handle_public_save(slug)
        if path.startswith('/api/public/qr/') and path.endswith('/vote'):
            slug = path.split('/')[-2]
            return self.handle_public_vote(slug)
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
        if filepath.suffix in {'.html', '.js', '.css'}:
            self.send_header('Cache-Control', 'no-store, max-age=0')
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
                'centerIcon': row['center_icon'] or '',
                'batchLabel': row['batch_label'] or '',
                'productTemplates': product_templates,
                'scanCount': row['scan_count'] or 0,
                'likeCount': row['like_count'] or 0,
                'dislikeCount': row['dislike_count'] or 0,
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

    def handle_bulk_create(self):
        """Create N codes in one go, optionally tagged with a batch label.

        Body: {"count": 100, "batchLabel": "Campanie Mai", "titlePrefix": "QR"}
        Two modes:
          - Legacy: {"count": 50, "batchLabel": "...", "titlePrefix": "..."}
            creates `count` codes with no preset assigned (uses whatever
            default the editor applies).
          - Multi-model: {"models": ["instagramGlow", "whiteOnBlack"],
            "perModel": 15, "batchLabel": "...", "titlePrefix": "..."}
            creates `perModel` codes for EACH model listed, each one tagged
            with that model as its qr_style_preset — e.g. 3 models x 15 =
            45 codes total. This is the production-batch mode used for DTF
            print runs across several QR designs at once.

        Returns the list of created {slug, editCode, qrStylePreset}.
        """
        if not self.require_admin():
            return
        body = parse_body(self)
        batch_label = (body.get('batchLabel') or '').strip()
        if not batch_label:
            # Never store a NULL/empty batch_label — codes with no name end
            # up impossible to find or delete as a group later. Auto-name
            # using the creation timestamp instead.
            batch_label = f'Lot-{datetime.now().strftime("%Y%m%d-%H%M%S")}'
        title_prefix = (body.get('titlePrefix') or 'Cod QR').strip() or 'Cod QR'

        models = body.get('models')
        if isinstance(models, list) and models:
            # De-duplicate while preserving order first — repeating a model
            # name in the input (e.g. a copy-paste mistake in the prompt)
            # must NOT multiply how many codes that model gets. Without
            # this, ["mono","mono","whiteOnBlack"] would silently create
            # 2x as many "mono" codes as "whiteOnBlack" ones.
            seen = set()
            deduped = []
            for m in models:
                if isinstance(m, str) and m not in seen:
                    seen.add(m)
                    deduped.append(m)
            duplicates_removed = len(models) - len(deduped)

            valid_models = [m for m in deduped if m in qr_style.ALL_PRESETS]
            invalid_models = [m for m in deduped if m not in qr_style.ALL_PRESETS]
            if not valid_models:
                return json_response(
                    self,
                    {'ok': False, 'error': f'No valid models. Allowed: {", ".join(sorted(qr_style.ALL_PRESETS))}'},
                    status=400,
                )
            try:
                per_model = int(body.get('perModel') or 0)
            except (TypeError, ValueError):
                per_model = 0
            if per_model < 1 or per_model > 200:
                return json_response(self, {'ok': False, 'error': 'perModel must be between 1 and 200'}, status=400)

            conn = db()
            created = []
            counts_by_model = {}
            for model in valid_models:
                made_for_model = 0
                for i in range(per_model):
                    for _attempt in range(8):
                        slug = random_slug()
                        edit_code = random_code()
                        try:
                            conn.execute(
                                'INSERT INTO qr_codes (slug, edit_code, title, batch_label, qr_style_preset) '
                                'VALUES (?, ?, ?, ?, ?)',
                                (slug, edit_code, f'{title_prefix} {model} {i + 1}', batch_label, model),
                            )
                            created.append({'slug': slug, 'editCode': edit_code, 'qrStylePreset': model})
                            made_for_model += 1
                            break
                        except sqlite3.IntegrityError:
                            continue
                    else:
                        # All retry attempts collided — surface this loudly
                        # instead of silently shipping fewer codes than
                        # requested for this model with no indication why.
                        conn.rollback()
                        conn.close()
                        return json_response(self, {
                            'ok': False,
                            'error': f'Could not generate a unique code for model "{model}" '
                                     f'(item {i + 1}/{per_model}) after 8 attempts. No codes from '
                                     f'this request were saved — try again.',
                        }, status=500)
                counts_by_model[model] = made_for_model
            conn.commit()
            conn.close()
            json_response(self, {
                'ok': True, 'created': len(created), 'batchLabel': batch_label,
                'models': valid_models, 'invalidModels': invalid_models,
                'duplicatesRemoved': duplicates_removed, 'perModel': per_model,
                'countsByModel': counts_by_model, 'items': created,
            })
            return

        # Legacy single-count mode.
        try:
            count = int(body.get('count') or 0)
        except (TypeError, ValueError):
            count = 0
        if count < 1 or count > 1000:
            return json_response(self, {'ok': False, 'error': 'count must be between 1 and 1000'}, status=400)

        conn = db()
        created = []
        for i in range(count):
            # Retry on the rare slug/edit_code collision.
            for _attempt in range(5):
                slug = random_slug()
                edit_code = random_code()
                try:
                    conn.execute(
                        'INSERT INTO qr_codes (slug, edit_code, title, batch_label) VALUES (?, ?, ?, ?)',
                        (slug, edit_code, f'{title_prefix} {i + 1}', batch_label),
                    )
                    created.append({'slug': slug, 'editCode': edit_code})
                    break
                except sqlite3.IntegrityError:
                    continue
        conn.commit()
        conn.close()
        json_response(self, {'ok': True, 'created': len(created), 'batchLabel': batch_label, 'items': created})

    def handle_list_batches(self):
        """List every distinct batch label with its code count, the set of
        models in it, and the most recent creation timestamp — sorted
        newest first, so the top row is always "the last batch generated".

        Codes with no batch_label set (orphaned — e.g. created before this
        column existed, or via an old client that didn't send one) are
        grouped under NO_BATCH_SENTINEL instead of being silently excluded,
        so they stay reachable for export/deletion.
        """
        if not self.require_admin():
            return
        conn = db()
        rows = conn.execute(
            'SELECT batch_label, '
            'COUNT(*) as count, '
            'GROUP_CONCAT(DISTINCT qr_style_preset) as models, '
            'MAX(created_at) as latest, '
            'MIN(created_at) as earliest '
            'FROM qr_codes '
            'WHERE batch_label IS NOT NULL AND batch_label != "" '
            'GROUP BY batch_label '
            'ORDER BY latest DESC'
        ).fetchall()
        orphan = conn.execute(
            'SELECT COUNT(*) as count, '
            'GROUP_CONCAT(DISTINCT qr_style_preset) as models, '
            'MAX(created_at) as latest, '
            'MIN(created_at) as earliest '
            'FROM qr_codes '
            "WHERE batch_label IS NULL OR batch_label = ''"
        ).fetchone()
        conn.close()
        batches = [{
            'batchLabel': row['batch_label'],
            'count': row['count'],
            'models': sorted(set((row['models'] or '').split(','))),
            'latest': row['latest'],
            'earliest': row['earliest'],
        } for row in rows]
        if orphan and orphan['count']:
            batches.append({
                'batchLabel': NO_BATCH_SENTINEL,
                'count': orphan['count'],
                'models': sorted(set((orphan['models'] or '').split(','))),
                'latest': orphan['latest'],
                'earliest': orphan['earliest'],
            })
        batches.sort(key=lambda b: b['latest'], reverse=True)
        json_response(self, {'ok': True, 'batches': batches})

    def handle_delete_batch(self):
        """Permanently delete every code in a batch.

        Body: {"batchLabel": "Campanie Mai"}  (exact match, case-sensitive)
        — or NO_BATCH_SENTINEL to delete codes that were created with no
        batch name at all (otherwise unreachable/undeletable as a group).

        This is destructive and irreversible — any printed garment whose
        code falls in this batch stops working immediately (its scan_url
        and edit_url both 404). Intended for cleaning up test batches or
        botched production runs before they're handed to a print shop, not
        for batches already in the field.
        """
        if not self.require_admin():
            return
        body = parse_body(self)
        raw = (body.get('batchLabel') or '').strip()
        if not raw:
            return json_response(self, {'ok': False, 'error': 'batchLabel is required'}, status=400)
        conn = db()
        if raw == NO_BATCH_SENTINEL:
            cur = conn.execute("DELETE FROM qr_codes WHERE batch_label IS NULL OR batch_label = ''")
        else:
            cur = conn.execute('DELETE FROM qr_codes WHERE batch_label = ?', (raw,))
        deleted = cur.rowcount
        conn.commit()
        conn.close()
        if deleted == 0:
            return json_response(self, {'ok': False, 'error': f'No codes found in batch "{raw}"'}, status=404)
        json_response(self, {'ok': True, 'deleted': deleted, 'batchLabel': raw})

    def handle_export_csv(self, parsed):
        """Download a CSV register of all codes (optionally filtered by batch).

        Query: ?batch=<label>  (optional — omit for all codes; pass
        NO_BATCH_SENTINEL to export only the no-batch-name group)
        """
        if not self.require_admin():
            return
        params = parse_qs(parsed.query)
        batch = (params.get('batch', [''])[0] or '').strip()
        conn = db()
        if batch == NO_BATCH_SENTINEL:
            rows = conn.execute(
                'SELECT id, slug, edit_code, title, batch_label, qr_style_preset, created_at, scan_count '
                "FROM qr_codes WHERE batch_label IS NULL OR batch_label = '' ORDER BY qr_style_preset, id"
            ).fetchall()
        elif batch:
            rows = conn.execute(
                'SELECT id, slug, edit_code, title, batch_label, qr_style_preset, created_at, scan_count '
                'FROM qr_codes WHERE batch_label = ? ORDER BY qr_style_preset, id',
                (batch,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT id, slug, edit_code, title, batch_label, qr_style_preset, created_at, scan_count '
                'FROM qr_codes ORDER BY qr_style_preset, id'
            ).fetchall()
        conn.close()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            'nr', 'slug', 'scan_url', 'edit_code', 'edit_url',
            'title', 'batch', 'model', 'created_at', 'scan_count',
        ])
        for idx, row in enumerate(rows, start=1):
            scan_url = f'{BASE_URL}/c/{row["slug"]}'
            edit_url = f'{BASE_URL}/edit?code={row["edit_code"]}'
            writer.writerow([
                idx, row['slug'], scan_url, row['edit_code'], edit_url,
                row['title'], row['batch_label'] or '', row['qr_style_preset'] or '',
                row['created_at'], row['scan_count'],
            ])
        data = buf.getvalue().encode('utf-8-sig')  # BOM so Excel shows diacritics

        self.send_response(200)
        self.send_header('Content-Type', 'text/csv; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        fname = f'qr-register{"-" + batch if batch else ""}.csv'
        self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def handle_export_dtf_zip(self, parsed):
        """Download a ZIP of print-ready QR PNGs for a batch (or all).

        Query:
            ?batch=<label>      optional batch filter
            ?preset=<preset>    force one style for ALL codes (optional —
                                 by default each code uses its own assigned
                                 qr_style_preset, which is how multi-model
                                 batches from bulk-create come out correctly
                                 organized into one folder per model)
            ?sizeMm=<float>     physical size in mm (default 170 = 17cm × 17cm)
                                 rendered at 300 DPI — no need to specify DPI

        Each PNG has a FULLY TRANSPARENT background at exactly 300 DPI.
        The DPI value is embedded in the PNG metadata so design software
        and RIP printers open it at the correct physical size automatically.
        if not self.require_admin():
            return
        params = parse_qs(parsed.query)
        batch = (params.get('batch', [''])[0] or '').strip()
        # Empty string means "use each code's own preset" — only force a
        # single style across the whole batch if explicitly requested.
        forced_preset = (params.get('preset', [''])[0] or '').strip()
        try:
            size_mm = float(params.get('sizeMm', ['170'])[0])
        except (TypeError, ValueError):
            size_mm = 170.0
        size_mm = max(10.0, min(size_mm, 500.0))

        conn = db()
        if batch == NO_BATCH_SENTINEL:
            rows = conn.execute(
                'SELECT slug, edit_code, qr_style_preset FROM qr_codes '
                "WHERE batch_label IS NULL OR batch_label = '' ORDER BY qr_style_preset, id"
            ).fetchall()
        elif batch:
            rows = conn.execute(
                'SELECT slug, edit_code, qr_style_preset FROM qr_codes '
                'WHERE batch_label = ? ORDER BY qr_style_preset, id',
                (batch,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT slug, edit_code, qr_style_preset FROM qr_codes '
                'ORDER BY qr_style_preset, id'
            ).fetchall()
        conn.close()

        zip_buf = io.BytesIO()
        per_model_counter = {}
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for row in rows:
                scan_url = f'{BASE_URL}/c/{row["slug"]}'
                use_preset = forced_preset or row['qr_style_preset'] or 'whiteOnBlack'
                if use_preset not in qr_style.ALL_PRESETS:
                    use_preset = 'whiteOnBlack'
                try:
                    png_bytes = qr_raster.build_print_ready_png(
                        scan_url,
                        preset=use_preset,
                        edit_code=row['edit_code'],
                        qr_size_mm=size_mm,
                        dpi=300,
                    )
                except Exception:
                    continue
                per_model_counter[use_preset] = per_model_counter.get(use_preset, 0) + 1
                model_idx = per_model_counter[use_preset]
                zf.writestr(f'{use_preset}/{model_idx:03d}-{row["slug"]}.png', png_bytes)
        data = zip_buf.getvalue()

        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Length', str(len(data)))
        fname = f'qr-dtf{"-" + batch if batch else ""}.zip'
        self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

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

    def handle_qr_svg_raw(self, parsed):
        """Generic SVG generator: /qr.svg?data=...&preset=...&size=...

        Used for previews / arbitrary URLs (e.g. before a code is saved).
        """
        params = parse_qs(parsed.query)
        data = (params.get('data', [''])[0] or '').strip()
        if not data:
            return self.send_error(400, 'data parameter is required')
        preset = (params.get('preset', ['instagramGlow'])[0] or 'instagramGlow').strip()
        try:
            size = max(64, min(4000, int(params.get('size', ['1200'])[0])))
        except (TypeError, ValueError):
            size = 1200
        # Optional color overrides
        kwargs = {}
        for key in ('gradient_top', 'gradient_mid', 'gradient_bottom', 'background'):
            val = (params.get(key, [''])[0] or '').strip()
            if val:
                # Tolerate URL-encoded '#'; accept bare 6-digit hex too
                if not val.startswith('#'):
                    val = '#' + val
                kwargs[key] = val
        icon = (params.get('icon', [''])[0] or '').strip().lower()
        if icon in {'facebook', 'instagram', 'tiktok'}:
            kwargs['center_icon'] = icon
        try:
            svg = qr_style.build_svg(data, size=size, preset=preset, **kwargs)
        except Exception as e:
            return self.send_error(500, f'QR generation failed: {e}')
        return svg_response(self, svg)

    def handle_postcard(self, slug, parsed):
        """/admin/postcard/<slug>?garment=tshirt|hoodie

        Returns a composite SVG postcard with the scan QR baked onto the
        garment illustration plus a small re-edit QR and the edit code.
        Admin-only (the edit code is sensitive)."""
        if not self.require_admin():
            return
        params = parse_qs(parsed.query)
        garment = (params.get('garment', ['tshirt'])[0] or 'tshirt').lower()
        if garment not in ('tshirt', 'hoodie'):
            garment = 'tshirt'
        conn = db()
        row = conn.execute(
            'SELECT slug, edit_code, qr_style_preset, center_icon FROM qr_codes WHERE slug = ?',
            (slug,),
        ).fetchone()
        conn.close()
        if not row:
            return self.send_error(404)
        scan_url = f'{BASE_URL}/c/{row["slug"]}'
        edit_url = f'{BASE_URL}/edit?code={row["edit_code"]}'
        short_domain = urlparse(BASE_URL).netloc or BASE_URL
        center_icon = (row['center_icon'] or '').strip().lower()
        if center_icon not in {'facebook', 'instagram', 'tiktok'}:
            center_icon = None
        try:
            svg = postcard.build_postcard_svg(
                scan_url=scan_url,
                edit_url=edit_url,
                edit_code=row['edit_code'],
                short_domain=short_domain,
                garment=garment,
                qr_preset=row['qr_style_preset'] or 'instagramGlow',
                qr_center_icon=center_icon,
            )
        except Exception as e:
            return self.send_error(500, f'Postcard generation failed: {e}')
        # Inline SVG download — filename hint via Content-Disposition.
        data = svg.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'image/svg+xml; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        filename = f'postcard-{garment}-{slug}.svg'
        self.send_header('Content-Disposition', f'inline; filename="{filename}"')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def handle_qr_svg_for_slug(self, slug, parsed):
        """/qr/<slug>.svg — encodes the public scan URL, uses preset from DB."""
        conn = db()
        row = conn.execute(
            'SELECT slug, qr_style_preset, center_icon FROM qr_codes WHERE slug = ?',
            (slug,),
        ).fetchone()
        conn.close()
        if not row:
            return self.send_error(404)
        params = parse_qs(parsed.query)
        try:
            size = max(64, min(4000, int(params.get('size', ['1200'])[0])))
        except (TypeError, ValueError):
            size = 1200
        preset = (params.get('preset', [None])[0]
                  or row['qr_style_preset']
                  or 'instagramGlow')
        # icon: query param overrides DB; explicit ?icon=none clears it
        icon_override = (params.get('icon', [None])[0] or '').strip().lower()
        if icon_override == 'none':
            icon = None
        elif icon_override in {'facebook', 'instagram', 'tiktok'}:
            icon = icon_override
        else:
            stored = (row['center_icon'] or '').strip().lower()
            icon = stored if stored in {'facebook', 'instagram', 'tiktok'} else None
        scan_url = f'{BASE_URL}/c/{row["slug"]}'
        try:
            svg = qr_style.build_svg(scan_url, size=size, preset=preset, center_icon=icon)
        except Exception as e:
            return self.send_error(500, f'QR generation failed: {e}')
        return svg_response(self, svg)

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
        center_icon_raw = (body.get('centerIcon') or '').strip().lower()
        center_icon = center_icon_raw if center_icon_raw in {'facebook', 'instagram', 'tiktok'} else None
        product_templates = body.get('productTemplates') if isinstance(body.get('productTemplates'), dict) else {}
        product_templates_json = json.dumps(product_templates)
        title = (body.get('title') or '').strip()
        if title:
            conn.execute(
                'UPDATE qr_codes SET title = ?, reviews_enabled = ?, review_embed_url = ?, review_button_label = ?, qr_style_preset = ?, center_icon = ?, product_templates_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
                (title, reviews_enabled, review_embed_url, review_button_label, qr_style_preset, center_icon, product_templates_json, slug),
            )
        else:
            conn.execute(
                'UPDATE qr_codes SET reviews_enabled = ?, review_embed_url = ?, review_button_label = ?, qr_style_preset = ?, center_icon = ?, product_templates_json = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
                (reviews_enabled, review_embed_url, review_button_label, qr_style_preset, center_icon, product_templates_json, slug),
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
            'scanCount': row['scan_count'] or 0,
            'likeCount': row['like_count'] or 0,
            'dislikeCount': row['dislike_count'] or 0,
            'votingEligible': content_is_voting_eligible(content),
            'hasContent': bool(content),
            'content': content,
            'googleReviews': {
                'enabled': bool(row['reviews_enabled']),
                'embedUrl': row['review_embed_url'] or '',
                'buttonLabel': row['review_button_label'] or 'Recenzii Google',
            },
        })

    def handle_top_voting(self):
        conn = db()
        rows = conn.execute('''
            SELECT slug, scan_count, like_count, dislike_count, content_json
            FROM qr_codes
            WHERE content_json IS NOT NULL
        ''').fetchall()
        conn.close()
        items = []
        for row in rows:
            content = json.loads(row['content_json']) if row['content_json'] else {}
            if not content_is_voting_eligible(content):
                continue
            items.append({
                'slug': row['slug'],
                'scanCount': row['scan_count'] or 0,
                'likeCount': row['like_count'] or 0,
                'dislikeCount': row['dislike_count'] or 0,
                'text': (content.get('body') or content.get('headline') or '') if isinstance(content, dict) else '',
                'imageUrl': content.get('imageUrl') if isinstance(content, dict) else '',
                'videoUrl': content.get('videoUrl') if isinstance(content, dict) else '',
                'url': f'{BASE_URL}/c/{row["slug"]}',
            })
        items.sort(key=lambda item: (item['likeCount'], item['scanCount']), reverse=True)
        return json_response(self, {'items': items[:50]})

    def handle_resolve_edit_code(self):
        body = parse_body(self)
        supplied_code = (body.get('editCode') or '').strip().upper()
        if not supplied_code:
            return json_response(self, {'error': 'Codul de editare este obligatoriu.'}, 400)
        conn = db()
        row = conn.execute('SELECT slug FROM qr_codes WHERE edit_code = ?', (supplied_code,)).fetchone()
        conn.close()
        if not row:
            return json_response(self, {'error': 'Codul de editare este invalid.'}, 403)
        return json_response(self, {'ok': True, 'slug': row['slug']})

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

    def handle_public_vote(self, slug):
        body = parse_body(self)
        vote = (body.get('vote') or '').strip().lower()
        if vote not in {'like', 'dislike'}:
            return json_response(self, {'error': 'Vot invalid.'}, 400)
        column = 'like_count' if vote == 'like' else 'dislike_count'
        conn = db()
        row = conn.execute('SELECT content_json FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        if not row:
            conn.close()
            return json_response(self, {'error': 'Codul QR nu există.'}, 404)
        content = json.loads(row['content_json']) if row['content_json'] else None
        if not content_is_voting_eligible(content):
            conn.close()
            return json_response(self, {'error': 'Acest conținut nu este eligibil pentru voting.'}, 403)
        conn.execute(f'UPDATE qr_codes SET {column} = {column} + 1 WHERE slug = ?', (slug,))
        updated = conn.execute('SELECT like_count, dislike_count FROM qr_codes WHERE slug = ?', (slug,)).fetchone()
        conn.commit()
        conn.close()
        return json_response(self, {
            'ok': True,
            'likeCount': updated['like_count'] or 0,
            'dislikeCount': updated['dislike_count'] or 0,
        })

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
                'background': body.get('theme', {}).get('background', '#171717'),
                'foreground': body.get('theme', {}).get('foreground', '#f8fafc'),
                'accent': body.get('theme', {}).get('accent', '#9ca3af'),
                'fontFamily': body.get('theme', {}).get('fontFamily', 'Inter, sans-serif'),
                'textAlign': body.get('theme', {}).get('textAlign', 'left'),
            },
            'textStyle': body.get('textStyle') if isinstance(body.get('textStyle'), dict) else {},
            'votingEligible': bool(body.get('votingEligible')),
            'imageUrl': image_url,
            'videoUrl': video_url,
            'actionLink': body.get('actionLink') if isinstance(body.get('actionLink'), dict) else None,
            'actionLink2': body.get('actionLink2') if isinstance(body.get('actionLink2'), dict) else None,
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
