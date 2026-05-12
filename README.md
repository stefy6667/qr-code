# QR Studio

Aplicație web simplă pentru generarea de coduri QR dinamice:
- doar administratorul creează și descarcă PNG-urile QR;
- clientul scanează codul, personalizează conținutul (text, imagine, video, culori, font);
- la următoarea scanare se afișează automat conținutul salvat;
- cu codul alfanumeric unic, clientul poate relua ulterior editarea.

## Pornire locală

```bash
python3 server.py
```

## Variabile de mediu

- `PORT` - portul aplicației (implicit `3000`)
- `BASE_URL` - URL-ul public folosit în link-urile QR (ex: `https://numele-tau.onrender.com`)
- `ADMIN_USERNAME` - utilizator admin
- `ADMIN_PASSWORD` - parola admin
- `SESSION_SECRET` - secret pentru cookie-ul de sesiune
- `DATA_ROOT` - directorul persistent pentru baza de date și fișiere uploadate; implicit este `./data` local și trebuie setat pe Render la `/var/data`
- `DB_PATH` - opțional, cale explicită pentru fișierul SQLite
- `UPLOAD_DIR` - opțional, cale explicită pentru fișierele media
- `PYTHON_VERSION` - recomandat pe Render: `3.11.9` (evită incompatibilități de runtime)


## Rute importante

- `/` și `/edit` deschid pagina clientului pentru introducerea codului de editare.
- `/private-admin` deschide dashboard-ul privat de admin (autentificarea rămâne obligatorie).
- `/admin` nu mai afișează dashboard-ul și redirecționează către `/edit`, ca pagina principală să nu expună zona de administrare.

## Deploy pe Render

1. Creează un nou **Web Service** din acest repo.
2. Build Command: `chmod +x server.py`
3. Start Command: `python3 server.py`
4. Setează variabilele de mediu de mai sus.
5. Montează un **persistent disk** și setează `DATA_ROOT=/var/data` ca baza de date și upload-urile să nu se piardă la refresh / restart / redeploy.
6. Fișierul `render.yaml` inclus configurează deja un disk la `/var/data`; dacă faci deploy din YAML, păstrează această setare.

## Observație QR

PNG-ul QR este livrat prin serviciul extern `api.qrserver.com`, folosind URL-ul public din `BASE_URL`.

## Editare client

Pagina publică de acces editare este `/edit` și solicită doar **codul alfanumeric de editare** (fără slug). După validare, utilizatorul este redirecționat automat la formularul QR corespunzător.

## Export arhivă mockup produse

Pentru a genera rapid o arhivă cu mockup-uri pentru toate codurile din baza de date (tricou/hanorac alb+negru):

```bash
python3 scripts/export_mockup_archive.py
```

Scriptul creează un fișier ZIP în `artifacts/` cu SVG-uri pentru fiecare cod QR și un `manifest.csv`.
