# Sviluppare Familywall

Guida per chi lavora sul codice: avvio in locale, prova come add-on, pubblicazione di una versione e funzionamento interno.

## Struttura

| Percorso | Contenuto |
|---|---|
| `apps/api` | API NestJS: SQLite (`node:sqlite`), autenticazione JWT, client CalDAV, Google, Cookidoo e Home Assistant, gateway CalDAV verso Radicale, ponte Python per pyicloud (`apps/api/python`). In produzione serve anche la web app. |
| `apps/web` | Web app React + Vite + Fluent UI. Usa hash routing e percorsi relativi, quindi funziona sotto l'ingress di Home Assistant e dietro un reverse proxy. |
| `packages/shared` | Tipi, permessi per ruolo e schemi zod condivisi da API e web. |
| `familywall/` | L'add-on di Home Assistant: `config.yaml`, documentazione, changelog, icone. |
| `repository.yaml` | Rende questo repository un repository di add-on per Home Assistant. |
| `Dockerfile` | Immagine dell'add-on, costruita dalla radice del repository. |
| `scripts/` | Avvio in sviluppo, preparazione dell'add-on locale, setup di Python, reset della password, icone. |
| `.github/workflows` | Controlli a ogni push e pubblicazione delle immagini dell'add-on. |

## Avvio in locale

Servono Node.js 24 o più recente (per `node:sqlite`) e Python 3.10 o più recente.

```bash
npm install
npm run python:setup   # una volta: crea apps/api/.venv con Radicale e pyicloud
npm run dev:api        # API su http://localhost:3001, dati in apps/api/data
npm run dev:web        # web su http://localhost:5173, /api e /dav inoltrati all'API
```

- `python:setup` installa Radicale 3.8.1 e pyicloud 2.6.5, le stesse versioni dell'add-on. L'API usa quel Python da sola se `RADICALE_COMMAND` e `ICLOUD_PYTHON` non sono impostati. Senza Radicale liste, menu, compleanni, turni e note rispondono 502 e il log dice "Radicale is not installed".
- `dev:api` ricompila e riavvia l'API quando cambiano `apps/api` o `packages/shared`. All'avvio applica le migrazioni del database: dopo un `git pull` riavvialo.
- Al primo accesso la web app chiede di creare la famiglia e l'account Admin.
- **Porta occupata**: l'API si ferma con "Port 3001 is already in use". Se sulla 3001 risponde un altro programma, la web app riceve le sue risposte e mostra "Qualcosa non ha funzionato". Usa un'altra porta:

  ```powershell
  $env:PORT = "3002"; npm run dev:api
  $env:API_PROXY_TARGET = "http://localhost:3002"; npm run dev:web
  ```

- **Password dimenticata**: `npm run reset-password -- <utente>` chiede la nuova password e la salva nel database di `apps/api/data`, chiudendo le sessioni aperte. `--disable-totp` spegne anche la verifica in due passaggi, `--data <cartella>` usa un'altra cartella dati.

### Variabili d'ambiente

Vedi anche `.env.example`.

| Variabile | Uso |
|---|---|
| `PORT` | Porta dell'API (3001). |
| `DATA_DIR` | Cartella dei dati (`./data`, `/data` nell'add-on). |
| `WEB_DIST_DIR` | Web app compilata servita dall'API in produzione. |
| `JWT_EXPIRES_IN` | Durata delle sessioni (30 giorni). |
| `CORS_ORIGINS` | Origini extra ammesse (in sviluppo il server Vite). |
| `RADICALE_COMMAND`, `RADICALE_PORT` | Comando e porta (5232, solo `127.0.0.1`) del server CalDAV; vuoto lo disattiva. |
| `ICLOUD_PYTHON`, `ICLOUD_BRIDGE_PORT` | Python con pyicloud e porta locale (5234) del ponte per i Promemoria iCloud; vuoto lo disattiva. |
| `HA_URL`, `HA_TOKEN` | Home Assistant fuori dall'add-on: indirizzo e token di lunga durata (Profilo → Sicurezza → Token di accesso a lungo termine). Nell'add-on si usa il Supervisor. |
| `DEV_ALLOWED_HOSTS`, `API_PROXY_TARGET` | Server Vite dietro un reverse proxy; destinazione delle chiamate `/api` e `/dav`. |

Non mettere mai token, password o client secret nel repository o nei file `.env` versionati.

### Provare da telefono o pannello

Il server Vite si può pubblicare dietro un reverse proxy (per esempio Nginx Proxy Manager verso la porta 5173 del PC):

```bash
DEV_ALLOWED_HOSTS=famiglia.example.com npm run dev:web
```

Attiva il supporto WebSocket nel proxy (serve al ricaricamento automatico). Vite inoltra `/api`, `/dav` e `/.well-known/caldav` all'API con gli header `X-Forwarded-*`.

### Test e build

```bash
npm test             # test dell'API (vitest)
npm run typecheck
npm run build
```

I test usano un server CalDAV in memoria e client finti: non toccano iCloud, Google o Cookidoo veri. Per pyicloud non fare mai accessi Apple reali dai test.

## Provare l'add-on sul proprio Home Assistant

Senza pubblicare nulla, Home Assistant può costruire l'add-on dai sorgenti:

1. `npm run addon:stage` prepara `build/addon/familywall`: i file dell'add-on, il `Dockerfile` e i sorgenti, con `config.yaml` senza la riga `image` (così Home Assistant costruisce l'immagine sul posto invece di scaricarla).
2. Copia quella cartella in `/addons/familywall` di Home Assistant (add-on Samba o SSH).
3. Store dei componenti aggiuntivi → ⋮ → **Controlla aggiornamenti**: Familywall compare tra gli add-on locali. La prima build richiede qualche minuto.

Per aggiornare ripeti i passi e usa **Ricostruisci** (o **Aggiorna** se la versione è cambiata). Se copi sopra la cartella vecchia, i file eliminati nel frattempo restano: la build li cancella da sola grazie all'elenco `staged-files.txt` scritto da `addon:stage`.

Non installare insieme l'add-on locale e quello del repository online: hanno lo stesso slug.

## Pubblicare una versione

Gli utenti installano l'add-on dal repository GitHub: Home Assistant legge `familywall/config.yaml` e scarica l'immagine `ghcr.io/ichigo86x/{arch}-addon-familywall` della versione indicata.

1. Aggiorna `version` in `familywall/config.yaml` e aggiungi le novità in `familywall/CHANGELOG.md`.
2. Fai il commit e un tag uguale alla versione, poi pubblicali:

   ```bash
   git tag v0.9.0
   git push origin main v0.9.0
   ```

3. Il workflow **Publish add-on** controlla che il tag corrisponda alla versione, costruisce le immagini `amd64` e `aarch64` e le pubblica su GitHub Container Registry con i tag della versione e `latest`.
4. **Solo la prima volta**: su GitHub, in Packages, rendi **pubblici** i pacchetti `amd64-addon-familywall` e `aarch64-addon-familywall`, altrimenti Home Assistant non può scaricarli.

Pubblica il commit con la nuova versione solo insieme al tag: se `config.yaml` annuncia una versione la cui immagine non esiste ancora, gli utenti vedono un aggiornamento che non si installa.

Il workflow **CI** esegue typecheck, test e build a ogni push su `main` e nelle pull request.

## Come funziona

### Dati della famiglia sul server CalDAV

Familywall avvia Radicale su `127.0.0.1` e ci tiene i dati della famiglia, nell'utente condiviso `famiglia`. Il gateway `/dav` autentica i membri con le loro credenziali di Familywall e applica i permessi del ruolo; Radicale si fida dell'utente indicato dal gateway, quindi **la sua porta non va mai esposta**.

| Raccolta | Contenuto | Sul telefono |
|---|---|---|
| Liste (per esempio "Spesa") | promemoria (VTODO) | Promemoria |
| `familywall-menu` | un evento di tutto il giorno per piatto ("Cena: Minestrone"), ingredienti e nota nella descrizione | Calendario |
| `familywall-compleanni` | un evento di tutto il giorno ripetuto ogni anno ("🎂 Luca") | Calendario |
| `familywall-turni` | eventi settimanali, o ogni due settimane per pari/dispari ("Anna: Ufficio") | Calendario |
| `familywall-routine` | eventi settimanali, un passo per riga nella descrizione | Calendario |
| `familywall-note` | voci di diario (VJOURNAL) | solo client che le supportano |

- Le informazioni che conosce solo Familywall (tipo di turno, membro, colore della nota, faccende fatte, anno di nascita...) stanno in proprietà `X-FAMILYWALL-*`. I valori multipli sono separati da spazi: con le virgole Radicale ne conserverebbe solo il primo.
- Un evento aggiunto dal telefono vale come piatto, compleanno o turno; nel menu il pasto si sceglie iniziando il titolo con "Colazione:", "Pranzo:", "Merenda:" o "Cena:".
- Dal telefono i figli scrivono solo liste e note; solo l'Admin crea, rinomina o elimina le raccolte.
- **Migrazione dalla 0.3**: le versioni fino alla 0.3 tenevano menu, compleanni, turni e note nel database. All'avvio (e dopo il ripristino di un backup vecchio) Familywall li scrive su Radicale con lo stesso identificativo e li cancella dal database solo dopo averli scritti; se si interrompe, riprende senza doppioni.

### Menu e compleanni su calendari esterni

Menu e compleanni possono stare anche su un calendario di iCloud, Google o di un altro server CalDAV (`FamilyTargetsService`). Si usano gli stessi oggetti iCalendar del server integrato: su CalDAV vengono scritti così come sono, su Google vengono convertiti in eventi con le proprietà `X-FAMILYWALL-*` nelle proprietà private estese. Lo spostamento copia ogni elemento con lo stesso identificativo e poi lo cancella dalla vecchia posizione. I calendari Google generati (compleanni dei contatti, festività) sono esclusi perché di sola lettura.

### Cache e sincronizzazione

- **Calendari**: ogni 5 minuti l'API legge i calendari visibili (da un mese fa a sei mesi avanti) e li salva nel database; le pagine leggono dalla cache e, se un provider non risponde, mostrano gli ultimi eventi con l'ora dei dati. Dopo una modifica il calendario viene riletto.
- **Liste esterne** (Google, iCloud, Home Assistant): in memoria sul server, rilette ogni 2 minuti; una richiesta riceve subito la copia e, se ha più di 30 secondi, ne avvia la rilettura. Le scritture aggiornano subito la copia.
- **Calendari esterni per menu e compleanni**: letti al massimo una volta al minuto, con l'ultima lettura buona in caso di errore.
- **Web app**: ogni pagina tiene in memoria gli ultimi dati della sessione; i dispositivi salvano le ultime risposte per l'uso offline (service worker in HTTPS). Tutto si cancella all'uscita.

### Promemoria iCloud

Le liste dei Promemoria non sono più raggiungibili via CalDAV con la password per app. Familywall avvia `apps/api/python/icloud_bridge.py` con pyicloud (la libreria dell'integrazione iCloud di Home Assistant) su `127.0.0.1`, protetto da un token casuale. La sessione Apple sta in `DATA_DIR/icloud`. In caso di sessione scaduta l'API riapre l'accesso una sola volta per richiesta, senza riprovare in ciclo, per non far bloccare l'account da Apple.

### Google

Calendari e Google Tasks usano un client OAuth del progetto Google Cloud dell'utente (API Calendar e Tasks abilitate, schermata di consenso "In produzione", altrimenti l'accesso scade dopo 7 giorni). L'URI di reindirizzamento è l'indirizzo di Familywall seguito da `api/providers/google/callback`, oppure `http://127.0.0.1` con un client "App desktop". Client secret e refresh token sono salvati cifrati.

### Sicurezza

- Password con scrypt; credenziali dei provider e segreti TOTP cifrati con AES-256 (`secret.key`); sessioni firmate con `jwt.key`. Cambiare ruolo, password o stato di un membro chiude le sue sessioni.
- Limite ai tentativi di accesso per IP e per utente; l'API si fida di un solo proxy (`trust proxy 1`).
- Il registro attività salva metodo, percorso, utente ed esito delle scritture, mai il contenuto; tiene 6 mesi (al massimo 20.000 voci).

### Dati su disco

Tutto vive in `DATA_DIR`:

| File | Contenuto |
|---|---|
| `familywall.db` | database SQLite: configurazione, utenti, collegamenti, cache dei calendari, registro attività |
| `secret.key` | chiave che cifra le credenziali; se la perdi, gli account vanno ricollegati |
| `jwt.key` | chiave delle sessioni |
| `radicale/` | dati della famiglia |
| `icloud/` | sessioni di pyicloud |
| `backups/` | copie giornaliere (ultime 7) |

**Non salvare mai nel repository** `data/`, i file `*.db`, `*.key`, `*.fwbackup`, `.env`, password, token o client secret: `.gitignore` li esclude già. Nei test e negli esempi usa nomi generici (Mario, Anna, Luca, Sofia).
