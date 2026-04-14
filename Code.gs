// ============================================================
// Code.gs — Backend Google Apps Script API
// Gestione Conto Lavoro Laccatura
// ============================================================

// === CONFIGURAZIONE ===
var SPREADSHEET_ID = '13a2pJwJzPGgDQsXe2jTJhic2yHUlonmROD3aSkYq04k';
var SHEET_NAME = 'Laccatura';

// === COLONNE (A=1, B=2, ...) ===
// A: ODV
// B: CL
// C: Data inserimento
// D: Data di spedizione al cliente
// E: Data prelievo effettivo
// F: Data emissione bolla (compilata manualmente sul foglio)
// G: Data consegna prevista (calcolata: prelievo + 10 gg lavorativi)
// H: Data consegna effettiva
// I: Stato (APERTO / CHIUSO)

// ============================================================
// API WEB
// ============================================================

/**
 * Endpoint GET di test
 */
function doGet(e) {
  return jsonOutput({
    success: true,
    service: 'Conto Lavoro Laccatura API',
    timestamp: new Date().toISOString()
  });
}

/**
 * Endpoint POST principale
 */
function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    var action = body.action;
    var result;

    switch (action) {
      case 'registraODV':
        result = registraODV(
          body.codiceODV,
          body.codiceCL,
          body.dataConsegnaPrevista
        );
        break;

      case 'registraPrelievo':
        result = registraPrelievo(body.codiceODV);
        break;

      case 'registraRicezione':
        result = registraRicezione(body.codiceODV);
        break;

      case 'getStats':
        result = {
          success: true,
          data: getStats()
        };
        break;

      case 'getUltimeRegistrazioni':
        result = {
          success: true,
          data: getUltimeRegistrazioni(body.n || 15)
        };
        break;

      default:
        result = {
          success: false,
          type: 'invalid_action',
          message: 'Azione non valida o mancante'
        };
    }

    return jsonOutput(result);

  } catch (err) {
    return jsonOutput({
      success: false,
      type: 'error',
      message: 'Errore backend: ' + err.message
    });
  }
}

/**
 * Restituisce JSON
 */
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Parsing body richiesta POST
 */
function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  var raw = e.postData.contents;
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

// ============================================================
// LOGICA BUSINESS
// ============================================================

/**
 * FASE 1 — Registrazione
 * Salva associazione ODV-CL + data spedizione al cliente
 *
 * @param {string} codiceODV
 * @param {string} codiceCL
 * @param {string} dataConsegnaPrevista - formato YYYY-MM-DD
 * @return {Object}
 */
function registraODV(codiceODV, codiceCL, dataConsegnaPrevista) {
  try {
    codiceODV = cleanString_(codiceODV);
    codiceCL = cleanString_(codiceCL);
    dataConsegnaPrevista = cleanString_(dataConsegnaPrevista);

    if (!codiceODV || !codiceCL || !dataConsegnaPrevista) {
      return {
        success: false,
        type: 'validation',
        message: 'Codice ODV, codice CL e data consegna prevista sono obbligatori'
      };
    }

    var sheet = getSheet();

    var esistente = cercaRigaODV(codiceODV);
    if (esistente > 0) {
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" già registrato alla riga ' + esistente,
        type: 'duplicate'
      };
    }

    var now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd/MM/yyyy HH:mm'
    );

    var dataConsegnaFormattata = formatDateForDisplay(dataConsegnaPrevista);
    var nextRow = sheet.getLastRow() + 1;

    var values = [[
      codiceODV,                // A
      codiceCL,                 // B
      now,                      // C
      dataConsegnaFormattata,   // D
      '',                       // E — Data prelievo effettivo
      '',                       // F — Data emissione bolla (compilata manualmente)
      '',                       // G — Data consegna prevista (calcolata al prelievo)
      '',                       // H — Data consegna effettiva
      'APERTO'                  // I — Stato
    ]];

    sheet.getRange(nextRow, 1, 1, 9).setValues(values);

    return {
      success: true,
      message: 'Registrazione completata',
      data: {
        odv: codiceODV,
        cl: codiceCL,
        dataConsegna: dataConsegnaFormattata
      }
    };

  } catch (e) {
    return {
      success: false,
      message: 'Errore: ' + e.message,
      type: 'error'
    };
  }
}

/**
 * FASE 2 — Prelievo
 * Registra la data di prelievo effettivo e calcola la data di consegna prevista
 * (prelievo + 10 giorni lavorativi) in colonna G
 *
 * @param {string} codiceODV
 * @return {Object}
 */
function registraPrelievo(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);

    if (!codiceODV) {
      return {
        success: false,
        type: 'validation',
        message: 'Codice ODV obbligatorio'
      };
    }

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);

    if (riga === 0) {
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" non trovato. Eseguire prima la registrazione (Fase 1).',
        type: 'not_found'
      };
    }

    var dataPrelievoEsistente = sheet.getRange(riga, 5).getValue();
    if (dataPrelievoEsistente) {
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" già prelevato in data ' + formatCellValue_(dataPrelievoEsistente),
        type: 'already_done'
      };
    }

    var now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd/MM/yyyy HH:mm'
    );

    sheet.getRange(riga, 5).setValue(now); // E: Data prelievo effettivo

    // F (colonna 6) = Data emissione bolla — gestita manualmente dall'utente, non si modifica

    var dataConsegnaPrevista = addWorkingDays_(new Date(), 10);
    var dataConsegnaPrevistaFormatted = Utilities.formatDate(
      dataConsegnaPrevista,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy'
    );
    sheet.getRange(riga, 7).setValue(dataConsegnaPrevistaFormatted); // G: Data consegna prevista

    var codiceCL = sheet.getRange(riga, 2).getValue();

    return {
      success: true,
      message: 'Prelievo registrato',
      data: {
        odv: codiceODV,
        cl: cleanString_(codiceCL),
        dataPrelievo: now,
        dataConsegnaPrevista: dataConsegnaPrevistaFormatted
      }
    };

  } catch (e) {
    return {
      success: false,
      message: 'Errore: ' + e.message,
      type: 'error'
    };
  }
}

/**
 * FASE 3 — Ricezione
 * Registra data consegna effettiva e chiude lo stato
 *
 * @param {string} codiceODV
 * @return {Object}
 */
function registraRicezione(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);

    if (!codiceODV) {
      return {
        success: false,
        type: 'validation',
        message: 'Codice ODV obbligatorio'
      };
    }

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);

    if (riga === 0) {
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" non trovato nel sistema.',
        type: 'not_found'
      };
    }

    var dataPrelievoEsistente = sheet.getRange(riga, 5).getValue();
    if (!dataPrelievoEsistente) {
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" non risulta prelevato. Eseguire prima il prelievo (Fase 2).',
        type: 'not_ready'
      };
    }

    var statoAttuale = cleanString_(sheet.getRange(riga, 9).getValue()); // I: Stato
    if (statoAttuale === 'CHIUSO') {
      var dataConsegnaEsistente = sheet.getRange(riga, 8).getValue(); // H: Data consegna effettiva
      return {
        success: false,
        message: 'ODV "' + codiceODV + '" già chiuso in data ' + formatCellValue_(dataConsegnaEsistente),
        type: 'already_done'
      };
    }

    var now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd/MM/yyyy HH:mm'
    );

    sheet.getRange(riga, 8).setValue(now);      // H: Data consegna effettiva
    sheet.getRange(riga, 9).setValue('CHIUSO'); // I: Stato

    var codiceCL = sheet.getRange(riga, 2).getValue();

    return {
      success: true,
      message: 'Ricezione registrata — ODV chiuso',
      data: {
        odv: codiceODV,
        cl: cleanString_(codiceCL),
        dataRicezione: now
      }
    };

  } catch (e) {
    return {
      success: false,
      message: 'Errore: ' + e.message,
      type: 'error'
    };
  }
}

/**
 * Statistiche dashboard
 * @return {Object}
 */
function getStats() {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { aperti: 0, prelevati: 0, chiusi: 0, totale: 0 };
    }

    var dati = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var counts = { aperti: 0, prelevati: 0, chiusi: 0, totale: dati.length };

    for (var i = 0; i < dati.length; i++) {
      var stato = cleanString_(dati[i][8]); // I (indice 8)
      var prelievo = dati[i][4];            // E (indice 4)

      if (stato === 'CHIUSO') {
        counts.chiusi++;
      } else if (prelievo) {
        counts.prelevati++;
      } else {
        counts.aperti++;
      }
    }

    return counts;

  } catch (e) {
    return { aperti: 0, prelevati: 0, chiusi: 0, totale: 0 };
  }
}

/**
 * Ultime N registrazioni
 * @param {number} n
 * @return {Array}
 */
function getUltimeRegistrazioni(n) {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow <= 1) return [];

    n = Number(n) || 15;
    var startRow = Math.max(2, lastRow - n + 1);
    var numRows = lastRow - startRow + 1;

    var data = sheet.getRange(startRow, 1, numRows, 9).getValues();
    var result = [];

    for (var i = data.length - 1; i >= 0; i--) {
      var stato = cleanString_(data[i][8]); // I (indice 8)
      var prelievo = data[i][4];            // E (indice 4)

      var statoDisplay;
      if (stato === 'CHIUSO') {
        statoDisplay = 'CHIUSO';
      } else if (prelievo) {
        statoDisplay = 'PRELEVATO';
      } else {
        statoDisplay = 'APERTO';
      }

      result.push({
        odv:                   cleanString_(data[i][0]),
        cl:                    cleanString_(data[i][1]),
        dataInserimento:       formatCellValue_(data[i][2]),
        dataSpedizioneCliente: formatCellValue_(data[i][3]),  // D (indice 3)
        dataPrelievo:          formatCellValue_(data[i][4]),  // E (indice 4)
        dataEmissioneBolla:    formatCellValue_(data[i][5]),  // F (indice 5)
        dataConsegnaPrevista:  formatCellValue_(data[i][6]),  // G (indice 6)
        dataConsegnaEffettiva: formatCellValue_(data[i][7]),  // H (indice 7)
        stato:                 statoDisplay
      });
    }

    return result;

  } catch (e) {
    return [];
  }
}

// ============================================================
// HELPER
// ============================================================

function getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Foglio "' + SHEET_NAME + '" non trovato. Verificare il nome del tab.');
  }

  return sheet;
}

function cercaRigaODV(codiceODV) {
  codiceODV = cleanString_(codiceODV);

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return 0;

  var codici = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < codici.length; i++) {
    if (cleanString_(codici[i][0]) === codiceODV) {
      return i + 2;
    }
  }

  return 0;
}

/**
 * Aggiunge N giorni lavorativi (lun-ven) a una data
 */
function addWorkingDays_(baseDate, numDays) {
  var date = new Date(baseDate.getTime());
  var added = 0;
  while (added < numDays) {
    date.setDate(date.getDate() + 1);
    var day = date.getDay(); // 0=domenica, 6=sabato
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';

  var parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  return String(dateStr);
}

function cleanString_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatCellValue_(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy HH:mm'
    );
  }

  return String(value);
}
