/**
 * QAmate — Google Apps Script webhook
 * ---------------------------------------------------------------------------
 * Gives the dashboard near-instant updates while QA is editing the sheet.
 * The 10-minute cron is still required: it is the only trigger that can detect
 * rows DELETED from the sheet.
 *
 * SETUP
 * 1. Open the QA sheet → Extensions → Apps Script.
 * 2. Replace Code.gs with this file.
 * 3. Set WEBHOOK_URL and SECRET below. SECRET must match SYNC_WEBHOOK_SECRET
 *    in the app's .env exactly.
 * 4. Save, then: Triggers (clock icon) → Add Trigger
 *       Function:            onSheetEdit
 *       Event source:        From spreadsheet
 *       Event type:          On change
 *    (Use "On change", not "On edit" — On edit does not fire for paste,
 *     row insert/delete, or edits made by other scripts.)
 * 5. Approve the authorisation prompt on first run.
 * 6. Test it: Run → pingNow, then check the Executions log.
 *
 * The app must be reachable from Google's servers. On localhost it is not —
 * use a tunnel (ngrok, cloudflared) or deploy first.
 * ---------------------------------------------------------------------------
 */

var WEBHOOK_URL = 'https://your-host.example.com/api/sync/webhook';
var SECRET = 'change-me'; // must equal SYNC_WEBHOOK_SECRET in .env
var DEBOUNCE_MS = 30 * 1000; // one call per 30s of editing, not one per keystroke

/** Installable "On change" trigger target. */
function onSheetEdit(e) {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var last = Number(props.getProperty('qamate_last_ping') || 0);

  // Debounce: a burst of edits produces one webhook call, not fifty.
  if (now - last < DEBOUNCE_MS) {
    props.setProperty('qamate_pending', '1');
    return;
  }
  props.setProperty('qamate_last_ping', String(now));
  props.deleteProperty('qamate_pending');
  ping(e && e.changeType ? e.changeType : 'EDIT');
}

/**
 * Optional: add a second time-driven trigger on this function, every minute,
 * so an edit that arrived during the debounce window is not lost.
 */
function flushPending() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('qamate_pending') !== '1') return;
  var now = Date.now();
  if (now - Number(props.getProperty('qamate_last_ping') || 0) < DEBOUNCE_MS) return;
  props.setProperty('qamate_last_ping', String(now));
  props.deleteProperty('qamate_pending');
  ping('FLUSH');
}

/** Manual test — Run this from the editor and check the Executions log. */
function pingNow() {
  ping('MANUAL');
}

function ping(reason) {
  var body = JSON.stringify({
    ts: Date.now(),
    reason: reason || 'EDIT',
    sheetId: SpreadsheetApp.getActiveSpreadsheet().getId()
  });

  var sig = Utilities.computeHmacSha256Signature(body, SECRET)
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');

  try {
    var res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-QA-Signature': sig },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log('QAmate sync ok (' + code + '): ' + res.getContentText().slice(0, 300));
    } else {
      console.error('QAmate sync failed (' + code + '): ' + res.getContentText().slice(0, 300));
    }
  } catch (err) {
    console.error('QAmate webhook error: ' + err);
  }
}
