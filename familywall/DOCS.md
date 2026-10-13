# Familywall

Calendario, menu, liste, turni, compleanni e note della famiglia, con ruoli, pannello a muro e sincronizzazione con i telefoni.

## Primo avvio

1. Avvia l'add-on e aprilo dalla barra laterale (**Familywall**).
2. La prima schermata chiede il nome della famiglia e crea l'account **Admin**.
3. In **Admin → Famiglia** aggiungi i membri: genitori, figli e un account **Pannello** per ogni schermo a muro.
4. In **Admin → Calendari e liste → Collega account** collega iCloud, Google, un server CalDAV o Cookidoo: la finestra spiega per ogni tipo come ottenere la password per app o le credenziali.
5. In **Admin → Dashboard e pannelli** scegli la città del meteo e le liste da mostrare.

## Rete

- La barra laterale di Home Assistant (ingress) funziona subito.
- La porta **3001** serve per pubblicare Familywall con un reverse proxy HTTPS (nginx, Nginx Proxy Manager...): così lo usi dal telefono fuori casa, lo aggiungi alla schermata Home dell'iPhone e colleghi Promemoria e Calendario dei telefoni. Inoltra al proxy anche i percorsi `/dav` e `/.well-known/caldav`.
- Se non la usi, svuota la porta nella scheda **Rete**.

Familywall ha un proprio login: non serve esporre Home Assistant. Usa sempre HTTPS.

## Telefoni

Ogni membro, dal proprio **Profilo** (il cerchio in alto a destra), trova:

- il profilo da installare su iPhone e iPad (da Safari, all'indirizzo HTTPS esterno);
- i dati per l'account CalDAV manuale e per DAVx⁵ su Android.

Sul telefono compaiono le liste della famiglia nei Promemoria e i calendari Menu, Compleanni, Turni e Routine.

## Home Assistant

Dentro l'add-on Familywall usa Home Assistant senza token: in **Admin → Home Assistant** aggiungi i pulsanti della dashboard (cancello, portone, luci, scene), le liste to-do e i calendari di Home Assistant.

## Foto dello screensaver

In **Admin → Dashboard e pannelli → Foto** scegli la fonte. Per la cartella media, copia le foto in `/media` di Home Assistant (l'add-on la legge in sola lettura) e indica la sottocartella.

## Dati e backup

Tutti i dati stanno nella cartella dell'add-on e sono inclusi nel backup di Home Assistant. In più:

- **Admin → Backup e sicurezza → Scarica backup** salva un file con tutto; con "Includi la chiave delle credenziali" si può ripristinare su un'altra installazione senza ricollegare gli account (conserva quel file in un posto sicuro);
- ogni giorno Familywall salva una copia e tiene le ultime 7;
- **Copia remota cifrata**: una copia al giorno su una cartella WebDAV (Nextcloud, Synology...), cifrata con una frase segreta; per ripristinarla servono il file e la frase.

Menu e compleanni salvati su calendari di iCloud o Google restano su quei calendari e non entrano nel backup.

## Problemi

- **Promemoria iCloud chiede il codice**: Apple ha chiuso la sessione. In Admin → Calendari e liste tocca **Riconnetti**, poi **Inserisci codice**.
- **Account Google scollegato dopo una settimana**: la schermata di consenso del progetto Google Cloud è in modalità "Test". Mettila "In produzione" e ricollega l'account.
- **Password Admin dimenticata**: un altro Admin può impostarne una nuova in Admin → Famiglia. Se sei l'unico Admin, ripristina un backup.

Altre informazioni: [github.com/ichigo86x/familywall](https://github.com/ichigo86x/familywall).
