# Novità

## 0.9.7

- Dashboard più semplice e leggera:
  - **Oggi**: un solo elenco con il prossimo impegno evidenziato e i piatti come etichette; a giornata finita compare domani.
  - **In arrivo**: parte da domani, i giorni liberi di fila stanno su una riga ("Liberi fino a martedì").
  - **Oggi in casa**: una griglia di persone, ognuna con lavoro, faccende (si spuntano toccandole) e il pallino di chi è a casa; sotto, chi viene a casa e le stelline.
  - Un solo pulsante **+** con il menu (evento, turno, piatto, nota, voce in lista), accanto alle ricorrenze.
  - Le liste hanno una spunta per ogni voce (comprato o fatto), il reparto accanto alle voci della spesa, il pallino colorato vicino al titolo e la casella per aggiungere in fondo. Una voce spuntata per sbaglio si toglie finché la pagina non si aggiorna.
  - Senza meteo, "Imposta la città" sta piccolo in un angolo dell'orologio.
- Turni: una faccenda fatta è una scheda colorata con una piccola ✓, non più barrata con la stella.
- Barra in alto: menu a pillole; Schermo ed Esci sono solo icone e il contatore è stato tolto.
- Tema scuro: più contrasto per le schede evidenziate e le note.

## 0.9.6

- ClasseViva: per i registri che il portale web non apre, i compiti arrivano anche dall'API dell'app (sezione Compiti), non solo dall'agenda.

## 0.9.5

- ClasseViva: i compiti mostrano il testo (campo homeworkDesc del portale) e ✅ quando sono segnati come fatti; se il portale non accetta il codice di un figlio, prova con l'utente dell'account, solo se apre lo stesso studente.

## 0.9.4

- ClasseViva: lettura dei compiti più tollerante sul formato delle risposte; nel log dell'add-on un riepilogo di cosa risponde ClasseViva (solo nomi dei campi e conteggi).
- Dashboard: le stelline della settimana sono solo un pulsante che apre il dettaglio.
- Immagine aarch64 costruita su un runner ARM nativo, senza emulazione.

## 0.9.3

- ClasseViva: compiti dalla sezione "Compiti", verifiche dall'agenda e materiale condiviso in "Didattica", con l'API del portale web (la vecchia API dell'app resta come riserva); gli errori compaiono nel pannello Scuola.
- Il registro viene letto solo quando serve, al massimo ogni mezz'ora e per un periodo breve (due settimane indietro, sei avanti); i dati restano in cache anche senza rete.

## 0.9.2

- Scuola separata dagli impegni: pulsante 🎒 Scuola in alto che mostra in dashboard compiti e verifiche della settimana, icona 🎒 sui giorni del calendario.
- Ogni registro ClasseViva si collega a un figlio e ne prende il colore.
- L'agenda di ClasseViva viene letta un mese alla volta; gli errori di ClasseViva compaiono nel pannello Scuola.
- Dettaglio delle stelline della settimana: faccende fatte e mancate per giorno.
- Le schede Scuola e Turni non vengono più schiacciate dalle liste in dashboard.

## 0.9.0

- Scuola: compiti e verifiche da ClasseViva (Spaggiari) nel calendario e in una scheda della dashboard, un calendario per ogni figlio.
- Ricette di casa e menu suggerito per i pasti vuoti.
- Foto nello screensaver: cartella media di Home Assistant, album condiviso di iCloud o paesaggi della stagione da Unsplash.
- Chi è a casa, dalle persone di Home Assistant.
- "Porta l'ombrello" nell'agenda quando è prevista pioggia durante un impegno.
- Copia remota giornaliera del backup, cifrata, su una cartella WebDAV (Nextcloud, Synology, QNAP...).

## 0.8.1

- Ripristino di un backup con la verifica in due passaggi attiva: il segreto viene ricifrato con la chiave della nuova installazione se il backup la contiene; altrimenti la verifica in due passaggi viene disattivata per quei membri (da riattivare dal Profilo) invece di bloccare l'accesso.

## 0.8.0

- Menu e compleanni anche su un calendario di iCloud, Google o di un server CalDAV, scelto in automatico o in Admin, con lo spostamento dei dati da una posizione all'altra.
- Menu e Turni in vista settimana, 14 giorni (predefinita) o mese.
- Installazione dal repository online, con immagini già pronte per `amd64` e `aarch64`.

## 0.7.0

- La dashboard sta sempre in uno schermo su pannelli e tablet; le liste lunghe scorrono nella loro scheda.
- Liste di Google, iCloud e Home Assistant tenute in memoria e aggiornate in background: cambiare pagina è immediato.
- Admin diviso in sezioni, scheda "Liste in dashboard", nuova pagina Profilo (password, telefono, verifica in due passaggi).
- Finestra "Collega account" con cosa offre ogni tipo di account e come ottenere le credenziali.
- La build dell'add-on locale elimina i file rimasti da versioni precedenti.

## 0.6.0

- Promemoria iCloud con l'Apple ID (pyicloud) e codice di verifica.
- Calendari di Home Assistant in sola lettura; funzioni di Home Assistant mostrate solo quando è raggiungibile.
- Pagina d'errore al posto della schermata vuota.

## 0.5.0

- Verifica in due passaggi e registro attività.
- Impostazioni per ogni pannello a muro (liste, pulsanti, notte, screensaver).
- Liste della spesa per reparto e "Comprati spesso".
- Routine del mattino e della sera per i bambini.
- Faccende spuntate dal pannello e stelline della settimana.
- Liste to-do di Home Assistant.
- Permessi dei ruoli applicati anche ai telefoni collegati con CalDAV.

## 0.4.0 e precedenti

- Menu, compleanni, turni e note sul server CalDAV integrato, visibili sui telefoni.
- Menu della settimana con ingredienti verso la lista della spesa; piano Cookidoo.
- Compleanni e ricorrenze; turni di casa; bacheca di note.
- Dashboard con meteo, agenda, prossimi giorni, pulsanti di Home Assistant, screensaver e modalità notte.
- Calendari iCloud, CalDAV e Google con scrittura degli eventi, colori dei membri, privacy.
- Liste nei Promemoria dell'iPhone e Google Tasks.
- Cache dei calendari, uso offline, backup e ripristino.
