# Familywall

Calendario di famiglia multi-utente: calendari iCloud (e CalDAV) condivisi, ruoli per membro e pannello a muro in sola lettura. Gira come add-on di Home Assistant ed è usabile come web app su iPhone, iPad, tablet Android ed Echo Show.

## Struttura

| Percorso | Contenuto |
|---|---|
| `apps/api` | API NestJS. SQLite (`node:sqlite`), autenticazione JWT, client CalDAV. In produzione serve anche la web app. |
| `apps/web` | SPA React + Vite + Fluent UI. Hash routing e asset relativi, così funziona sia sotto l'ingress di HA sia dietro nginx. |
| `packages/shared` | Tipi, permessi per ruolo e schemi zod condivisi da API e web. |
| `homeassistant/familywall` | Add-on di Home Assistant (`config.yaml`, `Dockerfile`). |

## Ruoli

| Ruolo | Calendario | Eventi | Membri, account, impostazioni |
|---|---|---|---|
| Admin | legge | crea e modifica | gestisce |
| Genitore | legge | crea e modifica | — |
| Figlio | legge | — | — |
| Pannello (kiosk) | legge, senza eventi "nascosti sul wall" | — | — |

Privacy degli eventi:
- **Condiviso**: visibile a tutti.
- **Privato**: i dettagli sono visibili solo ad Admin, Genitori e membri coinvolti. Gli altri vedono "Occupato".
- **Nascosto sul pannello**: non compare sul pannello a muro.

## Sviluppo locale

Serve Node.js 24 o superiore (per `node:sqlite`).

```bash
npm install
npm run dev:api   # API su http://localhost:3001, dati in apps/api/data
npm run dev:web   # web su http://localhost:5173, /api inoltrato all'API
```

Al primo accesso la web app chiede di creare la famiglia e l'account Admin.

Se la porta 3001 è occupata: avvia l'API con `PORT=3002 npm run dev:api` e il web con `API_PROXY_TARGET=http://localhost:3002 npm run dev:web`.

```bash
npm test           # test API
npm run typecheck
npm run build
```

## Dati e chiavi

Tutto vive in `DATA_DIR`: `/data` nell'add-on, `./data` in sviluppo.
- `familywall.db`: database SQLite.
- `secret.key`: chiave AES-256 che cifra le password degli account calendario. **Se la perdi, gli account vanno ricollegati.**
- `jwt.key`: chiave che firma le sessioni.

Il backup di Home Assistant include `/data`.

## Installazione come add-on di Home Assistant (locale)

1. Prepara il contesto di build: `npm run addon:stage`. Copia i sorgenti in `homeassistant/familywall/app`.
2. Copia la cartella `homeassistant/familywall` nella cartella `/addons` di Home Assistant (add-on Samba o SSH), così: `/addons/familywall`.
3. In Home Assistant apri **Impostazioni → Componenti aggiuntivi → Store**, menu ⋮ → **Controlla aggiornamenti**. "Familywall" compare tra gli add-on locali.
4. Installa e avvia. La prima build richiede qualche minuto.
5. Apri Familywall dalla barra laterale (ingress) e completa la configurazione iniziale.

La porta `3001` è esposta per il reverse proxy esterno. Se non ti serve, svuotala nella scheda **Rete** dell'add-on.

## Accesso esterno con nginx

L'app ha un proprio login, quindi può essere pubblicata senza esporre Home Assistant. Usa sempre HTTPS: le password viaggiano nel corpo delle richieste.

```nginx
server {
    listen 443 ssl http2;
    server_name famiglia.example.com;

    ssl_certificate     /etc/letsencrypt/live/famiglia.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/famiglia.example.com/privkey.pem;

    location / {
        proxy_pass http://IP_DI_HOME_ASSISTANT:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

L'API considera attendibile un solo proxy (`trust proxy 1`), così il limite ai tentativi di login usa l'IP reale del client.

## Web app su iPhone e iPad

Apri l'indirizzo esterno in Safari, poi **Condividi → Aggiungi alla schermata Home**. L'app si apre a schermo intero con la propria icona e resta connessa (sessione di 30 giorni, configurabile con `JWT_EXPIRES_IN`).

Su tablet Android ed Echo Show 15 apri lo stesso indirizzo nel browser e accedi con un utente di ruolo **Pannello**. Il planner si aggiorna da solo ogni 5 minuti.

## Account iCloud

iCloud accetta solo una **password specifica per app** (account.apple.com → Accesso e sicurezza → Password specifiche per le app). È consigliato un Apple ID dedicato alla famiglia, con cui ogni genitore condivide i propri calendari con permesso "può modificare". Se cambi la password dell'Apple ID, Apple revoca le password per app e l'account va ricollegato.

## Stato attuale e prossimi passi

- Creazione, modifica ed eliminazione degli eventi vengono scritte direttamente su iCloud/CalDAV. Per gli eventi ripetuti l'app chiede se agire solo sull'evento scelto o su tutta la serie.
- Gli eventi vengono letti dal provider a ogni apertura del calendario. È prevista una sincronizzazione periodica con cache.
- Dashboard e liste sono ancora segnaposto.
