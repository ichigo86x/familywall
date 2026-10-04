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

Un Figlio può essere **solo etichetta**: non ha password e non accede all'app, ma il suo nome e colore servono per etichettare gli eventi. Impostando una password dal pannello Admin riceve di nuovo l'accesso.

I membri di un evento vengono riconosciuti dal titolo (nome o "altri nomi") ogni volta che il calendario viene caricato, senza modificare l'evento sul provider. Se assegni i membri a mano, vale la scelta manuale.

Privacy degli eventi:
- **Condiviso**: visibile a tutti.
- **Privato**: i dettagli sono visibili solo ad Admin, Genitori e membri coinvolti. Gli altri vedono "Occupato".
- **Nascosto sul pannello**: non compare sul pannello a muro.

## Cookidoo (Bimby)

Dalla sezione Admin si può collegare un account Cookidoo con email e password: il piano "La mia settimana" compare come calendario in sola lettura, con un evento di tutto il giorno per ogni ricetta pianificata (vengono lette le settimane da 5 prima a 9 dopo oggi). Cookidoo non ha API pubbliche: l'accesso usa lo stesso flusso dell'app mobile (OAuth2 con PKCE, come la libreria `cookidoo-api` usata da Home Assistant) e può smettere di funzionare se Vorwerk lo cambia.

## Google (calendari e liste)

Familywall usa le API ufficiali Google Calendar e Google Tasks con un client OAuth del tuo progetto Google Cloud (va bene anche un progetto già usato per Home Assistant):

1. In Google Cloud Console → API e servizi → Libreria abilita **Google Calendar API** e **Google Tasks API**.
2. In Credenziali usa un client OAuth esistente o creane uno:
   - **Applicazione web**: aggiungi come URI di reindirizzamento autorizzato l'indirizzo con cui apri Familywall seguito da `api/providers/google/callback` (es. `https://familywall.example.com/api/providers/google/callback`, oppure `http://localhost:5173/api/providers/google/callback` in sviluppo).
   - **App desktop**: usa come URI `http://127.0.0.1`; dopo il consenso la pagina finale non si apre, copiane l'indirizzo e incollalo in Familywall.
3. La schermata di consenso OAuth deve essere **In produzione** (anche non verificata): in modalità "Test" Google fa scadere l'accesso dopo 7 giorni.
4. In Familywall: Admin → Collega account → Google, inserisci Client ID, Client secret e URI, poi "Apri Google". Dopo il collegamento usa "Scegli calendari" e "Scegli liste".

Client secret e refresh token sono salvati cifrati come le altre credenziali. Le liste (spesa, compiti...) restano su Google Tasks: si possono gestire anche dall'app Google Tasks dello stesso account. Le note della bacheca sono salvate solo in Familywall.

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
