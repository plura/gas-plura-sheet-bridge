# PluraSheetBridge

Reusable Google Apps Script library — validates incoming POST data and writes it to a Google Sheet. Provider-agnostic: usable by WordPress (e.g. via `wp-plugin-plura`'s `plura_cf7_to_sheets`/`plura_to_sheets`), other web apps, or any source that can POST JSON. Not tied to any single client project.

## Exported API

- `handlePost(e, configData, opts?)` — main entry point, call from a consumer project's `doPost(e)`.
- `validateRequest(e, config)` — parses the POST body, validates referrer domain and required fields, optionally stamps a timestamp.
- `saveFormData(data, config)` — writes a row to the configured sheet, honoring field order and per-field transforms.
- `createResponse(message, isError?)` — builds the JSON response.

## Config shape

```js
{
  key: 'registration',          // only needed in multi-config (array) mode — must match gas_config_key
  allowedDomains: ['example.com'],
  requiredFields: ['email'],
  addTimestamp: true,
  sheetId: '...',
  sheetName: 'Registrations',
  fieldOrder: ['email', 'name', '...'],
  formatValue: (field, value) => value,     // optional full override
  transforms: {                              // optional per-field, used if formatValue isn't set
    atividades: { type: 'join', sep: ', ' },
    subscribed: { type: 'bool' },
  },
  logErrors: true,
}
```

`configData` passed to `handlePost` can be a single config object (no `key` needed), or an array of configs — in array mode, the request must include a `gas_config_key` field (or a custom field name via `opts.keyField`) matching one config's `.key`.

## Using it from a consumer project

1. In the consumer Apps Script project: Extensions/Resources → Libraries → add by this project's script ID, pick a version.
2. Define `doPost(e)`:
   ```js
   function doPost(e) {
     return PluraSheetBridge.handlePost(e, CONFIG);
   }
   ```
3. Deploy the **consumer** project as a Web App (not this library project — this one is imported by reference, not deployed directly).

## Local development

```
npm install
npx clasp login
cp .clasp.json.example .clasp.json   # fill in the real scriptId
npx clasp push
```
