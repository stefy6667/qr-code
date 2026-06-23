const app = document.getElementById('app');

const state = {
  session: null,
  items: [],
  selectedFileImage: null,
  selectedFileVideo: null,
};

const fonts = [
  'Inter, sans-serif',
  'Georgia, serif',
  'Trebuchet MS, sans-serif',
  'Courier New, monospace'
];

const qrStylePresets = {
  aurora: {
    label: 'Aurora Glow',
    radius: 0.38,
    fill: {
      type: 'linear-gradient',
      position: [0, 0, 1, 1],
      colorStops: [[0, '#22d3ee'], [0.55, '#4f46e5'], [1, '#d946ef']]
    },
    background: '#ffffff'
  },
  ember: {
    label: 'Ember Heat',
    radius: 0.46,
    fill: {
      type: 'radial-gradient',
      position: [0.5, 0.5, 0.12, 0.5, 0.5, 0.75],
      colorStops: [[0, '#fde047'], [0.55, '#f97316'], [1, '#ef4444']]
    },
    background: '#111111'
  },
  ocean: {
    label: 'Ocean Glass',
    radius: 0.18,
    fill: {
      type: 'linear-gradient',
      position: [0, 0, 1, 1],
      colorStops: [[0, '#0f172a'], [0.4, '#1d4ed8'], [1, '#38bdf8']]
    },
    background: '#ffffff'
  },
  frost: {
    label: 'Frost Blue',
    radius: 0.3,
    fill: {
      type: 'linear-gradient',
      position: [0, 0, 0, 1],
      colorStops: [[0, '#0ea5e9'], [1, '#ffffff']]
    },
    background: '#111827'
  },
  mono: {
    label: 'Mono Rounded',
    radius: 0.5,
    fill: '#2f2f2f',
    background: '#ffffff'
  },
  sunset: {
    label: 'Sunset Neon',
    radius: 0.45,
    fill: {
      type: 'linear-gradient',
      position: [0, 0, 1, 1],
      colorStops: [[0, '#9333ea'], [0.5, '#ec4899'], [1, '#f59e0b']]
    },
    background: '#151515'
  },
  neonSocial: {
    label: 'Neon Social Rounded',
    radius: 0.5,
    fill: {
      type: 'linear-gradient',
      position: [0, 0, 0, 1],
      colorStops: [[0, '#8b1cf6'], [0.52, '#d946ef'], [1, '#f97316']]
    },
    background: '#101010'
  },
  instagramGlow: {
    label: 'Instagram Glow (fundal negru)',
    engine: 'server-svg',
    serverPreset: 'instagramGlow',
    background: '#0a0a0a'
  },
  instagramGlowLight: {
    label: 'Instagram Glow (fundal alb)',
    engine: 'server-svg',
    serverPreset: 'instagramGlowLight',
    background: '#ffffff'
  },
  whiteOnBlack: {
    label: 'Alb pe negru (clasic)',
    engine: 'server-svg',
    serverPreset: 'whiteOnBlack',
    background: '#000000'
  }
};

function presetSwatchStyle(key) {
  const preset = qrStylePresets[key];
  if (!preset) return 'background:#333';
  // The 3 server-rendered presets don't carry `fill` data here (they're
  // rendered in qr_style.py instead) — hardcode a representative swatch
  // matching their actual look.
  if (key === 'instagramGlow') {
    return 'background: linear-gradient(160deg, #A011DB, #C026D3, #F97316);';
  }
  if (key === 'instagramGlowLight') {
    return 'background: linear-gradient(160deg, #7C3AED, #DB2777, #EA580C); box-shadow: inset 0 0 0 2px #fff;';
  }
  if (key === 'whiteOnBlack') {
    return 'background: repeating-conic-gradient(#fff 0% 25%, #111 0% 50%); background-size: 10px 10px;';
  }
  if (preset.fill && typeof preset.fill === 'object') {
    const stops = preset.fill.colorStops.map(([offset, color]) => `${color} ${Math.round(offset * 100)}%`).join(', ');
    if (preset.fill.type === 'radial-gradient') {
      return `background: radial-gradient(circle, ${stops});`;
    }
    const [x0, y0, x1, y1] = preset.fill.position;
    const angleDeg = Math.round(Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI + 90);
    return `background: linear-gradient(${angleDeg}deg, ${stops});`;
  }
  if (typeof preset.fill === 'string') {
    return `background: ${preset.background}; box-shadow: inset 0 0 0 6px ${preset.fill};`;
  }
  return `background:${preset.background || '#333'}`;
}

/**
 * Modal with a checkbox grid (instead of a typed comma-separated list) for
 * picking which QR design models to include in a production batch. Using
 * checkboxes instead of free text eliminates the whole class of bugs where
 * a mistyped/duplicated model name silently skewed per-model counts.
 * Resolves to {models, perModel, batchLabel} or null if cancelled.
 */
function openBulkCreateModal() {
  return new Promise((resolve) => {
    const modelKeys = Object.keys(qrStylePresets);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = html`
      <div class="modal-box">
        <h3>Generează lot de coduri QR</h3>
        <p class="modal-sub">Bifează modelele dorite, apoi alege câte coduri vrei din fiecare.</p>
        <div class="modal-select-all">
          <button type="button" id="bcSelectAll">Selectează tot</button>
          <button type="button" id="bcSelectNone">Deselectează tot</button>
        </div>
        <div class="model-grid">
          ${modelKeys.map((key) => html`
            <label class="model-checkbox">
              <input type="checkbox" value="${key}" checked />
              <span class="model-swatch" style="${presetSwatchStyle(key)}"></span>
              <span class="model-name">${escapeHtml(qrStylePresets[key].label)}</span>
            </label>
          `).join('')}
        </div>
        <div class="modal-row">
          <label>Coduri per model<input type="number" id="bcPerModel" value="15" min="1" max="200" /></label>
          <label>Nume lot (opțional)<input type="text" id="bcBatchLabel" placeholder="Campanie Mai" /></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" id="bcCancel">Anulează</button>
          <button type="button" id="bcConfirm">Generează</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => document.body.removeChild(overlay);
    overlay.querySelector('#bcCancel').onclick = () => { cleanup(); resolve(null); };
    overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(null); } };
    overlay.querySelector('#bcSelectAll').onclick = () => {
      overlay.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
    };
    overlay.querySelector('#bcSelectNone').onclick = () => {
      overlay.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
    };
    overlay.querySelector('#bcConfirm').onclick = () => {
      const checked = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
      const perModel = parseInt(overlay.querySelector('#bcPerModel').value, 10);
      const batchLabel = overlay.querySelector('#bcBatchLabel').value.trim();
      if (checked.length === 0) {
        alert('Bifează cel puțin un model.');
        return;
      }
      if (!Number.isInteger(perModel) || perModel < 1 || perModel > 200) {
        alert('Introdu un număr valid de coduri per model (1-200).');
        return;
      }
      cleanup();
      resolve({ models: checked, perModel, batchLabel });
    };
  });
}

function relativeTimeRo(sqliteTimestamp) {
  // SQLite CURRENT_TIMESTAMP is UTC, formatted "YYYY-MM-DD HH:MM:SS".
  const then = new Date(sqliteTimestamp.replace(' ', 'T') + 'Z');
  const diffSec = Math.round((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return 'chiar acum';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `acum ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `acum ${diffH} ${diffH === 1 ? 'oră' : 'ore'}`;
  const diffD = Math.round(diffH / 24);
  return `acum ${diffD} ${diffD === 1 ? 'zi' : 'zile'}`;
}

/**
 * Shared delete flow (triple confirmation) — used by the standalone
 * "Șterge lot" button AND by the "Șterge" action on each row in the
 * "Vezi loturi" modal, so the same safety checks apply everywhere.
 * Top-level (not nested in renderAdmin) so both call sites can reach it.
 */
async function confirmAndDeleteBatch(trimmed, knownCount = null) {
  const count = knownCount ?? state.items.filter((item) => item.batchLabel === trimmed).length;
  if (count === 0) {
    alert(`Nu am găsit niciun cod în lotul "${trimmed}".`);
    return false;
  }
  const warning = `Vei șterge PERMANENT ${count} coduri din lotul "${trimmed}".\n\nDacă vreo haină cu aceste coduri e deja imprimată sau vândută, codul ei va înceta să funcționeze imediat (404).\n\nAceastă acțiune NU poate fi anulată.`;
  if (!window.confirm(warning)) return false;
  const retype = window.prompt(`Pentru confirmare finală, scrie din nou numele lotului ("${trimmed}"):`, '');
  if (retype !== trimmed) {
    alert('Numele nu corespunde — ștergerea a fost anulată.');
    return false;
  }
  try {
    const res = await api('/api/admin/delete-batch', {
      method: 'POST',
      body: JSON.stringify({ batchLabel: trimmed }),
    });
    alert(`Am șters ${res.deleted} coduri din lotul "${res.batchLabel}".`);
    return true;
  } catch (error) {
    alert('Ștergerea lotului a eșuat.');
    return false;
  }
}

/**
 * Modal listing every production batch, newest first, with quick actions
 * (Export CSV / Export DTF / Șterge) per row — answers "what's my last
 * batch called?" at a glance instead of having to remember it.
 */
async function openBatchesModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html`
    <div class="modal-box">
      <h3>Loturile tale</h3>
      <p class="modal-sub">Cel mai recent generat apare primul.</p>
      <div id="batchesListContainer"><p class="modal-sub">Se încarcă...</p></div>
      <div class="modal-actions">
        <button type="button" class="secondary" id="batchesCloseBtn">Închide</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = () => document.body.removeChild(overlay);
  overlay.querySelector('#batchesCloseBtn').onclick = cleanup;
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

  const container = overlay.querySelector('#batchesListContainer');
  try {
    const res = await api('/api/admin/batches');
    const batches = res.batches || [];
    if (batches.length === 0) {
      container.innerHTML = '<p class="modal-sub">Niciun lot generat încă.</p>';
      return;
    }
    container.innerHTML = html`
      <table class="batches-table">
        <thead>
          <tr><th>Lot</th><th>Coduri</th><th>Modele</th><th>Creat</th><th></th></tr>
        </thead>
        <tbody>
          ${batches.map((b, i) => html`
            <tr class="${i === 0 ? 'batches-row-latest' : ''}">
              <td>${escapeHtml(b.batchLabel)}${i === 0 ? ' <span class="batches-latest-tag">cel mai recent</span>' : ''}</td>
              <td>${b.count}</td>
              <td class="batches-models">${b.models.map(escapeHtml).join(', ')}</td>
              <td>${relativeTimeRo(b.latest)}</td>
              <td class="batches-row-actions">
                <button type="button" class="batches-mini-btn" data-action="csv" data-batch="${escapeAttribute(b.batchLabel)}">CSV</button>
                <button type="button" class="batches-mini-btn" data-action="dtf" data-batch="${escapeAttribute(b.batchLabel)}">DTF</button>
                <button type="button" class="batches-mini-btn batches-mini-danger" data-action="del" data-batch="${escapeAttribute(b.batchLabel)}" data-count="${b.count}">Șterge</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    container.querySelectorAll('.batches-mini-btn').forEach((btn) => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        const batch = btn.dataset.batch;
        if (action === 'csv') {
          const a = document.createElement('a');
          a.href = `/api/admin/export-csv?batch=${encodeURIComponent(batch)}`;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else if (action === 'dtf') {
          const a = document.createElement('a');
          a.href = `/api/admin/export-dtf-zip?batch=${encodeURIComponent(batch)}`;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else if (action === 'del') {
          const count = parseInt(btn.dataset.count, 10);
          btn.textContent = '...';
          btn.disabled = true;
          const ok = await confirmAndDeleteBatch(batch, count);
          if (ok) {
            cleanup();
            route();
          } else {
            btn.textContent = 'Șterge';
            btn.disabled = false;
          }
        }
      };
    });
  } catch (error) {
    container.innerHTML = '<p class="modal-sub">Nu am putut încărca loturile.</p>';
  }
}

function html(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'A apărut o eroare.');
  }
  return data;
}

async function getDataUrl(file) {
  if (!file) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

const ADMIN_ROUTE = '/private-admin';

function route() {
  const path = location.pathname;
  if (path.startsWith('/c/')) return renderPublic(path.split('/').pop());
  if (path === '/top-voting' || path.startsWith('/top-voting/')) return renderTopVoting();
  if (path === '/edit' || path.startsWith('/edit/')) return renderEditAccess();
  if (path === ADMIN_ROUTE || path.startsWith(`${ADMIN_ROUTE}/`)) return renderAdmin();
  return renderEditAccess();
}


async function renderEditAccess() {
  app.innerHTML = html`
    <section class="hero container">
      <div class="card" style="max-width:640px;margin:0 auto;">
        <span class="badge">Acces editare</span>
        <h2>Intră în modul de editare</h2>
        <p class="small">Introdu doar codul alfanumeric primit. După validare vei fi redirecționat automat la formularul de editare.</p>
        <form id="editAccessForm">
          <label>Cod editare<input name="editCode" placeholder="ex: AB12CD34" required /></label>
          <div class="actions"><button type="submit">Continuă</button></div>
          <p id="editAccessError" class="small" style="color:#ef4444;"></p>
        </form>
      </div>
    </section>
  `;

  const form = document.getElementById('editAccessForm');
  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const editCode = String(formData.get('editCode') || '').trim().toUpperCase();
    const errorNode = document.getElementById('editAccessError');
    errorNode.textContent = '';
    if (!editCode) {
      errorNode.textContent = 'Codul de editare este obligatoriu.';
      return;
    }
    try {
      const result = await api('/api/public/resolve-edit-code', {
        method: 'POST',
        body: JSON.stringify({ editCode })
      });
      if (result.ok && result.slug) {
        const slug = String(result.slug).toLowerCase();
        setStoredEditCode(slug, editCode);
        location.assign(`/c/${slug}?edit=1`);
      }
    } catch (error) {
      errorNode.textContent = error.message;
    }
  };
}

function renderLanding() {
  app.innerHTML = html`
    <section class="hero container">
      <span class="badge">QR Studio · administrare privată</span>
      <h1>Generezi un QR, clientul îl personalizează și îl poate actualiza ulterior cu un cod unic.</h1>
      <p>Aplicația este gândită pentru workflow-ul tău: doar tu creezi și descarci coduri PNG, iar clientul vede conținutul salvat la scanare și intră în editare doar cu codul unic.</p>
      <div class="actions">
        <a href="/edit"><button>Intră în editare</button></a>
      </div>
    </section>
  `;
}

async function renderAdmin() {
  const session = await api('/api/session').catch(() => ({ authenticated: false }));
  state.session = session;
  if (!session.authenticated) return renderLogin();
  const data = await api('/api/admin/qr-codes');
  state.items = data.items;
  app.innerHTML = html`
    <section class="hero container">
      <span class="badge">Dashboard privat</span>
      <div class="grid grid-2">
        <div>
          <h1>Generează și descarcă QR-uri dinamice.</h1>
          <p>Fiecare QR are un link public pentru scanare și un cod alfanumeric unic pentru re-editare. PNG-ul se generează doar din dashboard-ul tău.</p>
          <div class="actions">
            <button id="createQr">Generează cod nou</button>
            <button class="secondary" id="bulkCreateBtn">Generează lot</button>
            <button class="secondary" id="exportCsvBtn">Export CSV</button>
            <button class="secondary" id="exportDtfBtn">Export DTF (ZIP)</button>
            <button class="secondary" id="viewBatchesBtn">Vezi loturi</button>
            <button class="danger" id="deleteBatchBtn">Șterge lot</button>
            <button class="secondary" id="logoutBtn">Logout</button>
          </div>
        </div>
        <div class="card grid grid-2">
          <div class="kpi"><span class="small">Coduri create</span><strong>${state.items.length}</strong></div>
          <div class="kpi"><span class="small">Cu conținut salvat</span><strong>${state.items.filter((item) => item.content).length}</strong></div>
        </div>
      </div>
    </section>
    <section class="container" style="padding-bottom:48px">
      <div class="items">
        ${state.items.map(item => html`
          <article class="card qr-item">
            <div>
              <div class="qr-preview-card ${item.qrStylePreset || 'aurora'}">
                <canvas class="qr-canvas" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-size="170"></canvas>
              </div>
              <div class="actions" style="margin-top:12px">
                <button type="button" class="download-qr-btn" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-name="${escapeAttribute(item.slug)}">Download PNG</button>
                <button type="button" class="secondary template-print-btn" data-template='${escapeAttribute(JSON.stringify({
                  slug: item.slug,
                  title: item.title,
                  editCode: item.editCode,
                  scanUrl: item.scanUrl,
                  qrImageUrl: item.qrImageUrl
                }))}'>Template print</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="tshirt" data-garment-color="white" data-template-image="${escapeAttribute(item.productTemplates?.tshirtWhite || '')}" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-name="${escapeAttribute(item.slug)}">Tricou alb</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="tshirt" data-garment-color="black" data-template-image="${escapeAttribute(item.productTemplates?.tshirtBlack || '')}" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-name="${escapeAttribute(item.slug)}">Tricou negru</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="hoodie" data-garment-color="white" data-template-image="${escapeAttribute(item.productTemplates?.hoodieWhite || '')}" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-name="${escapeAttribute(item.slug)}">Hanorac alb</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="hoodie" data-garment-color="black" data-template-image="${escapeAttribute(item.productTemplates?.hoodieBlack || '')}" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-icon="${escapeAttribute(item.centerIcon || '')}" data-qr-name="${escapeAttribute(item.slug)}">Hanorac negru</button>
              </div>
              <div class="actions" style="margin-top:8px">
                <span class="postcard-label">Postcard:</span>
                <button type="button" class="postcard-btn" data-slug="${escapeAttribute(item.slug)}" data-garment="tshirt">Tricou</button>
                <button type="button" class="postcard-btn" data-slug="${escapeAttribute(item.slug)}" data-garment="hoodie">Hanorac</button>
              </div>
            </div>
            <div>
              <h3>${item.title}</h3>
              <p class="small">URL scanare: <a href="${item.scanUrl}" target="_blank">${item.scanUrl}</a></p>
              <p class="small">Cod editare client: <span class="code">${item.editCode}</span></p>
              <p class="small">Status: ${item.content ? 'configurat' : 'neconfigurat'}</p>
              <p class="small">Google Reviews: ${item.googleReviews?.enabled ? 'activat' : 'dezactivat'}</p>
              ${item.content ? html`<p class="small">Titlu publicat: ${item.content.headline || 'fără titlu'}</p>` : ''}
              <form class="admin-settings-form" data-slug="${item.slug}">
                <label>Titlu intern<input name="title" value="${escapeHtml(item.title)}" /></label>
                <label class="inline-toggle"><input type="checkbox" name="reviewsEnabled" ${item.googleReviews?.enabled ? 'checked' : ''} /> Activează Google Reviews pentru acest QR</label>
                <label>Google Embed URL<input name="reviewEmbedUrl" value="${escapeHtml(item.googleReviews?.embedUrl || '')}" placeholder="https://www.google.com/maps/embed?..." /></label>
                <label>Text buton recenzii<input name="reviewButtonLabel" value="${escapeHtml(item.googleReviews?.buttonLabel || 'Recenzii Google')}" /></label>
                <label>Stil QR<select name="qrStylePreset">${Object.entries(qrStylePresets).map(([key, preset]) => `<option value="${key}" ${item.qrStylePreset === key ? 'selected' : ''}>${preset.label}</option>`).join('')}</select></label>
                <div class="icon-picker">
                  <span class="icon-picker-label">Icon central:</span>
                  <input type="hidden" name="centerIcon" value="${escapeAttribute(item.centerIcon || '')}" />
                  <button type="button" class="icon-btn ${!item.centerIcon ? 'active' : ''}" data-icon-value="">Fără</button>
                  <button type="button" class="icon-btn ${item.centerIcon === 'facebook' ? 'active' : ''}" data-icon-value="facebook" title="Facebook"><span class="icon-swatch icon-fb">f</span> Facebook</button>
                  <button type="button" class="icon-btn ${item.centerIcon === 'instagram' ? 'active' : ''}" data-icon-value="instagram" title="Instagram"><span class="icon-swatch icon-ig">◉</span> Instagram</button>
                  <button type="button" class="icon-btn ${item.centerIcon === 'tiktok' ? 'active' : ''}" data-icon-value="tiktok" title="TikTok"><span class="icon-swatch icon-tt">♪</span> TikTok</button>
                </div>
                <label>Template tricou alb (fără cod)<input type="file" name="tplTshirtWhiteFile" accept="image/png,image/jpeg,image/webp" /></label>
                <label>Template tricou negru (fără cod)<input type="file" name="tplTshirtBlackFile" accept="image/png,image/jpeg,image/webp" /></label>
                <label>Template hanorac alb (fără cod)<input type="file" name="tplHoodieWhiteFile" accept="image/png,image/jpeg,image/webp" /></label>
                <label>Template hanorac negru (fără cod)<input type="file" name="tplHoodieBlackFile" accept="image/png,image/jpeg,image/webp" /></label>
                <input type="hidden" name="tplTshirtWhiteCurrent" value="${escapeHtml(item.productTemplates?.tshirtWhite || '')}" />
                <input type="hidden" name="tplTshirtBlackCurrent" value="${escapeHtml(item.productTemplates?.tshirtBlack || '')}" />
                <input type="hidden" name="tplHoodieWhiteCurrent" value="${escapeHtml(item.productTemplates?.hoodieWhite || '')}" />
                <input type="hidden" name="tplHoodieBlackCurrent" value="${escapeHtml(item.productTemplates?.hoodieBlack || '')}" />
                <p class="small">Poți încărca pozele reale ale produselor (ca în exemple) pentru mockup-uri mult mai realiste.</p>
                <div class="actions"><button type="submit" class="secondary">Salvează setările</button></div>
              </form>
            </div>
          </article>
        `).join('') || '<div class="card">Nu există încă niciun cod.</div>'}
      </div>
    </section>
  `;
  document.getElementById('createQr').onclick = async () => {
    const title = window.prompt('Titlul intern al codului QR:', `QR ${state.items.length + 1}`);
    if (title === null) return;
    await api('/api/admin/qr-codes', { method: 'POST', body: JSON.stringify({ title }) });
    route();
  };
  // All 10 QR models are exportable for DTF now (both the 3 server-svg
  // presets and the 7 canvas presets, which qr_style.py replicates
  // server-side as build_generic_svg). Derived from qrStylePresets so this
  // never drifts out of sync if a model is added/removed later.
  document.getElementById('bulkCreateBtn').onclick = async () => {
    const picked = await openBulkCreateModal();
    if (!picked) return;
    const { models, perModel, batchLabel } = picked;
    const total = models.length * perModel;
    if (!window.confirm(`Voi genera ${perModel} coduri × ${models.length} modele = ${total} coduri în total. Continui?`)) return;
    const btn = document.getElementById('bulkCreateBtn');
    btn.textContent = 'Generez...';
    btn.disabled = true;
    try {
      const res = await api('/api/admin/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ models, perModel, batchLabel }),
      });
      // Show the EXACT per-model breakdown the server actually created, so
      // any future discrepancy is immediately visible instead of being
      // discovered later in the CSV/ZIP.
      const breakdown = Object.entries(res.countsByModel || {})
        .map(([model, count]) => `  ${model}: ${count}`)
        .join('\n');
      alert(`Am creat ${res.created} coduri${res.batchLabel ? ` în lotul "${res.batchLabel}"` : ''}.\n\nPe model:\n${breakdown}`);
      route();
    } catch (error) {
      alert('Generarea lotului a eșuat.');
    } finally {
      btn.textContent = 'Generează lot';
      btn.disabled = false;
    }
  };
  document.getElementById('exportCsvBtn').onclick = () => {
    const batch = window.prompt('Export CSV pentru ce lot? (lasă gol pentru TOATE codurile)', '');
    if (batch === null) return;
    const url = `/api/admin/export-csv${batch.trim() ? `?batch=${encodeURIComponent(batch.trim())}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  document.getElementById('exportDtfBtn').onclick = () => {
    const batch = window.prompt('Export QR-uri DTF pentru ce lot? (lasă gol pentru TOATE)', '');
    if (batch === null) return;
    const sizeStr = window.prompt('Dimensiune fizică a fiecărui QR (mm, implicit 170 = 17cm):', '170');
    if (sizeStr === null) return;
    const sizeMm = parseFloat(sizeStr) || 170;
    // No preset prompt: each code keeps its own assigned model (set at
    // bulk-create time), so the ZIP comes out pre-sorted into one folder
    // per model automatically.
    const params = new URLSearchParams();
    if (batch.trim()) params.set('batch', batch.trim());
    params.set('sizeMm', String(sizeMm));
    const a = document.createElement('a');
    a.href = `/api/admin/export-dtf-zip?${params.toString()}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  document.getElementById('viewBatchesBtn').onclick = () => {
    openBatchesModal();
  };
  document.getElementById('deleteBatchBtn').onclick = async () => {
    const batch = window.prompt('Ce lot vrei să ștergi? (numele exact, sensibil la majuscule)', '');
    if (batch === null || !batch.trim()) return;
    const trimmed = batch.trim();
    const btn = document.getElementById('deleteBatchBtn');
    btn.textContent = 'Șterg...';
    btn.disabled = true;
    try {
      const ok = await confirmAndDeleteBatch(trimmed);
      if (ok) route();
    } finally {
      btn.textContent = 'Șterge lot';
      btn.disabled = false;

    }
  };
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    route();
  };
  document.querySelectorAll('.admin-settings-form').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const fileOrCurrent = async (fileKey, currentKey) => {
        const value = formData.get(fileKey);
        if (value instanceof File && value.size > 0) {
          return await getDataUrl(value);
        }
        return formData.get(currentKey) || '';
      };
      try {
        const productTemplates = {
          tshirtWhite: await fileOrCurrent('tplTshirtWhiteFile', 'tplTshirtWhiteCurrent'),
          tshirtBlack: await fileOrCurrent('tplTshirtBlackFile', 'tplTshirtBlackCurrent'),
          hoodieWhite: await fileOrCurrent('tplHoodieWhiteFile', 'tplHoodieWhiteCurrent'),
          hoodieBlack: await fileOrCurrent('tplHoodieBlackFile', 'tplHoodieBlackCurrent'),
        };
        await api(`/api/admin/qr/${form.dataset.slug}/settings`, {
          method: 'POST',
          body: JSON.stringify({
            title: formData.get('title'),
            googleReviews: {
              enabled: formData.get('reviewsEnabled') === 'on',
              embedUrl: formData.get('reviewEmbedUrl'),
              buttonLabel: formData.get('reviewButtonLabel'),
            },
            qrStylePreset: formData.get('qrStylePreset'),
            centerIcon: formData.get('centerIcon') || '',
            productTemplates
          })
        });
        route();
      } catch (error) {
        alert(error.message);
      }
    };
  });
  renderAdminQrCodes();
}

function renderLogin() {
  app.innerHTML = html`
    <section class="container hero">
      <div class="grid grid-2">
        <div>
          <span class="badge">Acces doar pentru admin</span>
          <h1>Tu ești singura persoană care generează și descarcă PNG-urile.</h1>
          <p>Setează credențialele prin variabilele de mediu din Render și păstrează dashboard-ul privat.</p>
        </div>
        <form class="card" id="loginForm">
          <label>Username<input name="username" placeholder="admin" required /></label>
          <label>Parolă<input name="password" type="password" required /></label>
          <button type="submit">Autentificare</button>
          <p id="loginError" class="small"></p>
        </form>
      </div>
    </section>
  `;
  document.getElementById('loginForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      route();
    } catch (error) {
      document.getElementById('loginError').textContent = error.message;
    }
  };
}

function getStoredEditCode(slug) {
  return sessionStorage.getItem(`qr-edit-code:${slug}`) || '';
}

function setStoredEditCode(slug, code) {
  if (code) sessionStorage.setItem(`qr-edit-code:${slug}`, code.toUpperCase());
}

function clearStoredEditCode(slug) {
  sessionStorage.removeItem(`qr-edit-code:${slug}`);
}

function getEditMode(slug, data) {
  const params = new URLSearchParams(location.search);
  if (!data.hasContent) return true;
  if (params.get('edit') !== '1') return false;
  return Boolean(getStoredEditCode(slug));
}

function goToViewMode(slug) {
  history.replaceState({}, '', `/c/${slug}`);
  route();
}

function goToEditMode(slug) {
  history.replaceState({}, '', `/c/${slug}?edit=1`);
  route();
}

async function requestEditAccess(slug) {
  const code = window.prompt('Introdu codul alfanumeric primit pentru a edita acest QR:');
  if (!code) return;
  try {
    const result = await api(`/api/public/qr/${slug}/verify-edit-code`, {
      method: 'POST',
      body: JSON.stringify({ editCode: code })
    });
    if (result.ok) {
      setStoredEditCode(slug, code);
      goToEditMode(slug);
    }
  } catch (error) {
    alert(error.message);
  }
}

function getDefaultContent(data) {
  const defaults = {
    headline: '',
    body: '',
    buttonLabel: 'Editează cu codul unic',
    theme: {
      background: '#171717',
      foreground: '#f8fafc',
      accent: '#9ca3af',
      fontFamily: fonts[0],
      textAlign: 'left'
    },
    imageUrl: '',
    videoUrl: '',
    actionLink: null,
    votingEligible: false,
    textStyle: {
      color: '#f8fafc',
      fontSize: '20',
      fontFamily: fonts[0],
      textAlign: 'left'
    }
  };
  const current = data.content || {};
  return {
    ...defaults,
    ...current,
    theme: { ...defaults.theme, ...(current.theme || {}) },
    textStyle: { ...defaults.textStyle, ...(current.textStyle || {}) }
  };
}

function getQrPreset(styleKey) {
  return qrStylePresets[styleKey] || qrStylePresets.aurora;
}

function buildQrRenderConfig(text, styleKey, size = 240) {
  const preset = getQrPreset(styleKey);
  return {
    text,
    radius: preset.radius,
    ecLevel: 'H',
    fill: preset.fill,
    background: preset.background,
    size
  };
}

function buildServerSvgUrl(text, styleKey, size, icon) {
  const preset = getQrPreset(styleKey);
  const serverPreset = preset.serverPreset || styleKey;
  const params = new URLSearchParams({
    data: text,
    preset: serverPreset,
    size: String(size)
  });
  if (icon && ['facebook', 'instagram', 'tiktok'].includes(icon)) {
    params.set('icon', icon);
  }
  return `/qr.svg?${params.toString()}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function _roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draws the center brand icon directly on a canvas. Used as an overlay for
// presets that render via QrCreator (no server-side SVG icon injection).
// Mirrors the SVG rendering in `qr_style.py` so both engines produce the
// same visual.
function drawCenterIcon(canvas, iconKey) {
  if (!canvas || !iconKey || !['facebook', 'instagram', 'tiktok'].includes(iconKey)) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  // Visual icon = ~22% * 0.88 of the QR width, matching the server-side value
  const iconSize = size * 0.22 * 0.88;
  const cx = size / 2;
  const cy = size / 2;
  const haloR = iconSize * 0.20;

  // White halo (visually separates icon from QR modules)
  _roundedRectPath(ctx, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize, haloR);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const pad = iconSize * 0.10;
  const inner = iconSize - pad * 2;
  const ix = cx - inner / 2;
  const iy = cy - inner / 2;
  const innerR = inner * 0.20;

  if (iconKey === 'facebook') {
    _roundedRectPath(ctx, ix, iy, inner, inner, innerR);
    ctx.fillStyle = '#1877F2';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(inner * 0.78)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // tiny vertical nudge — typographic "f" centers slightly below geometric center
    ctx.fillText('f', cx, cy + inner * 0.04);
  } else if (iconKey === 'instagram') {
    const grad = ctx.createLinearGradient(ix, iy + inner, ix + inner, iy);
    grad.addColorStop(0, '#FCAF45');
    grad.addColorStop(0.5, '#E1306C');
    grad.addColorStop(1, '#5B51D8');
    _roundedRectPath(ctx, ix, iy, inner, inner, innerR);
    ctx.fillStyle = grad;
    ctx.fill();
    const stroke = inner * 0.08;
    const camPad = inner * 0.20;
    const camS = inner - 2 * camPad;
    const camR = camS * 0.24;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = stroke;
    _roundedRectPath(ctx, ix + camPad, iy + camPad, camS, camS, camR);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, camS * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    const dotR = camS * 0.06;
    const dotOff = camS * 0.18;
    ctx.beginPath();
    ctx.arc(ix + camPad + camS - dotOff, iy + camPad + dotOff, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (iconKey === 'tiktok') {
    _roundedRectPath(ctx, ix, iy, inner, inner, innerR);
    ctx.fillStyle = '#000000';
    ctx.fill();
    const s = inner;
    const stemW = s * 0.13;
    const stemX = ix + s * 0.55;
    const stemTop = iy + s * 0.18;
    const stemBot = iy + s * 0.68;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(stemX, stemTop, stemW, stemBot - stemTop);
    const hookW = s * 0.18;
    const hookH = s * 0.13;
    ctx.fillRect(stemX, stemTop, hookW, hookH);
    const bubbleR = s * 0.14;
    const bubbleCx = stemX - s * 0.08;
    const bubbleCy = stemBot + s * 0.02;
    ctx.beginPath();
    ctx.arc(bubbleCx, bubbleCy, bubbleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#25F4EE';
    ctx.beginPath();
    ctx.arc(bubbleCx - s * 0.04, bubbleCy + s * 0.02, bubbleR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FE2C55';
    ctx.beginPath();
    ctx.arc(bubbleCx + s * 0.04, bubbleCy - s * 0.02, bubbleR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

async function renderPrettyQr(canvas, text, styleKey, size = 240, icon = null) {
  if (!canvas) return false;
  const preset = getQrPreset(styleKey);
  canvas.width = size;
  canvas.height = size;
  if (preset.engine === 'server-svg') {
    try {
      const img = await loadImage(buildServerSvgUrl(text, styleKey, size, icon));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      // icon is already baked into the SVG for this engine
      return true;
    } catch (error) {
      console.error('renderPrettyQr server-svg failed', error);
      return false;
    }
  }
  if (!window.QrCreator) return false;
  window.QrCreator.render(buildQrRenderConfig(text, styleKey, size), canvas);
  // Overlay icon on top — works for all client-rendered presets
  if (icon) drawCenterIcon(canvas, icon);
  return true;
}

async function downloadPrettyQr(text, styleKey, filename, icon = null) {
  const preset = getQrPreset(styleKey);
  const size = 1200;
  const canvas = document.createElement('canvas');
  const ok = await renderPrettyQr(canvas, text, styleKey, size, icon);
  if (!ok && preset.engine !== 'server-svg' && !window.QrCreator) {
    return window.open(text, '_blank');
  }
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${filename}.png`;
  link.click();
}


async function createQrCanvasForMockup(url, styleKey, size = 620, icon = null) {
  const qrCanvas = document.createElement('canvas');
  await renderPrettyQr(qrCanvas, url, styleKey, size, icon);
  return qrCanvas;
}

function garmentColors(color) {
  if (color === 'black') {
    return {
      garment: '#0f172a',
      stroke: '#1e293b',
      highlight: '#334155',
      shadow: 'rgba(2,6,23,0.55)',
      bgTop: '#0b1020',
      bgBottom: '#111827',
      text: '#e2e8f0'
    };
  }
  return {
    garment: '#f8fafc',
    stroke: '#cbd5e1',
    highlight: '#ffffff',
    shadow: 'rgba(15,23,42,0.2)',
    bgTop: '#e2e8f0',
    bgBottom: '#f8fafc',
    text: '#334155'
  };
}

function drawStudioBackdrop(ctx, palette) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 2200);
  gradient.addColorStop(0, palette.bgTop);
  gradient.addColorStop(0.55, palette.bgBottom);
  gradient.addColorStop(1, '#0b1020');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1800, 2200);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(900, 280, 620, 160, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(148,163,184,0.24)';
  ctx.beginPath();
  ctx.ellipse(900, 1940, 620, 140, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFabricWrinkles(ctx, color, intensity = 0.12) {
  ctx.save();
  ctx.strokeStyle = color;
  for (let i = 0; i < 26; i += 1) {
    const y = 640 + i * 48;
    const wave = 22 + (i % 5) * 6;
    ctx.globalAlpha = intensity * (0.7 + (i % 3) * 0.15);
    ctx.lineWidth = 2 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(520, y);
    ctx.bezierCurveTo(700, y - wave, 1100, y + wave, 1280, y - wave * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTshirtBody(ctx, palette) {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 20;

  ctx.beginPath();
  ctx.moveTo(420, 430);
  ctx.lineTo(310, 620);
  ctx.lineTo(200, 780);
  ctx.lineTo(300, 1040);
  ctx.lineTo(448, 930);
  ctx.lineTo(460, 1850);
  ctx.lineTo(1340, 1850);
  ctx.lineTo(1352, 930);
  ctx.lineTo(1500, 1040);
  ctx.lineTo(1600, 780);
  ctx.lineTo(1490, 620);
  ctx.lineTo(1380, 430);
  ctx.quadraticCurveTo(1170, 330, 900, 330);
  ctx.quadraticCurveTo(630, 330, 420, 430);
  ctx.closePath();

  const bodyGradient = ctx.createLinearGradient(900, 360, 900, 1880);
  bodyGradient.addColorStop(0, palette.highlight);
  bodyGradient.addColorStop(0.35, palette.garment);
  bodyGradient.addColorStop(1, palette.garment);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();
  ctx.restore();

  drawFabricWrinkles(ctx, palette.text === '#334155' ? 'rgba(71,85,105,0.22)' : 'rgba(148,163,184,0.18)', 0.11);

  ctx.strokeStyle = palette.highlight;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(900, 430, 130, Math.PI, 0);
  ctx.stroke();

  ctx.strokeStyle = palette.stroke;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(900, 560);
  ctx.lineTo(900, 1830);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHoodieBody(ctx, palette) {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 20;

  ctx.beginPath();
  ctx.moveTo(500, 420);
  ctx.lineTo(360, 620);
  ctx.lineTo(220, 830);
  ctx.lineTo(350, 1100);
  ctx.lineTo(500, 980);
  ctx.lineTo(520, 1870);
  ctx.lineTo(1280, 1870);
  ctx.lineTo(1300, 980);
  ctx.lineTo(1450, 1100);
  ctx.lineTo(1580, 830);
  ctx.lineTo(1440, 620);
  ctx.lineTo(1300, 420);
  ctx.quadraticCurveTo(1120, 350, 900, 350);
  ctx.quadraticCurveTo(680, 350, 500, 420);
  ctx.closePath();

  const hoodieGradient = ctx.createLinearGradient(900, 360, 900, 1880);
  hoodieGradient.addColorStop(0, palette.highlight);
  hoodieGradient.addColorStop(0.28, palette.garment);
  hoodieGradient.addColorStop(1, palette.garment);
  ctx.fillStyle = hoodieGradient;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();
  ctx.restore();

  drawFabricWrinkles(ctx, palette.text === '#334155' ? 'rgba(71,85,105,0.24)' : 'rgba(148,163,184,0.22)', 0.13);

  ctx.beginPath();
  ctx.moveTo(700, 470);
  ctx.quadraticCurveTo(900, 250, 1100, 470);
  ctx.quadraticCurveTo(900, 620, 700, 470);
  ctx.closePath();
  ctx.fillStyle = palette.garment;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();

  ctx.strokeStyle = palette.highlight;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(870, 510);
  ctx.lineTo(845, 700);
  ctx.moveTo(930, 510);
  ctx.lineTo(955, 700);
  ctx.stroke();

  ctx.fillStyle = palette.highlight;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(730, 1540, 340, 130);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 5;
  ctx.strokeRect(730, 1540, 340, 130);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function downloadPostcardPng(slug, garment) {
  // A4 landscape at 300 DPI = 3508 x 2480 px. The SVG template is 1536x1024
  // (3:2 ratio), so when we fit it to the A4 width (3508) it ends up
  // 3508x2338, leaving a ~71px white margin top and bottom — perfect for
  // printing without cropping any content.
  const A4_W = 3508;
  const A4_H = 2480;
  const TEMPLATE_RATIO = 1536 / 1024;

  // Fetch the postcard SVG from the server.
  const response = await fetch(
    `/admin/postcard/${encodeURIComponent(slug)}?garment=${encodeURIComponent(garment)}`,
    { credentials: 'same-origin' }
  );
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }
  const svgText = await response.text();

  // Wrap SVG in a Blob URL so <img> can load it. Using a Blob instead of a
  // data URI avoids size limits and CORS-tainted-canvas issues.
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('SVG failed to load'));
      i.src = blobUrl;
    });

    // Build A4 canvas with white background.
    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Fit template to A4 width, center vertically.
    const drawW = A4_W;
    const drawH = Math.round(drawW / TEMPLATE_RATIO);
    const drawX = 0;
    const drawY = Math.round((A4_H - drawH) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Export as PNG via a download link.
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) {
        throw new Error('PNG export failed');
      }
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `postcard-${garment}-${slug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the PNG blob URL after the download triggers.
      setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
    }, 'image/png');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}


async function downloadGarmentMockup(url, styleKey, name, garment, color, templateImage, icon = null) {
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 2200;
  const ctx = canvas.getContext('2d');
  const palette = garmentColors(color);

  const hasTemplateImage = Boolean(templateImage);
  if (hasTemplateImage) {
    try {
      const productImage = await loadImage(templateImage);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 1800, 2200);
      const scale = Math.min(1600 / productImage.width, 1900 / productImage.height);
      const w = productImage.width * scale;
      const h = productImage.height * scale;
      const x = (1800 - w) / 2;
      const y = (2200 - h) / 2;
      ctx.drawImage(productImage, x, y, w, h);
      ctx.fillStyle = 'rgba(2,6,23,0.18)';
      ctx.beginPath();
      ctx.ellipse(900, y + h - 10, 440, 88, 0, 0, Math.PI * 2);
      ctx.fill();
    } catch (error) {
      drawStudioBackdrop(ctx, palette);
      if (garment === 'hoodie') drawHoodieBody(ctx, palette); else drawTshirtBody(ctx, palette);
    }
  } else {
    drawStudioBackdrop(ctx, palette);
    if (garment === 'hoodie') {
      drawHoodieBody(ctx, palette);
    } else {
      drawTshirtBody(ctx, palette);
    }
  }

  const qrCanvas = await createQrCanvasForMockup(url, styleKey, 620, icon);
  const qrX = 590;
  const qrY = garment === 'hoodie' ? 900 : 950;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX - 24, qrY - 24, 668, 668);
  ctx.drawImage(qrCanvas, qrX, qrY, 620, 620);

  ctx.fillStyle = palette.text;
  ctx.font = '700 44px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(garment === 'hoodie' ? 'QR pe spatele hanoracului' : 'QR pe spatele tricoului', 900, 900);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${name}-${garment}-${color}.png`;
  link.click();
}

function openPrintTemplateCard(item) {
  const printWindow = window.open('', '_blank', 'width=980,height=1320');
  if (!printWindow) {
    alert('Nu am putut deschide fereastra de print. Verifică pop-up blocker-ul.');
    return;
  }

  const htmlTemplate = `<!doctype html>
<html lang="ro">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Template QR - ${escapeHtml(item.slug)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f1f5f9; }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      padding: 14mm;
      box-sizing: border-box;
      display: grid;
      align-content: center;
      gap: 18px;
    }
    .card {
      border: 3px solid #0f172a;
      border-radius: 16px;
      padding: 22px;
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 24px;
      align-items: center;
    }
    .qr {
      width: 240px;
      height: 240px;
      border-radius: 14px;
      border: 1px solid #cbd5e1;
      background: white;
      padding: 10px;
      box-sizing: border-box;
    }
    .title { font-size: 28px; font-weight: 800; color: #0f172a; }
    .desc { font-size: 16px; color: #334155; margin-top: 8px; }
    .code-wrap { margin-top: 16px; }
    .code-label { font-size: 14px; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; }
    .code {
      margin-top: 6px;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 34px;
      font-weight: 800;
      color: #2563eb;
      border: 2px dashed #93c5fd;
      border-radius: 12px;
      padding: 10px 14px;
      display: inline-block;
    }
    .url { margin-top: 16px; font-size: 14px; color: #475569; word-break: break-word; }
    .cut { border-top: 1px dashed #94a3b8; margin-top: 12px; }
    .hint { font-size: 13px; color: #64748b; }
    .actions { margin-top: 8px; display: flex; gap: 10px; }
    .btn {
      border: 0; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 999px; font-weight: 700; cursor: pointer;
    }
    .btn.secondary { background: #334155; }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; padding: 0; min-height: auto; }
      .actions { display: none; }
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="card">
      <img class="qr" src="${item.qrImageUrl}" alt="QR ${escapeHtml(item.slug)}" />
      <div>
        <div class="title">${escapeHtml(item.title || 'Cod QR dinamic')}</div>
        <div class="desc">Scanează codul QR. Pentru re-editare folosește codul alfanumeric de mai jos.</div>
        <div class="code-wrap">
          <div class="code-label">Cod unic de editare</div>
          <div class="code">${escapeHtml(item.editCode)}</div>
        </div>
        <div class="url">Link scanare: ${escapeHtml(item.scanUrl)}</div>
      </div>
    </div>
    <div class="cut"></div>
    <div class="hint">Tipărește această pagină pe A4 și oferă clientului secțiunea cu codul QR + codul de editare.</div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Print</button>
      <button class="btn secondary" onclick="window.close()">Închide</button>
    </div>
  </main>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(htmlTemplate);
  printWindow.document.close();
}

function renderAdminQrCodes() {
  document.querySelectorAll('.qr-canvas').forEach((canvas) => {
    renderPrettyQr(canvas, canvas.dataset.qrUrl, canvas.dataset.qrStyle, Number(canvas.dataset.qrSize || 170), canvas.dataset.qrIcon || null);
  });
  document.querySelectorAll('.download-qr-btn').forEach((button) => {
    button.onclick = () => downloadPrettyQr(button.dataset.qrUrl, button.dataset.qrStyle, button.dataset.qrName || 'qr-code', button.dataset.qrIcon || null);
  });
  document.querySelectorAll('.icon-picker').forEach((picker) => {
    const hidden = picker.querySelector('input[name="centerIcon"]');
    picker.querySelectorAll('.icon-btn').forEach((btn) => {
      btn.onclick = () => {
        hidden.value = btn.dataset.iconValue || '';
        picker.querySelectorAll('.icon-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
  });
  document.querySelectorAll('.template-print-btn').forEach((button) => {
    button.onclick = () => {
      try {
        openPrintTemplateCard(JSON.parse(button.dataset.template));
      } catch (error) {
        alert('Nu am putut genera template-ul de print.');
      }
    };
  });
  document.querySelectorAll('.postcard-btn').forEach((button) => {
    button.onclick = async () => {
      const slug = button.dataset.slug;
      const garment = button.dataset.garment || 'tshirt';
      const originalLabel = button.textContent;
      button.textContent = 'Generez...';
      button.disabled = true;
      try {
        await downloadPostcardPng(slug, garment);
      } catch (error) {
        console.error('postcard download failed', error);
        alert('Nu am putut genera postcard-ul. Încearcă din nou.');
      } finally {
        button.textContent = originalLabel;
        button.disabled = false;
      }
    };
  });
  document.querySelectorAll('.garment-mockup-btn').forEach((button) => {
    button.onclick = async () => {
      await downloadGarmentMockup(
        button.dataset.qrUrl,
        button.dataset.qrStyle,
        button.dataset.qrName || 'qr-code',
        button.dataset.garment || 'tshirt',
        button.dataset.garmentColor || 'white',
        button.dataset.templateImage || '',
        button.dataset.qrIcon || null
      );
    };
  });
}

function mediaAlignStyle(textAlign) {
  if (textAlign === 'center') return 'display:block;margin-left:auto;margin-right:auto;';
  if (textAlign === 'right') return 'display:block;margin-left:auto;margin-right:0;';
  return 'display:block;margin-left:0;margin-right:auto;';
}

function detectPlatformFromUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return { key: 'link', label: 'Deschide linkul', host: '' };
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const map = [
      { key: 'instagram', match: ['instagram.com'], label: 'Instagram' },
      { key: 'facebook', match: ['facebook.com', 'fb.com'], label: 'Facebook' },
      { key: 'tiktok', match: ['tiktok.com'], label: 'TikTok' },
      { key: 'youtube', match: ['youtube.com', 'youtu.be'], label: 'YouTube' },
      { key: 'whatsapp', match: ['wa.me', 'whatsapp.com'], label: 'WhatsApp' },
      { key: 'telegram', match: ['t.me', 'telegram.me', 'telegram.org'], label: 'Telegram' },
      { key: 'maps', match: ['maps.google.com', 'google.com', 'goo.gl'], label: 'Google Maps' },
      { key: 'linkedin', match: ['linkedin.com'], label: 'LinkedIn' },
      { key: 'x', match: ['x.com', 'twitter.com'], label: 'X / Twitter' }
    ];
    const found = map.find((platform) => platform.match.some((item) => host.includes(item)));
    if (found) return { key: found.key, label: found.label, host };
    return { key: 'link', label: host || 'Link extern', host };
  } catch (error) {
    return { key: 'link', label: 'Link extern', host: '' };
  }
}

function normalizeActionLink(rawUrl, customLabel = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  const normalizedUrl = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  const platform = detectPlatformFromUrl(normalizedUrl);
  const label = String(customLabel || '').trim() || `Deschide ${platform.label}`;
  return {
    url: normalizedUrl,
    label,
    platform: platform.key,
    platformLabel: platform.label
  };
}

function getTextStyle(content) {
  return {
    color: content.textStyle?.color || content.theme?.foreground || '#f8fafc',
    fontSize: content.textStyle?.fontSize || '20',
    fontFamily: content.textStyle?.fontFamily || content.theme?.fontFamily || fonts[0],
    textAlign: content.textStyle?.textAlign || content.theme?.textAlign || 'left'
  };
}

function textStyleAttribute(content) {
  const style = getTextStyle(content);
  const size = Math.min(72, Math.max(12, Number(style.fontSize) || 20));
  const align = ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left';
  return `color:${escapeAttribute(style.color)};font-size:${size}px;font-family:${escapeAttribute(style.fontFamily)};text-align:${align};`;
}

function voteStorageKey(slug) {
  return `qr_vote_${slug}`;
}

async function submitVote(slug, vote) {
  if (localStorage.getItem(voteStorageKey(slug))) {
    alert('Ai votat deja acest conținut de pe acest dispozitiv.');
    return;
  }
  const result = await api(`/api/public/qr/${slug}/vote`, {
    method: 'POST',
    body: JSON.stringify({ vote })
  });
  localStorage.setItem(voteStorageKey(slug), vote);
  const likeNode = document.getElementById('likeCount');
  const dislikeNode = document.getElementById('dislikeCount');
  if (likeNode) likeNode.textContent = result.likeCount;
  if (dislikeNode) dislikeNode.textContent = result.dislikeCount;
  document.querySelectorAll('.vote-btn').forEach((button) => button.disabled = true);
}

async function renderTopVoting() {
  const data = await api('/api/public/top-voting');
  app.innerHTML = html`
    <section class="hero container">
      <div class="public-topbar" style="margin-bottom:16px;">
        <div class="public-nav-buttons">
          <a class="top-link-btn" href="https://silentsignals.ro" target="_blank" rel="noopener noreferrer">Shop</a>
          <a class="top-link-btn" href="/top-voting">Top Votting</a>
        </div>
        <a class="secondary top-link-btn" href="/">Acasă</a>
      </div>
      <div class="card">
        <span class="badge">Top Votting</span>
        <h2>Top Votting coduri QR</h2>
        <div class="top-voting-list">
          ${(data.items || []).map((item, index) => html`
            <a class="top-voting-item" href="/c/${escapeAttribute(item.slug)}">
              <div class="top-voting-rank">#${index + 1}</div>
              <div class="top-voting-preview">
                ${item.imageUrl ? `<img src="${escapeAttribute(item.imageUrl)}" alt="preview" />` : ''}
                ${!item.imageUrl && item.videoUrl ? `<video src="${escapeAttribute(item.videoUrl)}" muted playsinline></video>` : ''}
                ${item.text ? `<p>${escapeHtml(item.text)}</p>` : (!item.imageUrl && !item.videoUrl ? '<p>Conținut media</p>' : '')}
              </div>
              <small>👍 ${item.likeCount || 0} · 👎 ${item.dislikeCount || 0} · Scanări ${item.scanCount || 0}</small>
            </a>
          `).join('') || '<p class="small">Nu există încă voturi.</p>'}
        </div>
      </div>
    </section>
  `;
}

function previewMarkup(content, label = 'Previzualizare live', options = {}) {
  const { showButton = true, usePlaceholders = true, showLabel = true, googleReviews = null, linkOverride = null, voting = null } = options;
  const headline = String(content.headline || '').trim();
  const body = String(content.body || '').trim();
  const buttonLabel = String(content.buttonLabel || '').trim();
  const hasImage = Boolean(content.imageUrl);
  const hasVideo = Boolean(content.videoUrl);
  const mediaStyle = mediaAlignStyle(content.theme.textAlign);
  const reviewsEnabled = Boolean(googleReviews?.enabled && googleReviews?.embedUrl);
  const actionLink = linkOverride || normalizeActionLink(content.actionLink?.url, content.actionLink?.label);
  const actionLink2 = linkOverride ? null : normalizeActionLink(content.actionLink2?.url, content.actionLink2?.label);

  return html`
    ${showLabel ? `<span class="badge" style="background:${content.theme.accent}22;color:${content.theme.accent};border-color:${content.theme.accent}66">${label}</span>` : ''}
    ${headline ? `<h2>${escapeHtml(headline)}</h2>` : (usePlaceholders ? '<h2>Titlul tău apare aici</h2>' : '')}
    ${body ? `<p class="content-text" style="${textStyleAttribute(content)}">${escapeHtml(body)}</p>` : (usePlaceholders ? '<p>Aici va apărea descrierea, oferta sau mesajul personalizat.</p>' : '')}
    ${hasImage ? `<img src="${escapeAttribute(content.imageUrl)}" alt="vizual" style="${mediaStyle}" />` : ''}
    ${hasVideo ? `<video src="${escapeAttribute(content.videoUrl)}" controls autoplay playsinline loop preload="auto" data-autoplay-video="true" style="${mediaStyle}"></video>` : ''}
    ${showButton && buttonLabel ? `<button type="button" style="width:max-content;background:linear-gradient(135deg, ${content.theme.accent}, #6b7280)">${escapeHtml(buttonLabel)}</button>` : ''}
    ${actionLink ? `<a href="${escapeAttribute(actionLink.url)}" target="_blank" rel="noopener noreferrer" class="platform-link-btn platform-${escapeAttribute(actionLink.platform)}" style="--accent:${content.theme.accent};">${escapeHtml(actionLink.label)}</a>` : ''}
    ${actionLink2 ? `<a href="${escapeAttribute(actionLink2.url)}" target="_blank" rel="noopener noreferrer" class="platform-link-btn platform-${escapeAttribute(actionLink2.platform)}" style="--accent:${content.theme.accent};">${escapeHtml(actionLink2.label)}</a>` : ''}
    ${reviewsEnabled ? html`
      <div class="google-reviews-block">
        <div class="google-reviews-header">${escapeHtml(googleReviews.buttonLabel || 'Recenzii Google')}</div>
        <iframe src="${escapeAttribute(googleReviews.embedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
    ` : ''}
    ${voting ? html`
      <div class="vote-box">
        <div class="vote-actions">
          <button type="button" class="vote-btn" data-vote="like">👍 Like <span id="likeCount">${voting.likeCount || 0}</span></button>
          <button type="button" class="vote-btn secondary" data-vote="dislike">👎 Dislike <span id="dislikeCount">${voting.dislikeCount || 0}</span></button>
        </div>
      </div>
    ` : ''}
  `;
}


function activateResultVideos(container) {
  container.querySelectorAll('video[data-autoplay-video="true"]').forEach((video) => {
    const playWithSound = () => {
      video.muted = false;
      video.volume = 1;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          video.muted = true;
          video.play().catch(() => {});
          showSoundUnlock(video);
        });
      }
    };
    if (video.readyState >= 2) {
      playWithSound();
    } else {
      video.addEventListener('canplay', playWithSound, { once: true });
      video.load();
    }
  });
}

function showSoundUnlock(video) {
  if (video.parentElement?.querySelector('.sound-unlock-btn')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-unlock-btn';
  button.dataset.autoClickableSound = 'true';
  button.setAttribute('aria-label', 'Pornește sunetul');
  button.textContent = 'Pornește sunetul';
  button.onclick = () => {
    video.muted = false;
    video.volume = 1;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => button.remove()).catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } else {
      button.remove();
    }
  };
  video.insertAdjacentElement('afterend', button);
  window.setTimeout(() => autoClickSoundButton(button), 3000);
}

function autoClickSoundButton(button) {
  if (!button.isConnected) return;
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
    button.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
  });
  if (button.isConnected) button.click();
}

function renderPublicView(slug, data) {
  const saved = getDefaultContent(data);
  app.innerHTML = html`
    <section class="hero container public-shell">
      <div class="public-topbar">
        <div class="public-nav-buttons">
          <a class="top-link-btn" href="https://silentsignals.ro" target="_blank" rel="noopener noreferrer">Shop</a>
          <a class="top-link-btn" href="/top-voting">Top Votting</a>
        </div>
        <button id="editAccessBtn" class="secondary top-edit-btn">Editează</button>
      </div>
      <div class="preview public-preview">
        <div class="preview-inner" id="savedPreview"></div>
      </div>
    </section>
  `;

  const preview = document.getElementById('savedPreview');
  preview.style.background = saved.theme.background;
  preview.style.color = saved.theme.foreground;
  preview.style.fontFamily = saved.theme.fontFamily;
  preview.style.textAlign = saved.theme.textAlign;
  preview.innerHTML = previewMarkup(saved, '', {
    showButton: false,
    usePlaceholders: false,
    showLabel: false,
    googleReviews: data.googleReviews,
    voting: data.votingEligible ? { likeCount: data.likeCount || 0, dislikeCount: data.dislikeCount || 0 } : null
  });

  activateResultVideos(preview);
  document.getElementById('editAccessBtn').onclick = () => requestEditAccess(slug);
  document.querySelectorAll('.vote-btn').forEach((button) => {
    if (localStorage.getItem(voteStorageKey(slug))) button.disabled = true;
    button.onclick = () => submitVote(slug, button.dataset.vote);
  });
}

async function renderPublicEditor(slug, data) {
  const content = getDefaultContent(data);
  const textStyle = getTextStyle(content);
  const storedCode = getStoredEditCode(slug);
  app.innerHTML = html`
    <section class="hero container">
      <div class="public-topbar" style="margin-bottom:16px;">
        <span class="badge">${data.hasContent ? 'Mod editare' : 'Configurare inițială'}</span>
        ${data.hasContent ? '<button id="cancelEditBtn" class="secondary top-edit-btn">Înapoi la rezultat</button>' : ''}
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>${data.hasContent ? 'Editează conținutul existent' : 'Configurează conținutul la prima scanare'}</h2>
          <div class="scan-counter" aria-label="Număr scanări QR">
            <span>Scanări totale</span>
            <strong>${Number(data.scanCount || 0).toLocaleString('ro-RO')}</strong>
          </div>
          <p class="small">După salvare, formularul dispare la scanările viitoare și se va afișa doar versiunea publicată.</p>
          <form id="editorForm">
            ${data.hasContent ? `<div class="small" style="margin-bottom:16px;">Cod validat: <span class="code">${escapeHtml(storedCode)}</span></div>` : ''}
            <label>Link extern (platformă)<input name="actionLinkUrl" value="${escapeHtml(content.actionLink?.url || '')}" placeholder="https://instagram.com/..." /></label>
            <label>Text buton link (opțional)<input name="actionLinkLabel" value="${escapeHtml(content.actionLink?.label || '')}" placeholder="Ex: Urmărește-ne pe Instagram" /></label>
            <label>Al doilea link extern (opțional)<input name="actionLink2Url" value="${escapeHtml(content.actionLink2?.url || '')}" placeholder="https://tiktok.com/..." /></label>
            <label>Text al doilea buton (opțional)<input name="actionLink2Label" value="${escapeHtml(content.actionLink2?.label || '')}" placeholder="Ex: Vezi pe TikTok" /></label>
            <div class="grid grid-2">
              <label>Imagine (upload)<input type="file" name="imageFile" accept="image/png,image/jpeg,image/webp" /></label>
              <label>Video (upload)<input type="file" name="videoFile" accept="video/mp4,video/webm" /></label>
              <label>URL imagine alternativ<input name="imageUrl" value="${escapeHtml(content.imageUrl || '')}" placeholder="https://..." /></label>
              <label>URL video alternativ<input name="videoUrl" value="${escapeHtml(content.videoUrl || '')}" placeholder="https://..." /></label>
            </div>
            <label class="inline-toggle voting-eligible-toggle">
              <input type="checkbox" name="votingEligible" ${content.votingEligible ? 'checked' : ''} />
              <span>Eligibil pentru Top Votting (doar conținut fără link extern)</span>
            </label>
            <div class="text-editor-row">
              <label>Text conținut<textarea name="body" placeholder="Scrie textul care apare pe pagina QR">${escapeHtml(content.body || '')}</textarea></label>
              <button type="button" class="secondary style-config-btn" id="openStyleConfig">Stil text</button>
            </div>
            <div class="style-popover hidden" id="stylePopover">
              <div class="style-popover-header">
                <strong>Configurare text</strong>
                <button type="button" class="secondary" id="closeStyleConfig">Închide</button>
              </div>
              <label>Culoare text<input type="color" name="textColor" value="${escapeHtml(textStyle.color)}" /></label>
              <label>Dimensiune text<input type="range" name="fontSize" min="12" max="72" value="${escapeHtml(textStyle.fontSize)}" /></label>
              <label>Font<select name="fontFamily">
                ${fonts.map(font => `<option value="${font}" ${textStyle.fontFamily === font ? 'selected' : ''}>${font}</option>`).join('')}
              </select></label>
              <label>Aliniere<select name="textAlign">
                ${['left', 'center', 'right'].map(opt => `<option value="${opt}" ${textStyle.textAlign === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select></label>
            </div>
            <div class="actions">
              <button type="submit">Salvează experiența</button>
            </div>
          </form>
        </div>
        <div class="preview">
          <div class="preview-inner" id="livePreview"></div>
        </div>
      </div>
    </section>
  `;

  const form = document.getElementById('editorForm');
  const preview = document.getElementById('livePreview');

  const updatePreview = () => {
    const formData = new FormData(form);
    const previewContent = {
      headline: '',
      body: formData.get('body'),
      buttonLabel: '',
      imageUrl: formData.get('imageUrl') || content.imageUrl,
      videoUrl: formData.get('videoUrl') || content.videoUrl,
      actionLink: normalizeActionLink(formData.get('actionLinkUrl'), formData.get('actionLinkLabel')),
      actionLink2: normalizeActionLink(formData.get('actionLink2Url'), formData.get('actionLink2Label')),
      votingEligible: formData.get('votingEligible') === 'on',
      theme: content.theme,
      textStyle: {
        color: formData.get('textColor'),
        fontSize: formData.get('fontSize'),
        fontFamily: formData.get('fontFamily'),
        textAlign: formData.get('textAlign')
      }
    };
    preview.style.background = previewContent.theme.background;
    preview.style.color = previewContent.theme.foreground;
    preview.style.fontFamily = previewContent.theme.fontFamily;
    preview.style.textAlign = previewContent.theme.textAlign;
    preview.innerHTML = previewMarkup(previewContent, 'Previzualizare live', { showButton: false, usePlaceholders: false });
    activateResultVideos(preview);
  };

  document.getElementById('openStyleConfig').onclick = () => document.getElementById('stylePopover').classList.remove('hidden');
  document.getElementById('closeStyleConfig').onclick = () => document.getElementById('stylePopover').classList.add('hidden');
  form.oninput = updatePreview;
  form.imageFile.onchange = (e) => { state.selectedFileImage = e.target.files[0] || null; };
  form.videoFile.onchange = (e) => { state.selectedFileVideo = e.target.files[0] || null; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      editCode: storedCode,
      headline: '',
      body: formData.get('body'),
      buttonLabel: '',
      imageUrl: formData.get('imageUrl'),
      videoUrl: formData.get('videoUrl'),
      actionLink: normalizeActionLink(formData.get('actionLinkUrl'), formData.get('actionLinkLabel')),
      actionLink2: normalizeActionLink(formData.get('actionLink2Url'), formData.get('actionLink2Label')),
      votingEligible: formData.get('votingEligible') === 'on',
      imageDataUrl: await getDataUrl(state.selectedFileImage),
      videoDataUrl: await getDataUrl(state.selectedFileVideo),
      theme: content.theme,
      textStyle: {
        color: formData.get('textColor'),
        fontSize: formData.get('fontSize'),
        fontFamily: formData.get('fontFamily'),
        textAlign: formData.get('textAlign')
      }
    };
    try {
      await api(`/api/public/qr/${slug}/save`, { method: 'POST', body: JSON.stringify(payload) });
      state.selectedFileImage = null;
      state.selectedFileVideo = null;
      if (!data.hasContent) {
        clearStoredEditCode(slug);
      }
      alert('Conținutul a fost salvat. De acum, la scanare se va afișa doar versiunea publicată.');
      goToViewMode(slug);
    } catch (error) {
      alert(error.message);
    }
  };

  if (data.hasContent) {
    document.getElementById('cancelEditBtn').onclick = () => goToViewMode(slug);
  }

  updatePreview();
}

async function renderPublic(slug) {
  const data = await api(`/api/public/qr/${slug}`);
  const editMode = getEditMode(slug, data);
  if (data.hasContent && !editMode) {
    return renderPublicView(slug, data);
  }
  return renderPublicEditor(slug, data);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

route();
