# Test report rapido scanner ZXing

Data: 2026-04-09

## Obiettivo
Verificare rapidamente che la build corrente includa il caricamento primario e fallback della libreria ZXing e che la pagina esponda la logica di fallback in `startScan`.

## Comandi eseguiti

1. `curl -I -sS https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js | head -n 1`
2. `curl -I -sS https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js | head -n 1`
3. `python3 -m http.server 4173` + `curl -sS http://127.0.0.1:4173/index.html | rg "@zxing/library@0.21.3/umd/index.min.js|ZXING_FALLBACK_URL|ensureZXingLoaded" -n`

## Esito

- I test HTTP verso CDN esterne risultano **non conclusivi** in questo ambiente (403 su CONNECT tunnel).
- Il test locale su `index.html` conferma che sono presenti:
  - script primario `@zxing/library`;
  - costante `ZXING_FALLBACK_URL`;
  - funzione `ensureZXingLoaded()`;
  - invocazione fallback dentro `startScan`.

## Conclusione

La verifica statica locale del codice è positiva.
La verifica di reachability runtime delle CDN è limitata dall'ambiente corrente.

## Stato deploy

In questo repository non sono presenti file/pipeline di deploy (es. workflow CI/CD, config hosting, script release), quindi da qui **non è possibile confermare** se la versione sia già pubblicata in produzione.
