# Deploy guida rapida - Conto Lavoro Laccatura

Data: 2026-04-09

## Cosa stai deployando

Questo repository contiene solo frontend statico (`index.html`).
Il backend è esterno (Google Apps Script) e viene chiamato tramite `API_URL` già impostata nel client.

## Prerequisiti importanti

1. Servire il file via **HTTPS** (obbligatorio per la fotocamera/scanner).
2. Usare browser con permesso camera attivo.
3. Verificare che l'endpoint Google Apps Script sia pubblicato e accessibile.

---

## Opzione A (più semplice): Netlify Drop

1. Vai su https://app.netlify.com/drop
2. Trascina dentro il file `index.html` (o tutta la cartella repo).
3. Attendi URL pubblica (es. `https://xxxx.netlify.app`).
4. Apri da smartphone e consenti accesso alla fotocamera.

Pro: rapidissimo, nessuna configurazione.
Contro: meno controllo su versioning se usato solo drag-and-drop.

---

## Opzione B: GitHub Pages (consigliata se usi Git)

1. Pusha il repository su GitHub.
2. Vai in **Settings -> Pages**.
3. In **Build and deployment** scegli:
   - Source: `Deploy from a branch`
   - Branch: `main` (root)
4. Salva e attendi la URL pubblica (`https://<user>.github.io/<repo>/`).

Pro: semplice, gratis, versionato.
Contro: publish non immediato al secondo (qualche minuto).

---

## Opzione C: Hosting statico interno (Nginx/Apache)

1. Copia `index.html` dentro la document root del server.
2. Abilita TLS/HTTPS sul dominio.
3. Verifica da mobile l'accesso camera.

Pro: pieno controllo aziendale.
Contro: richiede gestione infrastruttura.

---

## Check post-deploy (2 minuti)

1. Apri la URL in HTTPS da smartphone.
2. Clicca **Avvia Scansione**.
3. Conferma che non compaia errore libreria scanner.
4. Scansiona un barcode CODE_128 di test.
5. Verifica che il monitor carichi statistiche.

Se qualcosa non va:
- Se compare "Libreria scanner non caricata", verifica blocchi CDN/rete aziendale.
- Se la camera non parte, controlla permessi browser e HTTPS.
- Se i salvataggi falliscono, verifica publish/permessi del Google Apps Script.
