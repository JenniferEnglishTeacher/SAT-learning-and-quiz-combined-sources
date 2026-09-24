const SPREADSHEET_ID = '1wpFwTOxfFXjPOsCpvIf0X-35T0tutKZqXNRnCVNpFbU';
const RESULT_SHEET = 'quiz result';
const HEADERS = [
  'timeDate',
  'studentName',
  'className',
  'quizBatchNumber',
  'resultPercentage',
  'mistakeWords',
  'batchId',
  'clientResultId',
  'resultsJson'
];

function doGet() {
  return ContentService.createTextOutput('SAT vocabulary result receiver is ready.');
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (!payload.studentName || !payload.quizBatchNumber || !payload.clientResultId) {
      return jsonResponse_({ ok: false, error: 'Missing required result fields.' });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(RESULT_SHEET);
    if (!sheet) throw new Error(`Sheet tab not found: ${RESULT_SHEET}`);

    ensureHeaders_(sheet);
    const headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const resultIdColumn = headerValues.indexOf('clientResultId') + 1;
    if (resultIdColumn > 0 && sheet.getLastRow() > 1) {
      const existing = sheet.getRange(2, resultIdColumn, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(payload.clientResultId))
        .matchEntireCell(true)
        .findNext();
      if (existing) return jsonResponse_({ ok: true, duplicate: true });
    }

    const values = {
      timeDate: payload.timeDate || new Date().toISOString(),
      studentName: safeCell_(payload.studentName),
      className: safeCell_(payload.className || ''),
      quizBatchNumber: safeCell_(payload.quizBatchNumber),
      resultPercentage: Number(payload.resultPercentage) || 0,
      mistakeWords: safeCell_(payload.mistakeWords || ''),
      batchId: safeCell_(payload.batchId || ''),
      clientResultId: safeCell_(payload.clientResultId),
      resultsJson: JSON.stringify(payload.results || [])
    };
    sheet.appendRow(headerValues.map(header => values[header] ?? ''));
    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  const width = Math.max(1, sheet.getLastColumn());
  const current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const missing = HEADERS.filter(header => !current.includes(header));
  if (missing.length) sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
}

function safeCell_(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
