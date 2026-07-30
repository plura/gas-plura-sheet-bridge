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
 */

const CONFIG = [
  // Registration form → "Inscrições" tab
  {
    key: "registration",
    sheetId: "YOUR_SPREADSHEET_ID",
    sheetName: "Inscrições",
    allowedDomains: ["example.pt", "www.example.pt"],
    requiredFields: ["nome-completo", "email", "telefone", "classe-profissional", "atividades"],
    fieldOrder: [
      "nome-completo", "email", "telefone", "classe-profissional", "especialidade",
      "numero-ordem", "numero-mecanografico", "nif", "atividades", "protecao-dados", "timestamp"
    ],
    transforms: {
      atividades: { type: "join", sep: ", " },   // checkbox group arrives as an array
      "protecao-dados": { type: "bool" },
    },
    addTimestamp: true,
    logErrors: true,
  },

  // Abstract submission form → "Abstracts" tab, same spreadsheet
  {
    key: "abstract",
    sheetId: "YOUR_SPREADSHEET_ID",
    sheetName: "Abstracts",
    allowedDomains: ["example.pt", "www.example.pt"],
    requiredFields: [
      "titulo", "nome-completo", "email", "telefone", "idade", "genero",
      "instituicao", "abstract-titulo", "abstract-tipo",
      "abstract-resumo", "abstract-autores", "protecao-dados"
    ],
    fieldOrder: [
      "titulo", "nome-completo", "email", "telefone", "idade", "genero",
      "instituicao", "abstract-titulo", "abstract-tipo", "abstract-resumo",
      "abstract-autores", "abstract-financiamento", "abstract-referencias",
      "abstract-documentos", "protecao-dados", "timestamp"
    ],
    transforms: {
      "abstract-documentos": { type: "join", sep: ", " },
      "protecao-dados": { type: "bool" },
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

/* Contact Form 7 side — add a hidden field per form:
     [hidden gas_config_key "registration"]
     [hidden gas_config_key "abstract"]
   `_referrer` is added by the WordPress sender (wp-plugin-plura), not by CF7.
*/
