# Familywall

Familywall è l'organizzazione della famiglia su un'unica schermata:
- calendari condivisi (iCloud, CalDAV, Google);
- piano dei pasti Cookidoo;
- liste sincronizzate con i Promemoria di iPhone o con Google Tasks;
- bacheca di note;
- turni di casa;
- dashboard con screensaver per il pannello a muro.

Gira come add-on di Home Assistant. Si usa come web app su iPhone, iPad, tablet Android ed Echo Show 15 (con Fully Kiosk Browser).

## Indice

- [Funzionalità](#funzionalità)
- [Ruoli e permessi](#ruoli-e-permessi)
- [Primo avvio](#primo-avvio)
- [Collegare i calendari](#collegare-i-calendari)
- [Liste nei Promemoria di iPhone (CalDAV)](#liste-nei-promemoria-di-iphone-caldav)
- [Pannello a muro: Echo Show 15 con Fully Kiosk](#pannello-a-muro-echo-show-15-con-fully-kiosk)
- [Web app su iPhone e iPad](#web-app-su-iphone-e-ipad)
- [Sviluppo locale](#sviluppo-locale)
- [Installazione come add-on di Home Assistant](#installazione-come-add-on-di-home-assistant)
- [Accesso esterno con nginx](#accesso-esterno-con-nginx)
- [Dati, chiavi e backup](#dati-chiavi-e-backup)
- [Struttura del progetto](#struttura-del-progetto)
- [Limiti noti e prossimi passi](#limiti-noti-e-prossimi-passi)

## Funzionalità

### Dashboard

È la pagina iniziale, pensata per il pannello a muro. Non ha intestazione di pagina, per lasciare più spazio ai contenuti. Mostra:
- **Orologio e meteo**: ora e data grandi, su uno sfondo animato che segue il meteo del giorno (sereno, nuvoloso, pioggia, neve, nebbia, temporale, di giorno o di notte). Accanto ci sono la temperatura attuale, minima e massima, la probabilità di pioggia e il meteo di domani.
- **Agenda**: gli eventi di oggi non ancora finiti, con il prossimo (o quello in corso) evidenziato, e sotto gli impegni di **domani**. Quando la giornata è conclusa, domani passa in primo piano.
- **Prossimi giorni**: i cinque giorni dopo domani, con i primi impegni di ogni giorno e l'icona dei pasti Cookidoo.
- **Turni**: lavoro dei genitori, faccende dei bambini e presenze in casa di oggi. Dalle 18 il lavoro dei genitori mostra già quello di domani.
- **In tavola**: i pasti Cookidoo di oggi e domani, se c'è un calendario Cookidoo.
- **Liste**: le liste scelte, con un campo per aggiungere subito una voce.
- **Note**: le note scelte.
- **Azioni rapide**: nuovo evento, nuovo turno, nuova nota e liste, secondo i permessi dell'utente.

Se non ci sono dati, ogni sezione mostra un messaggio con un suggerimento invece di restare vuota. I contenuti si aggiornano da soli ogni 5 minuti.

- **Meteo**: in Admin → Meteo cerca la città e sceglila. Familywall usa Open-Meteo, gratuito e senza account. Al servizio arrivano solo le coordinate della città. La previsione resta in memoria 20 minuti.
- **Liste in dashboard**: in Liste, tocca la puntina di una lista. Se nessuna lista è scelta, compare la lista della spesa.
- **Note in dashboard**: apri una nota e attiva "Mostra in dashboard". Se nessuna nota è scelta, compaiono le prime quattro.
- **Screensaver**: tocca l'orologio per aprire a tutto schermo una scena stagionale animata con l'ora e il prossimo impegno. Se il browser lo permette, lo schermo resta acceso. Un tocco chiude lo screensaver.
- **Screensaver automatico**: sugli account Pannello lo screensaver parte da solo dopo 5 minuti senza tocchi, su ogni pagina tranne Admin (dashboard, calendario, turni, liste, note).

### Calendario

- Viste: 7 giorni, 14 giorni (predefinita) e mese. Il planner occupa esattamente lo schermo.
- I giorni e gli eventi passati sono sbiaditi. Oggi è evidenziato.
- Gli eventi di tutto il giorno mostrano solo il titolo, in alto nel giorno.
- **Nuovo evento**: titolo, orari o tutto il giorno, calendario, membri, colore principale e privacy.
- **Ripetizioni**: ogni giorno, settimana (con i giorni scelti), mese o anno. La serie può non finire mai, finire a una data o dopo N volte. Gli orari seguono il fuso della famiglia.
- **Eventi ripetuti**: per modificarne o eliminarne uno, l'app chiede se agire solo su quell'evento o su tutta la serie.
- Le modifiche vengono scritte subito sul provider (iCloud, CalDAV, Google).
- **Colori dei membri**: i membri vengono riconosciuti dal titolo, con il nome o gli "altri nomi" impostati in Admin. Esempio: "Karate Luca" prende il colore di Luca. Il riconoscimento avviene a ogni caricamento e non modifica l'evento sul provider. Se assegni i membri a mano, vale la scelta manuale.
- **Pasti Cookidoo**: compaiono come un cappello da chef nel giorno, colorato come il calendario. Tocca il cappello per vedere le ricette.
- Il calendario si aggiorna da solo ogni 5 minuti.

Privacy degli eventi:
- **Condiviso**: visibile a tutti.
- **Privato**: i dettagli sono visibili solo ad Admin, Genitori e membri coinvolti. Gli altri vedono "Occupato".
- **Nascosto sul pannello**: non compare sugli account Pannello.

### Turni

La pagina Turni mostra la settimana con:
- **Lavoro genitori**: smart working, ufficio, trasferta, ferie o riposo, con orari facoltativi;
- **Faccende bambini**: apparecchiare, sparecchiare e altre faccende;
- **Presenze in casa**: per esempio pulizie, babysitter o nonni, con nome della persona e orari.

Ogni turno vale in uno di due modi:
- **Ricorrente**: nei giorni della settimana scelti, ogni settimana oppure solo nelle settimane pari o dispari (utile per alternare due figli);
- **Una volta**: in una data precisa.

I turni di oggi compaiono anche in dashboard ("Oggi in casa").

### Liste

- Le liste vengono da due fonti: i Promemoria di iPhone (server CalDAV integrato) e Google Tasks.
- Puoi aggiungere, spuntare ed eliminare le voci. Le liste si aggiornano da sole ogni 2 minuti.
- La puntina sceglie quali liste compaiono in dashboard.

### Note

- La bacheca di famiglia contiene note colorate. Le note possono essere fissate in alto e mostrate in dashboard.
- Le note sono salvate solo in Familywall.

### Tema e dimensione del testo

- Il menu **Schermo** nell'intestazione sceglie il tema e la dimensione del testo.
- Tema: automatico (segue il dispositivo), chiaro o scuro.
- Testo: automatico, normale, grande, molto grande o enorme.
- In automatico, gli schermi grandi ricevono testo più grande:
  - 130% da 1800×950 (Echo Show 15, TV), in qualsiasi orientamento;
  - 115% da 1500×800.
- Le scelte valgono solo per il dispositivo su cui le fai.
- L'impaginazione si adatta a telefono, tablet, Echo Show (orizzontale e verticale) e desktop.
- Su telefono le sezioni sono in una barra in basso, come in un'app. I dialoghi si aprono dal basso, hanno sempre il pulsante di chiusura e tengono visibili i pulsanti Salva e Annulla.
- Sugli schermi touch, pulsanti e campi sono alti almeno 44 px.

## Ruoli e permessi

| Ruolo | Calendario | Eventi e turni | Liste e note | Membri, account, impostazioni |
|---|---|---|---|---|
| Admin | legge | crea e modifica | scrive | gestisce |
| Genitore | legge | crea e modifica | scrive | — |
| Figlio | legge | — | scrive | — |
| Pannello | legge, senza eventi "nascosti sul pannello" | solo in modalità scrittura | solo in modalità scrittura | — |

- **Pannello in modalità scrittura**: in Admin → Membri e permessi, modifica l'account Pannello e attiva "Modalità scrittura". Dal pannello a muro si possono così aggiungere e modificare eventi, turni, voci delle liste e note.
  - Il pannello gestisce solo eventi **condivisi**.
  - Non vede la scelta della privacy.
  - Non può modificare né eliminare eventi privati o nascosti. L'API applica la stessa regola.
- **Figlio solo etichetta**: non ha password e non accede all'app. Il suo nome e colore servono per etichettare gli eventi. Imposta una password dal pannello Admin per dargli di nuovo l'accesso.
- **Disattivare un account o cambiarne ruolo, password o accesso** chiude subito le sue sessioni aperte.

## Primo avvio

1. Apri Familywall. La prima schermata chiede il nome della famiglia e crea l'account Admin.
2. In **Admin → Membri e permessi** aggiungi i membri:
   - genitori e figli;
   - un account **Pannello** per ogni schermo a muro.
3. Per ogni membro imposta il colore e gli "altri nomi" (soprannomi usati nei titoli degli eventi).
4. In **Admin → Account calendario** scegli "Collega account" per ogni provider. Poi usa "Scegli calendari" e "Scegli liste".

Il fuso orario della famiglia è `Europe/Rome`.

## Collegare i calendari

### iCloud

- iCloud accetta solo una **password specifica per app**. Creala in account.apple.com → Accesso e sicurezza → Password specifiche per le app.
- Consigliato: un Apple ID dedicato alla famiglia. Ogni genitore condivide con questo Apple ID i propri calendari, con permesso "può modificare".
- Se cambi la password dell'Apple ID, Apple revoca le password per app. Poi ricollega l'account in Familywall.

### CalDAV generico

Inserisci l'indirizzo del server, l'utente e la password, per esempio di Nextcloud, Fastmail o Radicale.

### Google (calendari e liste)

Familywall usa le API ufficiali Google Calendar e Google Tasks con un client OAuth del tuo progetto Google Cloud. Va bene anche un progetto già usato per Home Assistant.

1. In Google Cloud Console → API e servizi → Libreria, abilita **Google Calendar API** e **Google Tasks API**.
2. In Credenziali, usa un client OAuth esistente o creane uno:
   - **Applicazione web**: aggiungi come URI di reindirizzamento autorizzato l'indirizzo di Familywall seguito da `api/providers/google/callback`. Esempi:
     - `https://familywall.example.com/api/providers/google/callback`;
     - `http://localhost:5173/api/providers/google/callback` in sviluppo.
   - **App desktop**: usa come URI `http://127.0.0.1`. Dopo il consenso la pagina finale non si apre: copia il suo indirizzo e incollalo in Familywall.
3. Imposta la schermata di consenso OAuth su **In produzione** (anche non verificata). In modalità "Test", Google fa scadere l'accesso dopo 7 giorni.
4. In Familywall apri Admin → Account calendario → Collega account → Google. Inserisci Client ID, Client secret e URI, poi scegli "Apri Google".
5. Dopo il collegamento usa "Scegli calendari" e "Scegli liste".

Il client secret e il refresh token sono salvati cifrati. Inseriscili solo nel campo Admin di Familywall: non metterli in file del repository o nelle variabili d'ambiente. Se un client secret è stato condiviso per errore, rigeneralo in Google Cloud Console.

### Cookidoo (Bimby)

- In Admin collega un account Cookidoo con email e password.
- Il piano "La mia settimana" compare come calendario in sola lettura. Familywall legge le settimane da 5 prima a 9 dopo oggi.
- In calendario i pasti compaiono come un cappello da chef nel giorno.
- Cookidoo non ha API pubbliche. L'accesso usa lo stesso flusso dell'app mobile: OAuth2 con PKCE, come la libreria `cookidoo-api` usata da Home Assistant. Questo accesso può smettere di funzionare se Vorwerk cambia il flusso.

## Liste nei Promemoria di iPhone (CalDAV)

Familywall include un server CalDAV (Radicale) per le liste di famiglia.
- Admin, Genitori e Figli vedono le liste nell'app Promemoria dell'iPhone, con il proprio utente e la propria password di Familywall.
- Tutti condividono le stesse liste. Alla prima partenza Familywall crea la lista "Spesa".
- Gli account Pannello e i Figli solo etichetta non accedono al server CalDAV.

Collegare un iPhone:
- **Automatico**: in Familywall apri Liste → "Le liste nei Promemoria" → "Installa su questo iPhone". Serve l'indirizzo esterno https. Tocca "Consenti", poi apri Impostazioni → Profilo scaricato → Installa. Il link vale 10 minuti e si può riaprire più volte in quel tempo. Il profilo non contiene la password: iOS la chiede durante l'installazione. Se Familywall è aperta come app dalla schermata Home, il profilo si apre in Safari.
- **Manuale**: in Impostazioni → Promemoria → Account → Aggiungi account → Altro → Account CalDAV, usa il server `<indirizzo>/dav/famiglia/`.

Note:
- iOS richiede HTTPS con un certificato valido. Usa l'indirizzo pubblicato tramite nginx.
- Se nginx pubblica Familywall in un sotto-percorso, imposta l'header `X-Forwarded-Prefix`.
- Radicale ascolta solo su `127.0.0.1` e si fida dell'utente indicato da Familywall. **Non esporre mai la sua porta** (`RADICALE_PORT`, predefinita 5232).
- I dati di Radicale stanno in `data/radicale`.
- Nell'add-on Radicale è già installato. In sviluppo:
  - installalo con `pip install radicale`;
  - imposta `RADICALE_COMMAND="python -m radicale"`;
  - lascia `RADICALE_COMMAND` vuoto per disattivarlo.

## Pannello a muro: Echo Show 15 con Fully Kiosk

1. In Admin crea un membro con ruolo **Pannello**. Attiva "Modalità scrittura" se il pannello deve anche aggiungere eventi, turni, liste e note.
2. Sull'Echo Show 15 installa Fully Kiosk Browser.
3. In Fully imposta la **Start URL** con l'indirizzo di Familywall, per esempio `https://famiglia.example.com/`.
   - Per fissare la dimensione del testo dall'URL, aggiungi `?scale=130` prima del `#`. Esempio: `https://famiglia.example.com/?scale=130#/`.
   - Valori ammessi: `auto`, `100`, `115`, `130`, `150`. Il valore resta memorizzato sul pannello. Puoi cambiarlo anche dal menu Schermo.
4. Impostazioni consigliate in Fully:
   - schermo intero e schermo sempre acceso;
   - in "Web Zoom and Scaling", lascia lo zoom al 100% e disattiva "Load Overview Mode". Familywall regola già la dimensione del testo.
   - riavvio automatico della pagina in caso di errore.
5. Accedi con l'account Pannello. Il pannello si apre sulla dashboard. Dopo 5 minuti senza tocchi parte lo screensaver, anche se il pannello è rimasto su calendario, turni, liste o note.

A 1920×1080 la dashboard sta in una sola schermata:
- a sinistra: orologio con meteo, agenda di oggi e domani, prossimi giorni e note;
- a destra: turni, pasti, liste e azioni rapide.

In verticale (1080×1920) restano due colonne con il testo grande.

## Web app su iPhone e iPad

1. Apri l'indirizzo esterno in Safari.
2. Scegli **Condividi → Aggiungi alla schermata Home**.

L'app si apre a schermo intero con la propria icona. Resta connessa per 30 giorni (configurabile con `JWT_EXPIRES_IN`).

## Sviluppo locale

Serve Node.js 24 o superiore, per `node:sqlite`.

```bash
npm install
npm run dev:api   # API su http://localhost:3001, dati in apps/api/data
npm run dev:web   # web su http://localhost:5173, /api e /dav inoltrati all'API
```

- Al primo accesso la web app chiede di creare la famiglia e l'account Admin.
- Se la porta 3001 è occupata:
  - avvia l'API con `PORT=3002 npm run dev:api`;
  - avvia il web con `API_PROXY_TARGET=http://localhost:3002 npm run dev:web`.

In PowerShell imposta le variabili prima del comando:

```powershell
$env:RADICALE_COMMAND = "python -m radicale"; npm run dev:api
```

Per fermare API e web, premi `Ctrl+C` nei rispettivi terminali.

### Provare dal telefono o dall'Echo Show (Nginx Proxy Manager)

Il server di sviluppo Vite si può pubblicare dietro un reverse proxy, per esempio Nginx Proxy Manager che punta alla porta 5173 del PC:
1. Avvia il web con il nome host pubblico, **senza porta**:

   ```bash
   DEV_ALLOWED_HOSTS=famiglia.example.com npm run dev:web
   ```

2. In Nginx Proxy Manager attiva "Websockets Support". Vite lo usa per il ricaricamento automatico.
3. Vite inoltra `/api`, `/dav` e `/.well-known/caldav` all'API con gli header `X-Forwarded-*`.

Non serve installare l'add-on per provare iPhone ed Echo Show.

### Test e build

```bash
npm test           # test API
npm run typecheck
npm run build
```

## Installazione come add-on di Home Assistant

1. Prepara il contesto di build con `npm run addon:stage`. Il comando copia i sorgenti in `homeassistant/familywall/app`.
2. Copia la cartella `homeassistant/familywall` nella cartella `/addons` di Home Assistant, per esempio con l'add-on Samba o SSH. Il risultato deve essere `/addons/familywall`.
3. In Home Assistant apri **Impostazioni → Componenti aggiuntivi → Store**. Dal menu ⋮ scegli **Controlla aggiornamenti**. "Familywall" compare tra gli add-on locali.
4. Installa e avvia l'add-on. La prima build richiede qualche minuto.
5. Apri Familywall dalla barra laterale (ingress) e completa la configurazione iniziale.

- La porta `3001` è esposta per il reverse proxy esterno. Se non ti serve, svuotala nella scheda **Rete** dell'add-on.
- L'immagine include Radicale per le liste dei Promemoria.

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

- L'API considera attendibile un solo proxy (`trust proxy 1`). Così il limite ai tentativi di login usa l'IP reale del client.
- Il blocco `location /` copre anche `/dav` e `/.well-known/caldav` per i Promemoria.

## Dati, chiavi e backup

Tutto vive in `DATA_DIR`: `/data` nell'add-on, `./data` in sviluppo.
- `familywall.db`: database SQLite.
- `secret.key`: chiave AES-256 che cifra le credenziali dei provider. **Se la perdi, devi ricollegare gli account.**
- `jwt.key`: chiave che firma le sessioni.
- `radicale/`: liste dei Promemoria.

Il backup di Home Assistant include `/data`.

**Non salvare mai nel repository la cartella `data/`, i file `*.db` e `*.key`, i file `.env`, le password o i client secret.** Il file `.gitignore` li esclude già.

## Struttura del progetto

| Percorso | Contenuto |
|---|---|
| `apps/api` | API NestJS: SQLite (`node:sqlite`), autenticazione JWT, client CalDAV, Google e Cookidoo, gateway CalDAV verso Radicale. In produzione serve anche la web app. |
| `apps/web` | SPA React + Vite + Fluent UI. Usa hash routing e asset relativi, quindi funziona sotto l'ingress di HA e dietro nginx. |
| `packages/shared` | Tipi, permessi per ruolo e schemi zod condivisi da API e web. |
| `homeassistant/familywall` | Add-on di Home Assistant (`config.yaml`, `Dockerfile`). |

## Limiti noti e prossimi passi

- Gli eventi vengono letti dal provider a ogni caricamento del calendario. È prevista una sincronizzazione periodica con cache.
- Le note restano solo in Familywall: non c'è sincronizzazione con Note di iCloud o Google Keep, che non hanno API pubbliche adatte.
- Cookidoo è in sola lettura e usa un'API non ufficiale.
