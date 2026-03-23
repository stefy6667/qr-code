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
              <img src="${item.qrImageUrl}" alt="QR ${item.title}" />
              <div class="actions" style="margin-top:12px">
                <a href="${item.qrImageUrl}" download="${item.slug}.png"><button>Download PNG</button></a>
              </div>
            </div>
            <div>
              <h3>${item.title}</h3>
              <p class="small">URL scanare: <a href="${item.scanUrl}" target="_blank">${item.scanUrl}</a></p>
              <p class="small">Cod editare client: <span class="code">${item.editCode}</span></p>
              <p class="small">Status: ${item.content ? 'configurat' : 'neconfigurat'}</p>
              ${item.content ? html`<p class="small">Titlu publicat: ${item.content.headline || 'fără titlu'}</p>` : ''}
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
    videoUrl: ''
  };
}

function previewMarkup(content, label = 'Previzualizare live', options = {}) {
  const { showButton = true, usePlaceholders = true, showLabel = true } = options;
  const headline = String(content.headline || '').trim();
  const body = String(content.body || '').trim();
  const buttonLabel = String(content.buttonLabel || '').trim();
  const hasImage = Boolean(content.imageUrl);
  const hasVideo = Boolean(content.videoUrl);

  return html`
    ${showLabel ? `<span class="badge" style="background:${content.theme.accent}22;color:${content.theme.accent};border-color:${content.theme.accent}66">${label}</span>` : ''}
    ${headline ? `<h2>${escapeHtml(headline)}</h2>` : (usePlaceholders ? '<h2>Titlul tău apare aici</h2>' : '')}
    ${body ? `<p>${escapeHtml(body)}</p>` : (usePlaceholders ? '<p>Aici va apărea descrierea, oferta sau mesajul personalizat.</p>' : '')}
    ${hasImage ? `<img src="${escapeAttribute(content.imageUrl)}" alt="vizual" />` : ''}
    ${hasVideo ? `<video src="${escapeAttribute(content.videoUrl)}" controls></video>` : ''}
    ${showButton && buttonLabel ? `<button type="button" style="width:max-content;background:linear-gradient(135deg, ${content.theme.accent}, #2563eb)">${escapeHtml(buttonLabel)}</button>` : ''}
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
  preview.innerHTML = previewMarkup(saved, '', { showButton: false, usePlaceholders: false, showLabel: false });

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
