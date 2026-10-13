<p align="center"><img src="familywall/logo.png" alt="Familywall" width="250"></p>

# Familywall

**L'organizzazione della famiglia su un'unica schermata.** Calendari, menu, lista della spesa, turni di casa, faccende dei bambini, compleanni e note, tutto insieme: sul pannello appeso in cucina, sul tablet e sul telefono di ognuno.

Familywall si installa come add-on di Home Assistant e si usa dal browser. Si collega ai calendari che la famiglia usa già (iCloud, Google, Nextcloud e altri server CalDAV, Cookidoo) e porta i propri dati anche sui telefoni: le liste nei Promemoria dell'iPhone, menu, turni e compleanni nell'app Calendario.

- [Cosa fa](#cosa-fa)
- [Installazione](#installazione)
- [Primi passi](#primi-passi)
- [Sul telefono](#sul-telefono)
- [Il pannello a muro](#il-pannello-a-muro)
- [Home Assistant](#home-assistant)
- [Dati, privacy e backup](#dati-privacy-e-backup)
- [Sviluppo](#sviluppo)

## Cosa fa

### Una dashboard per la giornata

La pagina iniziale è pensata per essere letta da lontano. In un colpo d'occhio:

- **ora, data e meteo**, su uno sfondo animato che segue il tempo del giorno, con la previsione di domani;
- **l'agenda di oggi**, con il prossimo impegno in evidenza, i piatti in tavola e quello che aspetta domani; a giornata finita domani passa in primo piano. Se durante un impegno è prevista pioggia, compare **"☔ Porta l'ombrello"**;
- **i prossimi giorni**, con i primi impegni di ognuno;
- **chi fa cosa in casa**: lavoro dei genitori, faccende dei bambini, chi viene a casa, e **chi è a casa** in questo momento (dalle persone di Home Assistant);
- **le liste scelte**, con un campo per aggiungere subito una voce;
- **le note** fissate in bacheca e i **compleanni** in arrivo;
- **le routine** del mattino e della sera dei bambini, quando è il momento;
- **i pulsanti** per creare un evento, un piatto o una nota, e quelli di Home Assistant (cancello, portone, luci).

Su pannelli e tablet la dashboard sta sempre in uno schermo: le schede lunghe scorrono al loro interno. Toccando l'orologio parte lo screensaver con l'ora e il prossimo impegno: una scena animata della stagione, oppure le foto di famiglia (cartella media di Home Assistant o album condiviso di iCloud) o paesaggi della stagione da Unsplash.

### Calendario di famiglia

Tutti i calendari insieme, in vista 7 giorni, 14 giorni o mese. Gli eventi si creano e si modificano dall'app e vengono scritti subito su iCloud, Google o sul server CalDAV da cui arrivano, con ripetizioni (giornaliere, settimanali, mensili, annuali) e la scelta tra "solo questo" e "tutta la serie".

Ogni membro ha un colore: Familywall riconosce i nomi nei titoli ("Karate Luca" prende il colore di Luca) oppure li assegni tu. Un evento può essere **condiviso**, **privato** (gli altri vedono solo "Occupato") o **nascosto sul pannello**.

### Menu e spesa

Il menu raccoglie i piatti di casa, il piano settimanale di **Cookidoo** (Bimby) e i calendari che usi come menu, in vista settimana, 14 giorni o mese. Ogni piatto ha pasto, ingredienti e nota.

Le **ricette** di casa (piatto, ingredienti, pasto abituale) si riusano con un tocco, e **💡 Suggerisci** riempie i pasti vuoti con i piatti che cucinate più spesso e le ricette, senza ripetere lo stesso piatto nella settimana.

Con **Ingredienti → spesa** Familywall raccoglie gli ingredienti della settimana, di un giorno o di un piatto, unisce i doppioni e li aggiunge alla lista che scegli, saltando quello che c'è già.

### Liste

La lista della spesa e tutte le altre, da più fonti nella stessa pagina:

- le **liste della famiglia**, che compaiono anche nei Promemoria dell'iPhone (con Siri) e su Android;
- **Google Tasks** e **Promemoria iCloud** (con l'Apple ID);
- le liste **to-do di Home Assistant** (Lista della spesa, Todoist, Bring! e altre).

Le liste della spesa si ordinano **per reparto**, nell'ordine di un giro al supermercato, e **Comprati spesso** propone in un tocco quello che compri di solito.

### Turni, faccende e routine

- **Turni**: smart working e ufficio dei genitori, faccende dei bambini, presenze in casa (pulizie, babysitter, nonni). Ricorrenti ogni settimana, solo nelle settimane pari o dispari (per alternare due figli), oppure una volta sola. Vista settimana, 14 giorni o mese.
- **Faccende e stelline**: il bambino spunta la faccenda fatta e guadagna una ⭐; la dashboard conta le stelline della settimana.
- **Routine**: la sequenza del mattino o della sera (vestirsi, denti, zaino...) con tessere grandi da toccare e il conto alla rovescia fino all'ora di uscire.

### Scuola

Con l'account **ClasseViva** (Spaggiari) del genitore o dello studente arrivano compiti e verifiche, un registro per ogni figlio, ognuno con il colore del figlio a cui lo colleghi in Admin. Non si mescolano con gli impegni: il pulsante **🎒 Scuola** in alto mostra in dashboard, al posto di turni e liste, i compiti dei prossimi sette giorni; nel calendario un'icona 🎒 sul giorno apre compiti e verifiche di quel giorno.

### Note, compleanni e ricorrenze

Una bacheca di note colorate (codice del wifi, numeri utili, promemoria), da fissare in alto o mostrare in dashboard. Compleanni e anniversari compaiono con gli anni compiuti ("🎂 Luca (9)") nel calendario, nell'agenda e in dashboard.

Menu e compleanni possono stare sul server di Familywall oppure su un calendario di iCloud o Google: Familywall usa in automatico quello che hai segnato come "Menu" o "Compleanni", e sposta i dati da un posto all'altro quando cambi idea.

### Su misura per ognuno

- **Ruoli**: Admin, Genitore, Figlio e Pannello, ognuno con i suoi permessi. Un figlio piccolo può anche essere solo un nome e un colore, senza accesso.
- **Profilo**: ognuno cambia la propria password, collega il telefono e attiva la verifica in due passaggi.
- **Tema** chiaro o scuro e **testo** più grande, per dispositivo.
- **Funziona offline**: senza rete i dispositivi mostrano gli ultimi dati letti.

## Installazione

### Come add-on di Home Assistant

1. In Home Assistant apri **Impostazioni → Componenti aggiuntivi → Store dei componenti aggiuntivi**.
2. Dal menu ⋮ scegli **Repository** e aggiungi `https://github.com/ichigo86x/familywall`.
3. Cerca **Familywall**, installalo e avvialo.
4. Aprilo dalla barra laterale e crea la famiglia e l'account Admin.

L'add-on funziona su sistemi `amd64` e `aarch64` (per esempio Raspberry Pi 4 e 5). Include già tutto quello che serve: il server CalDAV per i telefoni e la libreria per i Promemoria iCloud. La documentazione dell'add-on è nella sua scheda **Documentazione** (lo stesso testo di [familywall/DOCS.md](familywall/DOCS.md)).

### Accesso da fuori casa

Familywall ha un proprio login, quindi si può pubblicare senza esporre Home Assistant: l'add-on apre la porta `3001` per un reverse proxy con HTTPS (nginx, Nginx Proxy Manager, Caddy...). Serve per usarlo dal telefono fuori casa, per installarlo come app sull'iPhone e per collegare i Promemoria e il Calendario dei telefoni.

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

Usa sempre HTTPS. Se non pubblichi Familywall, svuota la porta nella scheda **Rete** dell'add-on.

## Primi passi

1. **Membri**: in Admin → Famiglia aggiungi genitori, figli e un account **Pannello** per ogni schermo a muro. Dai a ognuno un colore e gli "altri nomi" con cui compare nei titoli degli eventi.
2. **Calendari e liste**: in Admin → Calendari e liste → **Collega account**. Per ogni tipo di account (Calendari iCloud, Promemoria iCloud, Google, CalDAV, Cookidoo, ClasseViva) la finestra spiega cosa si può usare e come ottenere la password per app o le credenziali. Poi scegli i calendari e le liste da mostrare.
3. **Dashboard**: in Admin → Dashboard e pannelli scegli la città del meteo, le liste da mostrare e le foto dello screensaver.
4. **Telefoni**: ognuno, dal proprio Profilo, collega il telefono (vedi sotto).

## Sul telefono

Familywall include un server CalDAV: con il proprio utente e la propria password ogni membro vede sul telefono le liste della famiglia nei **Promemoria** e i calendari **Menu**, **Compleanni**, **Turni** e **Routine** nell'app **Calendario**. Quello che si cambia sul telefono compare in Familywall, e viceversa.

- **iPhone e iPad**: apri Familywall in Safari dall'indirizzo esterno, tocca il tuo cerchio in alto (**Profilo**) → **Telefono e tablet** → **Prepara il profilo** e installalo dalle Impostazioni.
- **Android**: con [DAVx⁵](https://www.davx5.com/) usa l'indirizzo, l'utente e la password indicati nel Profilo; per le liste e le note serve anche un'app come jtx Board o Tasks.org.
- **Come app**: in Safari scegli **Condividi → Aggiungi alla schermata Home**.

Dal telefono valgono gli stessi permessi dell'app: per esempio i figli spuntano le liste ma vedono menu e turni in sola lettura.

## Il pannello a muro

Familywall è pensato per un tablet o un **Echo Show 15** con [Fully Kiosk Browser](https://www.fully-kiosk.com/):

1. crea un membro **Pannello** (con "Modalità scrittura" se dal pannello si devono anche aggiungere eventi, voci e note);
2. in Fully imposta come pagina iniziale l'indirizzo di Familywall, a schermo intero e sempre acceso;
3. accedi con l'account Pannello.

Il pannello torna da solo allo screensaver dopo qualche minuto senza tocchi e di notte mostra solo un orologio tenue (con Fully abbassa anche la luminosità). Con più pannelli, ognuno può avere le sue liste, i suoi pulsanti e i suoi orari: per esempio la spesa in cucina e il cancello all'ingresso.

Per fissare la dimensione del testo aggiungi `?scale=130` all'indirizzo (valori `auto`, `100`, `115`, `130`, `150`).

## Home Assistant

Dentro l'add-on Familywall parla con Home Assistant da solo, senza token:

- **Pulsanti** in dashboard per serrature, cancelli, tapparelle, luci, script e scene, con conferma per porte e cancelli e la scelta di chi può usarli;
- **Liste to-do** di Home Assistant nella pagina Liste;
- **Calendari** di Home Assistant (raccolta rifiuti, scuola, festività...) in sola lettura;
- **Chi è a casa**: collega ogni membro alla sua persona (`person.*`, di solito con l'app Companion) e la dashboard mostra chi è a casa, chi è fuori e in quale zona.

Le azioni ammesse sono solo quelle sicure per ogni tipo di entità (per esempio una serratura si apre o si chiude, uno script si esegue).

## Dati, privacy e backup

- I **dati della famiglia** (liste, menu, compleanni, turni, routine, note) stanno sul server CalDAV integrato, o sui calendari esterni che scegli; il database tiene solo configurazione, utenti e collegamenti.
- Le **password** degli account collegati sono cifrate; la verifica in due passaggi è disponibile per tutti; un **registro attività** mostra chi ha fatto cosa (senza mai salvare password o testi).
- Gli **accessi** falliti sono limitati per indirizzo e per utente.
- **Backup**: dall'Admin si scarica un file con tutto (con la chiave delle credenziali, se serve per spostarlo su un'altra installazione) e si ripristina senza riavviare. Ogni giorno Familywall salva da solo una copia e tiene le ultime 7; anche il backup di Home Assistant le include.
- **Copia remota cifrata**: ogni giorno una copia completa va in una cartella WebDAV fuori casa (Nextcloud, Synology, QNAP...), cifrata con una frase segreta che conosci solo tu.

Cose da sapere:

- Cookidoo, ClasseViva, i Promemoria iCloud e gli album condivisi di iCloud usano API non ufficiali: possono smettere di funzionare se Vorwerk, Spaggiari o Apple le cambiano. I Promemoria iCloud non sono leggibili con la Protezione avanzata dei dati attiva.
- Le note non compaiono nell'app Note dell'iPhone né in Google Keep, che non hanno API adatte.

## Sviluppo

Familywall è un monorepo TypeScript: API NestJS con SQLite, web app React con Fluent UI, tipi e regole condivisi. Per avviarlo in locale, provare l'add-on sul proprio Home Assistant e pubblicare una nuova versione vedi [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
npm install
npm run python:setup   # una volta: Radicale e pyicloud per lo sviluppo
npm run dev:api        # API su http://localhost:3001
npm run dev:web        # web su http://localhost:5173
```

## Licenza

Familywall è distribuito con licenza [MIT](LICENSE).
