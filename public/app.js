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
  }
};

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

function route() {
  const path = location.pathname;
  if (path.startsWith('/c/')) return renderPublic(path.split('/').pop());
  if (path.startsWith('/admin')) return renderAdmin();
  return renderLanding();
}

function renderLanding() {
  app.innerHTML = html`
    <section class="hero container">
      <span class="badge">QR Studio · administrare privată</span>
      <h1>Generezi un QR, clientul îl personalizează și îl poate actualiza ulterior cu un cod unic.</h1>
      <p>Aplicația este gândită pentru workflow-ul tău: doar tu creezi și descarci coduri PNG, iar clientul vede conținutul salvat la scanare și intră în editare doar cu codul unic.</p>
      <div class="actions">
        <a href="/admin"><button>Intră în dashboard</button></a>
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
                <canvas class="qr-canvas" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-size="170"></canvas>
              </div>
              <div class="actions" style="margin-top:12px">
                <button type="button" class="download-qr-btn" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-name="${escapeAttribute(item.slug)}">Download PNG</button>
                <button type="button" class="secondary template-print-btn" data-template='${escapeAttribute(JSON.stringify({
                  slug: item.slug,
                  title: item.title,
                  editCode: item.editCode,
                  scanUrl: item.scanUrl,
                  qrImageUrl: item.qrImageUrl
                }))}'>Template print</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="tshirt" data-garment-color="white" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-name="${escapeAttribute(item.slug)}">Tricou alb</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="tshirt" data-garment-color="black" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-name="${escapeAttribute(item.slug)}">Tricou negru</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="hoodie" data-garment-color="white" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-name="${escapeAttribute(item.slug)}">Hanorac alb</button>
                <button type="button" class="secondary garment-mockup-btn" data-garment="hoodie" data-garment-color="black" data-qr-url="${escapeAttribute(item.scanUrl)}" data-qr-style="${escapeAttribute(item.qrStylePreset || 'aurora')}" data-qr-name="${escapeAttribute(item.slug)}">Hanorac negru</button>
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
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    route();
  };
  document.querySelectorAll('.admin-settings-form').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        await api(`/api/admin/qr/${form.dataset.slug}/settings`, {
          method: 'POST',
          body: JSON.stringify({
            title: formData.get('title'),
            googleReviews: {
              enabled: formData.get('reviewsEnabled') === 'on',
              embedUrl: formData.get('reviewEmbedUrl'),
              buttonLabel: formData.get('reviewButtonLabel'),
            },
            qrStylePreset: formData.get('qrStylePreset')
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
  return data.content || {
    headline: '',
    body: '',
    buttonLabel: 'Editează cu codul unic',
    theme: {
      background: '#0f172a',
      foreground: '#f8fafc',
      accent: '#38bdf8',
      fontFamily: fonts[0],
      textAlign: 'left'
    },
    imageUrl: '',
    videoUrl: '',
    actionLink: null
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

function renderPrettyQr(canvas, text, styleKey, size = 240) {
  if (!window.QrCreator || !canvas) return false;
  canvas.width = size;
  canvas.height = size;
  window.QrCreator.render(buildQrRenderConfig(text, styleKey, size), canvas);
  return true;
}

function downloadPrettyQr(text, styleKey, filename) {
  if (!window.QrCreator) return window.open(text, '_blank');
  const canvas = document.createElement('canvas');
  const size = 1200;
  renderPrettyQr(canvas, text, styleKey, size);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${filename}.png`;
  link.click();
}


function createQrCanvasForMockup(url, styleKey, size = 620) {
  const qrCanvas = document.createElement('canvas');
  renderPrettyQr(qrCanvas, url, styleKey, size);
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
  gradient.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1800, 2200);

  ctx.fillStyle = 'rgba(148,163,184,0.18)';
  ctx.beginPath();
  ctx.ellipse(900, 1940, 560, 120, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTshirtBody(ctx, palette) {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 18;

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
  ctx.fillStyle = palette.garment;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = palette.highlight;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(900, 430, 130, Math.PI, 0);
  ctx.stroke();
}

function drawHoodieBody(ctx, palette) {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 18;

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
  ctx.fillStyle = palette.garment;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(700, 470);
  ctx.quadraticCurveTo(900, 260, 1100, 470);
  ctx.quadraticCurveTo(900, 600, 700, 470);
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
  ctx.lineTo(845, 690);
  ctx.moveTo(930, 510);
  ctx.lineTo(955, 690);
  ctx.stroke();

  ctx.fillStyle = palette.highlight;
  ctx.fillRect(730, 1540, 340, 130);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 5;
  ctx.strokeRect(730, 1540, 340, 130);
}

function downloadGarmentMockup(url, styleKey, name, garment, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 2200;
  const ctx = canvas.getContext('2d');
  const palette = garmentColors(color);

  drawStudioBackdrop(ctx, palette);
  if (garment === 'hoodie') {
    drawHoodieBody(ctx, palette);
  } else {
    drawTshirtBody(ctx, palette);
  }

  const qrCanvas = createQrCanvasForMockup(url, styleKey, 620);
  const qrX = 590;
  const qrY = 980;
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
    renderPrettyQr(canvas, canvas.dataset.qrUrl, canvas.dataset.qrStyle, Number(canvas.dataset.qrSize || 170));
  });
  document.querySelectorAll('.download-qr-btn').forEach((button) => {
    button.onclick = () => downloadPrettyQr(button.dataset.qrUrl, button.dataset.qrStyle, button.dataset.qrName || 'qr-code');
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
  document.querySelectorAll('.garment-mockup-btn').forEach((button) => {
    button.onclick = () => {
      downloadGarmentMockup(
        button.dataset.qrUrl,
        button.dataset.qrStyle,
        button.dataset.qrName || 'qr-code',
        button.dataset.garment || 'tshirt',
        button.dataset.garmentColor || 'white'
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

function previewMarkup(content, label = 'Previzualizare live', options = {}) {
  const { showButton = true, usePlaceholders = true, showLabel = true, googleReviews = null, linkOverride = null } = options;
  const headline = String(content.headline || '').trim();
  const body = String(content.body || '').trim();
  const buttonLabel = String(content.buttonLabel || '').trim();
  const hasImage = Boolean(content.imageUrl);
  const hasVideo = Boolean(content.videoUrl);
  const mediaStyle = mediaAlignStyle(content.theme.textAlign);
  const reviewsEnabled = Boolean(googleReviews?.enabled && googleReviews?.embedUrl);
  const actionLink = linkOverride || normalizeActionLink(content.actionLink?.url, content.actionLink?.label);

  return html`
    ${showLabel ? `<span class="badge" style="background:${content.theme.accent}22;color:${content.theme.accent};border-color:${content.theme.accent}66">${label}</span>` : ''}
    ${headline ? `<h2>${escapeHtml(headline)}</h2>` : (usePlaceholders ? '<h2>Titlul tău apare aici</h2>' : '')}
    ${body ? `<p>${escapeHtml(body)}</p>` : (usePlaceholders ? '<p>Aici va apărea descrierea, oferta sau mesajul personalizat.</p>' : '')}
    ${hasImage ? `<img src="${escapeAttribute(content.imageUrl)}" alt="vizual" style="${mediaStyle}" />` : ''}
    ${hasVideo ? `<video src="${escapeAttribute(content.videoUrl)}" controls style="${mediaStyle}"></video>` : ''}
    ${showButton && buttonLabel ? `<button type="button" style="width:max-content;background:linear-gradient(135deg, ${content.theme.accent}, #2563eb)">${escapeHtml(buttonLabel)}</button>` : ''}
    ${actionLink ? `<a href="${escapeAttribute(actionLink.url)}" target="_blank" rel="noopener noreferrer" class="platform-link-btn platform-${escapeAttribute(actionLink.platform)}" style="--accent:${content.theme.accent};">${escapeHtml(actionLink.label)}</a>` : ''}
    ${reviewsEnabled ? html`
      <div class="google-reviews-block">
        <div class="google-reviews-header">${escapeHtml(googleReviews.buttonLabel || 'Recenzii Google')}</div>
        <iframe src="${escapeAttribute(googleReviews.embedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
    ` : ''}
  `;
}

function renderPublicView(slug, data) {
  const saved = getDefaultContent(data);
  app.innerHTML = html`
    <section class="hero container public-shell">
      <div class="public-topbar public-topbar-end">
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
  preview.innerHTML = previewMarkup(saved, '', { showButton: false, usePlaceholders: false, showLabel: false, googleReviews: data.googleReviews });

  document.getElementById('editAccessBtn').onclick = () => requestEditAccess(slug);
}

async function renderPublicEditor(slug, data) {
  const content = getDefaultContent(data);
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
          <p class="small">După salvare, formularul dispare la scanările viitoare și se va afișa doar versiunea publicată.</p>
          <form id="editorForm">
            ${data.hasContent ? `<div class="small" style="margin-bottom:16px;">Cod validat: <span class="code">${escapeHtml(storedCode)}</span></div>` : ''}
            <label>Titlu principal<input name="headline" value="${escapeHtml(content.headline || '')}" placeholder="Ex: Meniul video al locației" /></label>
            <label>Text descriptiv<textarea name="body" placeholder="Descriere / mesaj pentru client">${escapeHtml(content.body || '')}</textarea></label>
            <label>Eticheta butonului de re-editare<input name="buttonLabel" value="${escapeHtml(content.buttonLabel || '')}" /></label>
            <div class="grid grid-2">
              <label>Culoare fundal<input type="color" name="background" value="${content.theme.background}" /></label>
              <label>Culoare text<input type="color" name="foreground" value="${content.theme.foreground}" /></label>
              <label>Culoare accent<input type="color" name="accent" value="${content.theme.accent}" /></label>
              <label>Aliniere text<select name="textAlign">
                ${['left', 'center', 'right'].map(opt => `<option value="${opt}" ${content.theme.textAlign === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select></label>
              <label>Font<select name="fontFamily">
                ${fonts.map(font => `<option value="${font}" ${content.theme.fontFamily === font ? 'selected' : ''}>${font}</option>`).join('')}
              </select></label>
              <label>Imagine (upload)<input type="file" name="imageFile" accept="image/png,image/jpeg,image/webp" /></label>
              <label>Video (upload)<input type="file" name="videoFile" accept="video/mp4,video/webm" /></label>
              <label>URL imagine alternativ<input name="imageUrl" value="${escapeHtml(content.imageUrl || '')}" placeholder="https://..." /></label>
              <label>URL video alternativ<input name="videoUrl" value="${escapeHtml(content.videoUrl || '')}" placeholder="https://..." /></label>
              <label>Link extern (opțional)<input name="actionLinkUrl" value="${escapeHtml(content.actionLink?.url || '')}" placeholder="https://instagram.com/..." /></label>
              <label>Text buton link (opțional)<input name="actionLinkLabel" value="${escapeHtml(content.actionLink?.label || '')}" placeholder="Ex: Urmărește-ne pe Instagram" /></label>
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
      headline: formData.get('headline'),
      body: formData.get('body'),
      buttonLabel: formData.get('buttonLabel'),
      imageUrl: formData.get('imageUrl') || content.imageUrl,
      videoUrl: formData.get('videoUrl') || content.videoUrl,
      actionLink: normalizeActionLink(formData.get('actionLinkUrl'), formData.get('actionLinkLabel')),
      theme: {
        background: formData.get('background'),
        foreground: formData.get('foreground'),
        accent: formData.get('accent'),
        textAlign: formData.get('textAlign'),
        fontFamily: formData.get('fontFamily')
      }
    };
    preview.style.background = previewContent.theme.background;
    preview.style.color = previewContent.theme.foreground;
    preview.style.fontFamily = previewContent.theme.fontFamily;
    preview.style.textAlign = previewContent.theme.textAlign;
    preview.innerHTML = previewMarkup(previewContent, 'Previzualizare live', { showButton: Boolean(previewContent.buttonLabel), usePlaceholders: true });
  };

  form.oninput = updatePreview;
  form.imageFile.onchange = (e) => { state.selectedFileImage = e.target.files[0] || null; };
  form.videoFile.onchange = (e) => { state.selectedFileVideo = e.target.files[0] || null; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      editCode: storedCode,
      headline: formData.get('headline'),
      body: formData.get('body'),
      buttonLabel: formData.get('buttonLabel'),
      imageUrl: formData.get('imageUrl'),
      videoUrl: formData.get('videoUrl'),
      actionLink: normalizeActionLink(formData.get('actionLinkUrl'), formData.get('actionLinkLabel')),
      imageDataUrl: await getDataUrl(state.selectedFileImage),
      videoDataUrl: await getDataUrl(state.selectedFileVideo),
      theme: {
        background: formData.get('background'),
        foreground: formData.get('foreground'),
        accent: formData.get('accent'),
        textAlign: formData.get('textAlign'),
        fontFamily: formData.get('fontFamily'),
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
