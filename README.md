# PluraSheetBridge

Reusable Google Apps Script library — validates incoming POST data and writes it to a Google Sheet. Provider-agnostic: usable by WordPress (e.g. via `wp-plugin-plura`'s `plura_cf7_to_sheets`/`plura_to_sheets`), other web apps, or any source that can POST JSON. Not tied to any single client project.

## Workflow (current)

Manual copy-paste. The actual code is edited and tested directly in the Google Apps Script web editor (that's the only place it ever runs — there's no local execution). `src/PluraSheetBridge.js` here is a version-controlled mirror: after making/testing changes in the Apps Script editor, copy the final source back into this file and commit.

**Required project settings** on the live Apps Script project (Project Settings → "Show manifest file" to edit `appsscript.json` there): runtime must be set to **V8** — the code uses optional chaining (`?.`) and nullish coalescing (`??`), which the older Rhino engine doesn't support.

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

See `examples/Main.js` for a full consumer project: two forms sharing one spreadsheet, routed to separate tabs via `gas_config_key`.

## Alternative workflow (not in use, but an option later)

`clasp` (Google's own CLI, `npm i -g @google/clasp` or as a project devDependency) can sync between this repo and the live Apps Script project instead of manual copy-paste — either direction:

- **Pull-only** (still edit/test in Google's IDE, just automate keeping git in sync): `clasp login`, then `clasp pull` after each change in the editor, instead of hand-copying the code.
- **Push workflow** (edit locally, deploy from here): `clasp push` after local edits.

Either mode needs a `.clasp.json` (holding the project's `scriptId`, gitignored — same reasoning as `sftp.json` in site repos: environment-specific, not committed) and a `rootDir` pointing at `src/`. Worth adding `package.json` (pinning `@google/clasp` as a devDependency) at that point too, so the CLI version is reproducible instead of whatever's globally installed. None of that exists in this repo right now since it isn't needed for manual copy-paste.
