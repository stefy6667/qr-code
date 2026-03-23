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

## Deploy pe Render

1. Creează un nou **Web Service** din acest repo.
2. Build Command: `chmod +x server.py`
3. Start Command: `python3 server.py`
4. Setează variabilele de mediu de mai sus.
5. Opțional, atașează un persistent disk pentru directoarele `data/` și `uploads/` dacă vrei ca baza de date și fișierele să rămână după redeploy.

## Observație QR

PNG-ul QR este livrat prin serviciul extern `api.qrserver.com`, folosind URL-ul public din `BASE_URL`.
