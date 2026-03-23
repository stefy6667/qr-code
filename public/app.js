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
      <p>Aplicația este gândită pentru workflow-ul tău: doar tu creezi și descarci coduri PNG, iar clientul poate schimba ulterior poze, text și video după scanare.</p>
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

async function renderPublic(slug) {
  const data = await api(`/api/public/qr/${slug}`);
  const content = data.content || {
    headline: '', body: '', buttonLabel: 'Editează cu codul unic',
    theme: { background: '#0f172a', foreground: '#f8fafc', accent: '#38bdf8', fontFamily: fonts[0], textAlign: 'left' },
    imageUrl: '', videoUrl: ''
  };
  app.innerHTML = html`
    <section class="hero container">
      <span class="badge">Experiență client</span>
      <div class="grid grid-2">
        <div class="card">
          <h2>${data.hasContent ? 'Conținutul salvat la scanare' : 'Configurează conținutul la prima scanare'}</h2>
          <p class="small">După salvare, la următoarea scanare se afișează automat rezultatul publicat. Pentru modificări ulterioare, clientul introduce codul alfanumeric unic.</p>
          <form id="editorForm">
            ${data.hasContent ? '<label>Cod unic pentru editare<input name="editCode" placeholder="Introdu codul primit" /></label>' : ''}
            <label>Titlu principal<input name="headline" value="${escapeHtml(content.headline || '')}" placeholder="Ex: Meniul video al locației" /></label>
            <label>Text descriptiv<textarea name="body" placeholder="Descriere / mesaj pentru client">${escapeHtml(content.body || '')}</textarea></label>
            <label>Eticheta butonului de re-editare<input name="buttonLabel" value="${escapeHtml(content.buttonLabel || '')}" /></label>
            <div class="grid grid-2">
              <label>Culoare fundal<input type="color" name="background" value="${content.theme.background}" /></label>
              <label>Culoare text<input type="color" name="foreground" value="${content.theme.foreground}" /></label>
              <label>Culoare accent<input type="color" name="accent" value="${content.theme.accent}" /></label>
              <label>Aliniere text<select name="textAlign">
                ${['left','center','right'].map(opt => `<option value="${opt}" ${content.theme.textAlign === opt ? 'selected' : ''}>${opt}</option>`).join('')}
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
    const theme = {
      background: formData.get('background'), foreground: formData.get('foreground'), accent: formData.get('accent'),
      fontFamily: formData.get('fontFamily'), textAlign: formData.get('textAlign')
    };
    preview.style.background = theme.background;
    preview.style.color = theme.foreground;
    preview.style.fontFamily = theme.fontFamily;
    preview.style.textAlign = theme.textAlign;
    preview.innerHTML = html`
      <span class="badge" style="background:${theme.accent}22;color:${theme.accent};border-color:${theme.accent}66">Previzualizare live</span>
      <h2>${escapeHtml(formData.get('headline') || 'Titlul tău apare aici')}</h2>
      <p>${escapeHtml(formData.get('body') || 'Aici va apărea descrierea, oferta sau mesajul personalizat.')}</p>
      ${(formData.get('imageUrl') || content.imageUrl) ? `<img src="${escapeAttribute(formData.get('imageUrl') || content.imageUrl)}" alt="preview" />` : ''}
      ${(formData.get('videoUrl') || content.videoUrl) ? `<video src="${escapeAttribute(formData.get('videoUrl') || content.videoUrl)}" controls></video>` : ''}
      <button type="button" style="width:max-content;background:linear-gradient(135deg, ${theme.accent}, #2563eb)">${escapeHtml(formData.get('buttonLabel') || 'Editează')}</button>
    `;
  };

  form.oninput = updatePreview;
  form.imageFile.onchange = (e) => { state.selectedFileImage = e.target.files[0] || null; };
  form.videoFile.onchange = (e) => { state.selectedFileVideo = e.target.files[0] || null; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      editCode: formData.get('editCode') || '',
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
      alert('Conținutul a fost salvat. La următoarea scanare se va afișa versiunea publicată.');
      state.selectedFileImage = null;
      state.selectedFileVideo = null;
      renderPublic(slug);
    } catch (error) {
      alert(error.message);
    }
  };
  updatePreview();

  if (data.hasContent) {
    const saved = data.content;
    preview.style.background = saved.theme.background;
    preview.style.color = saved.theme.foreground;
    preview.style.fontFamily = saved.theme.fontFamily;
    preview.style.textAlign = saved.theme.textAlign;
    preview.innerHTML = html`
      <span class="badge" style="background:${saved.theme.accent}22;color:${saved.theme.accent};border-color:${saved.theme.accent}66">Versiune publicată</span>
      <h2>${escapeHtml(saved.headline || '')}</h2>
      <p>${escapeHtml(saved.body || '')}</p>
      ${saved.imageUrl ? `<img src="${escapeAttribute(saved.imageUrl)}" alt="imagine publicată" />` : ''}
      ${saved.videoUrl ? `<video src="${escapeAttribute(saved.videoUrl)}" controls></video>` : ''}
      <button type="button" style="width:max-content;background:linear-gradient(135deg, ${saved.theme.accent}, #2563eb)">${escapeHtml(saved.buttonLabel || 'Editează')}</button>
      <p class="small">Pentru a modifica, introduce codul complet de editare și salvează din nou.</p>
    `;
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

route();
