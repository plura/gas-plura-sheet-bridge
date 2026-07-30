/** Example consumer project — two forms writing to one spreadsheet.
 *
 * In the Apps Script editor this file is `Main.gs`; it's mirrored here as `.js`
 * for the same reason as `src/PluraSheetBridge.js` (tooling/highlighting).
 *
 * Setup in the consumer project:
 *   1. Libraries → add PluraSheetBridge by script ID, pick a version.
 *   2. Deploy *this* project as a Web App (the library is imported, never deployed).
 *
 * Each form must POST JSON containing:
 *   - `gas_config_key` — matches a CONFIG entry's `key` (array mode only)
 *   - `_referrer`      — host or URL, checked against `allowedDomains`
 *
 * Optionally, a request can name its own destination instead of using the one
 * below — `spreadsheet_id` and `sheet_gid`, see README "Per-request
 * destination". The entries here keep a `sheetName`, which is what lets such a
 * request still resolve if it moves to a different spreadsheet.
 */

const CONFIG = [
  // Registration form → "Registrations" tab
  {
    key: "registration",
    sheetId: "YOUR_SPREADSHEET_ID",
    sheetName: "Registrations",
    // sheetGid: 721644865,  // optional: target the tab by gid instead — survives renames
    allowedDomains: ["example.com", "www.example.com"],
    requiredFields: ["full-name", "email", "phone", "profession", "activities"],
    fieldOrder: [
      "full-name", "email", "phone", "profession", "specialty",
      "license-number", "staff-number", "tax-id", "activities", "data-consent", "timestamp"
    ],
    transforms: {
      activities: { type: "join", sep: ", " },   // checkbox group arrives as an array
      "data-consent": { type: "bool" },
    },
    addTimestamp: true,
    logErrors: true,
  },

  // Abstract submission form → "Abstracts" tab, same spreadsheet
  {
    key: "abstract",
    sheetId: "YOUR_SPREADSHEET_ID",
    sheetName: "Abstracts",
    allowedDomains: ["example.com", "www.example.com"],
    requiredFields: [
      "title", "full-name", "email", "phone", "age", "gender",
      "institution", "abstract-title", "abstract-type",
      "abstract-summary", "abstract-authors", "data-consent"
    ],
    fieldOrder: [
      "title", "full-name", "email", "phone", "age", "gender",
      "institution", "abstract-title", "abstract-type", "abstract-summary",
      "abstract-authors", "abstract-funding", "abstract-references",
      "abstract-documents", "data-consent", "timestamp"
    ],
    transforms: {
      "abstract-documents": { type: "join", sep: ", " },
      "data-consent": { type: "bool" },
    },
    addTimestamp: true,
    logErrors: true,
  },
];

/** Web App entry point (POST only).
 *
 * @param {GoogleAppsScript.Events.DoPost} e Apps Script POST event.
 * @return {GoogleAppsScript.Content.TextOutput} JSON status response.
 */
function doPost(e) {
  return PluraSheetBridge.handlePost(e, CONFIG);
}

/* Routing key, sender side — two options:
     - Resolved server-side at send time, from the sender's own settings. Preferred:
       nothing about the routing is exposed to the browser, and a hand-added or
       forged form field can't reach the payload.
     - A hidden form field, e.g. Contact Form 7's [hidden gas_config_key "abstract"].
       Simpler, but client-visible and client-editable.

   `_referrer` is always added by the sender (wp-plugin-plura's plura_to_sheets),
   never by the form itself.
*/
