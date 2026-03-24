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

function renderAdminQrCodes() {
  document.querySelectorAll('.qr-canvas').forEach((canvas) => {
    renderPrettyQr(canvas, canvas.dataset.qrUrl, canvas.dataset.qrStyle, Number(canvas.dataset.qrSize || 170));
  });
  document.querySelectorAll('.download-qr-btn').forEach((button) => {
    button.onclick = () => downloadPrettyQr(button.dataset.qrUrl, button.dataset.qrStyle, button.dataset.qrName || 'qr-code');
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
