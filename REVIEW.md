# Revisione tecnica del progetto "Conto Lavoro Laccatura"

Data revisione: 2026-04-09

## Scope

Revisione statica del codice presente in `index.html` (UI, logica scanner, integrazione API).

## Comprensione funzionale dell'app

L'app è pensata per tracciare il ciclo di **conto lavoro laccatura** tramite barcode in 3 fasi operative:

1. **Registrazione**
   - L'operatore scansiona prima **ODV**, poi **CL**, quindi inserisce la **data consegna prevista** e conferma.
2. **Prelievo**
   - L'operatore scansiona un ODV in uscita e conferma il passaggio allo stato prelevato.
3. **Ricezione**
   - L'operatore scansiona un ODV in rientro e conferma la chiusura del ciclo.

In tutte le fasi è disponibile un fallback di **inserimento manuale** oltre alla scansione da fotocamera.

La UI include anche una sezione **Monitor** che mostra:
- contatori sintetici (aperti, prelevati, chiusi);
- ultime attività registrate.

Dal punto di vista tecnico, il frontend:
- usa ZXing in browser per leggere barcode Code 128;
- invia chiamate `POST` a un endpoint Google Apps Script con azioni diverse (`registraODV`, `registraPrelievo`, `registraRicezione`, `getStats`, `getUltimeRegistrazioni`);
- aggiorna lo stato locale per log di sessione e feedback utente (toast, pulsanti, step).

## Dov'è il backend

Nel repository **non c'è un backend applicativo** (nessun server Node/Python/PHP, nessun controller/API locale).

Il backend reale è esterno e coincide con un **Google Apps Script Web App** richiamato dal frontend tramite la costante `API_URL`:
- endpoint: `https://script.google.com/macros/s/.../exec`
- protocollo: `POST` con payload JSON (`action` + dati operativi).

Quindi oggi l'architettura è:
1. `index.html` (frontend statico) nel repo;
2. Google Apps Script remoto (backend + logica dati) fuori repo.

## La funzione di scansione barcode funziona?

**Sì, a livello di codice la funzione è implementata correttamente**, con alcune condizioni operative:

- richiede **contesto sicuro HTTPS** (`window.isSecureContext`);
- richiede supporto `navigator.mediaDevices.getUserMedia`;
- richiede caricamento libreria `ZXing`;
- è configurata per leggere solo **CODE_128**.

Il flusso previsto è:
1. `startScan(phase)` avvia fotocamera e decoder ZXing;
2. `decodeFromVideoDevice` intercetta i risultati;
3. `onBarcodeDetected` valida e instrada il codice alla fase corrente (`registrazione`, `prelievo`, `ricezione`);
4. al successo aggiorna campi UI, abilita i pulsanti e mostra feedback toast.

Quindi: **la scansione è funzionante in condizioni browser/device compatibili**, ma non è garantita in ambienti non HTTPS, senza permessi camera o con camera occupata.

## Punti positivi

- Interfaccia mobile-first ordinata e coerente.
- Flusso operativo chiaro su tre fasi (registrazione, prelievo, ricezione).
- Presenza di escaping HTML prima dell'inserimento nel DOM (`escapeHtml`), utile contro XSS riflessi da payload API.
- Gestione basilare degli errori fotocamera con messaggi comprensibili.

## Rischi e criticità (priorità)

### 1) Mancata verifica di `response.ok` nelle chiamate API (Priorità: Alta)
**Impatto**: errori HTTP (4xx/5xx) non sono gestiti esplicitamente; il codice tenta sempre il parsing del body, rendendo il troubleshooting difficile e degradando UX/affidabilità.

**Evidenza**: in `apiCall`, dopo `fetch` viene sempre fatto `response.text()` e parse JSON, senza controllo dello status code.

**Suggerimento**: prima del parsing, validare `response.ok`; in caso negativo lanciare errore strutturato con status + estratto body.

---

### 2) Endpoint API hardcoded in chiaro nel frontend (Priorità: Alta)
**Impatto**: endpoint facilmente enumerabile e invocabile da chiunque visiti la pagina; rischio abuso, scraping, invii massivi non autorizzati e dipendenza forte da URL singolo.

**Evidenza**: costante `API_URL` dichiarata direttamente nel file client.

**Suggerimento**: introdurre almeno un livello di mediazione (backend/proxy con policy), rate limiting e tokenizzazione/controllo origine lato server.

---

### 3) Dipendenza esterna caricata da CDN senza pinning integrità (Priorità: Media)
**Impatto**: rischio supply-chain se il pacchetto remoto viene alterato o servito in modo inatteso.

**Evidenza**: script ZXing caricato da `unpkg` senza attributi `integrity`/`crossorigin`.

**Suggerimento**: bloccare versione + usare SRI, oppure vendorizzare asset nel repository.

---

### 4) Progetto monolitico single-file (manutenibilità) (Priorità: Media)
**Impatto**: HTML/CSS/JS nello stesso file aumenta costo di manutenzione, review e testing automatico.

**Evidenza**: oltre 1100 righe in un unico `index.html`.

**Suggerimento**: separare in almeno `styles.css`, `app.js` e moduli per scanner/API/UI state.

---

### 5) Validazione barcode potenzialmente fragile (Priorità: Media)
**Impatto**: possibile accettazione di codici formalmente non validi o scarto di codici reali fuori euristica.

**Evidenza**: filtro attuale scarta solo stringhe numeriche corte (<12), ma non applica pattern robusti per ODV/CL.

**Suggerimento**: definire regex/contratti espliciti (lunghezza, prefissi, charset), con messaggi di errore dedicati.

## Raccomandazioni operative

1. **Hardening API (prima settimana)**
   - Gestione esplicita status HTTP.
   - Rate limit e validazioni server-side.
   - Monitoraggio errori con codici/telemetria.

2. **Sicurezza dipendenze (prima settimana)**
   - Introduzione SRI o bundling locale libreria scanner.

3. **Refactoring incrementale (2–3 settimane)**
   - Split file e introduzione funzioni pure testabili.
   - Riduzione codice duplicato in prelievo/ricezione.

4. **Qualità & test**
   - Aggiungere lint (ESLint) e formatter.
   - Aggiungere test minimi per `escapeHtml`, validatori codici e flussi API error.

## Valutazione sintetica

- **Usabilità**: Buona
- **Robustezza operativa**: Media
- **Sicurezza applicativa**: Medio-bassa (soprattutto lato integrazione API)
- **Manutenibilità**: Media-bassa (single-file)
