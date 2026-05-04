// ============================================================
// Code.gs — Backend Google Apps Script API
// Gestione Conto Lavoro Laccatura
// ============================================================

// === CONFIGURAZIONE ===
var SPREADSHEET_ID = '13a2pJwJzPGgDQsXe2jTJhic2yHUlonmROD3aSkYq04k';
var SHEET_NAME = 'Database';

// === COLONNE (A=1, B=2, ...) ===
// A: ODV
// B: CL
// C: Data inserimento
// D: Data di spedizione al cliente
// E: Data prelievo effettivo
// F: Data emissione bolla (compilata manualmente sul foglio)
// G: Data consegna prevista (FORMULA sul foglio — mai scritta/cancellata dal codice)
// H: Data consegna effettiva
// I: Stato (APERTO / CHIUSO)

// ============================================================
// API WEB
// ============================================================

function doGet(e) {
  return jsonOutput({
    success: true,
    service: 'Conto Lavoro Laccatura API',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    var action = body.action;
    var result;

    switch (action) {
      case 'registraODV':
        result = registraODV(body.codiceODV, body.codiceCL, body.dataSpedizioneCliente);
        break;
      case 'registraPrelievo':
        result = registraPrelievo(body.codiceODV);
        break;
      case 'registraRicezione':
        result = registraRicezione(body.codiceODV);
        break;
      case 'annullaPrelievo':
        result = annullaPrelievo(body.codiceODV);
        break;
      case 'annullaRicezione':
        result = annullaRicezione(body.codiceODV);
        break;
      case 'getUltimeRegistrazioni':
        result = { success: true, data: getUltimeRegistrazioni(body.n || 15) };
        break;
      default:
        result = { success: false, type: 'invalid_action', message: 'Azione non valida o mancante' };
    }

    return jsonOutput(result);

  } catch (err) {
    return jsonOutput({ success: false, type: 'error', message: 'Errore backend: ' + err.message });
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

// ============================================================
// LOGICA BUSINESS
// ============================================================

function registraODV(codiceODV, codiceCL, dataSpedizioneCliente) {
  try {
    codiceODV = cleanString_(codiceODV);
    codiceCL = cleanString_(codiceCL);
    dataSpedizioneCliente = cleanString_(dataSpedizioneCliente);

    if (!codiceODV || !codiceCL || !dataSpedizioneCliente) {
      return { success: false, type: 'validation', message: 'Codice ODV, codice CL e data di spedizione al cliente sono obbligatori' };
    }

    var sheet = getSheet();
    var esistente = cercaRigaODV(codiceODV);
    if (esistente > 0) {
      return { success: false, message: 'ODV "' + codiceODV + '" già registrato alla riga ' + esistente, type: 'duplicate' };
    }

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var dataSpedizioneFormattata = formatDateForDisplay_(dataSpedizioneCliente);
    var nextRow = sheet.getLastRow() + 1;

    // A — F (saltiamo G: contiene la formula sul foglio)
    sheet.getRange(nextRow, 1, 1, 6).setValues([[
      codiceODV,                 // A — ODV
      codiceCL,                  // B — CL
      now,                       // C — Data inserimento
      dataSpedizioneFormattata,  // D — Data di spedizione al cliente
      '',                        // E — Data prelievo effettivo
      ''                         // F — Data emissione bolla (manuale)
    ]]);

    // H — Data consegna effettiva (vuota)
    sheet.getRange(nextRow, 8).setValue('');

    // G — copia la formula dalla riga precedente se esiste, altrimenti lascia vuota
    var prevRow = nextRow - 1;
    if (prevRow >= 2) {
      var srcG = sheet.getRange(prevRow, 7);
      if (srcG.getFormula()) {
        srcG.copyTo(sheet.getRange(nextRow, 7), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      }
    }

    // I — copia la formula dalla riga precedente se esiste, altrimenti scrive 'APERTO'
    var formulaI = (prevRow >= 2) ? sheet.getRange(prevRow, 9).getFormula() : '';
    if (formulaI) {
      sheet.getRange(prevRow, 9).copyTo(sheet.getRange(nextRow, 9), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    } else {
      sheet.getRange(nextRow, 9).setValue('APERTO');
    }

    return { success: true, message: 'Registrazione completata', data: { odv: codiceODV, cl: codiceCL, dataSpedizioneCliente: dataSpedizioneFormattata } };

  } catch (e) {
    return { success: false, message: 'Errore: ' + e.message, type: 'error' };
  }
}

function registraPrelievo(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);
    if (!codiceODV) return { success: false, type: 'validation', message: 'Codice ODV obbligatorio' };

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);
    if (riga === 0) return { success: false, message: 'ODV "' + codiceODV + '" non trovato.', type: 'not_found' };

    var dataPrelievoEsistente = sheet.getRange(riga, 5).getValue();
    if (dataPrelievoEsistente) {
      return { success: false, message: 'ODV "' + codiceODV + '" già prelevato in data ' + formatCellValue_(dataPrelievoEsistente), type: 'already_done' };
    }

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.getRange(riga, 5).setValue(now); // E: Data prelievo effettivo

    // G è una formula sul foglio: la rileggiamo dopo flush per restituirla al client.
    SpreadsheetApp.flush();
    var dataConsegnaPrevistaFormatted = readDateCellAsDayMonthYear_(sheet.getRange(riga, 7).getValue());

    var codiceCL = cleanString_(sheet.getRange(riga, 2).getValue());

    return { success: true, message: 'Prelievo registrato', data: { odv: codiceODV, cl: codiceCL, dataPrelievo: now, dataConsegnaPrevista: dataConsegnaPrevistaFormatted } };

  } catch (e) {
    return { success: false, message: 'Errore: ' + e.message, type: 'error' };
  }
}

function registraRicezione(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);
    if (!codiceODV) return { success: false, type: 'validation', message: 'Codice ODV obbligatorio' };

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);
    if (riga === 0) return { success: false, message: 'ODV "' + codiceODV + '" non trovato.', type: 'not_found' };

    var dataPrelievoEsistente = sheet.getRange(riga, 5).getValue();
    if (!dataPrelievoEsistente) {
      return { success: false, message: 'ODV "' + codiceODV + '" non risulta prelevato.', type: 'not_ready' };
    }

    var statoAttuale = cleanString_(sheet.getRange(riga, 9).getValue());
    if (statoAttuale === 'CHIUSO') {
      var dataConsegnaEsistente = sheet.getRange(riga, 8).getValue();
      return { success: false, message: 'ODV "' + codiceODV + '" già chiuso in data ' + formatCellValue_(dataConsegnaEsistente), type: 'already_done' };
    }

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.getRange(riga, 8).setValue(now);      // H: Data consegna effettiva
    sheet.getRange(riga, 9).setValue('CHIUSO'); // I: Stato

    var codiceCL = cleanString_(sheet.getRange(riga, 2).getValue());

    return { success: true, message: 'Ricezione registrata — ODV chiuso', data: { odv: codiceODV, cl: codiceCL, dataRicezione: now } };

  } catch (e) {
    return { success: false, message: 'Errore: ' + e.message, type: 'error' };
  }
}

function annullaPrelievo(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);
    if (!codiceODV) return { success: false, type: 'validation', message: 'Codice ODV obbligatorio' };

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);
    if (riga === 0) return { success: false, message: 'ODV "' + codiceODV + '" non trovato.', type: 'not_found' };

    var statoAttuale = cleanString_(sheet.getRange(riga, 9).getValue());
    if (statoAttuale === 'CHIUSO') {
      return { success: false, message: 'ODV "' + codiceODV + '" è già chiuso: annulla prima la ricezione.', type: 'already_done' };
    }

    sheet.getRange(riga, 5).setValue('');       // E: Data prelievo effettivo
    sheet.getRange(riga, 9).setValue('APERTO'); // I: Stato (G non si tocca: formula)

    return { success: true, message: 'Prelievo annullato', data: { odv: codiceODV } };

  } catch (e) {
    return { success: false, message: 'Errore: ' + e.message, type: 'error' };
  }
}

function annullaRicezione(codiceODV) {
  try {
    codiceODV = cleanString_(codiceODV);
    if (!codiceODV) return { success: false, type: 'validation', message: 'Codice ODV obbligatorio' };

    var sheet = getSheet();
    var riga = cercaRigaODV(codiceODV);
    if (riga === 0) return { success: false, message: 'ODV "' + codiceODV + '" non trovato.', type: 'not_found' };

    var statoAttuale = cleanString_(sheet.getRange(riga, 9).getValue());
    if (statoAttuale !== 'CHIUSO') {
      return { success: false, message: 'ODV "' + codiceODV + '" non risulta chiuso.', type: 'not_ready' };
    }

    sheet.getRange(riga, 8).setValue('');       // H: Data consegna effettiva
    sheet.getRange(riga, 9).setValue('APERTO'); // I: Stato

    return { success: true, message: 'Ricezione annullata', data: { odv: codiceODV } };

  } catch (e) {
    return { success: false, message: 'Errore: ' + e.message, type: 'error' };
  }
}

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
      var stato = cleanString_(data[i][8]);
      var prelievo = data[i][4];

      var statoDisplay;
      if (stato === 'CHIUSO') statoDisplay = 'CHIUSO';
      else if (prelievo)      statoDisplay = 'PRELEVATO';
      else                    statoDisplay = 'APERTO';

      result.push({
        odv:                   cleanString_(data[i][0]),
        cl:                    cleanString_(data[i][1]),
        dataInserimento:       formatCellValue_(data[i][2]),
        dataSpedizioneCliente: formatCellValue_(data[i][3]),  // D
        dataPrelievo:          formatCellValue_(data[i][4]),  // E
        dataEmissioneBolla:    formatCellValue_(data[i][5]),  // F
        dataConsegnaPrevista:  formatCellValue_(data[i][6]),  // G (formula)
        dataConsegnaEffettiva: formatCellValue_(data[i][7]),  // H
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
  if (!sheet) throw new Error('Foglio "' + SHEET_NAME + '" non trovato.');
  return sheet;
}

function cercaRigaODV(codiceODV) {
  codiceODV = cleanString_(codiceODV);
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var codici = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < codici.length; i++) {
    if (cleanString_(codici[i][0]) === codiceODV) return i + 2;
  }
  return 0;
}

function formatDateForDisplay_(dateStr) {
  if (!dateStr) return '';
  var parts = String(dateStr).split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
  return String(dateStr);
}

function cleanString_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatCellValue_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return String(value);
}

function readDateCellAsDayMonthYear_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(value);
}
