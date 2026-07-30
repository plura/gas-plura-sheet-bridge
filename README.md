# PluraSheetBridge

Reusable Google Apps Script library — validates incoming POST data and writes it to a Google Sheet. Provider-agnostic: usable by WordPress (e.g. via `wp-plugin-plura`'s `plura_to_sheets`), other web apps, or any source that can POST JSON. Not tied to any single client project.

## Workflow (current)

Manual copy-paste. The actual code is edited and tested directly in the Google Apps Script web editor (that's the only place it ever runs — there's no local execution). `src/PluraSheetBridge.js` here is a version-controlled mirror: after making/testing changes in the Apps Script editor, copy the final source back into this file and commit.

Changes that originate **in this repo** travel the other way, and it's three steps rather than one:

1. Paste `src/PluraSheetBridge.js` into the Apps Script editor and test it there.
2. Cut a **new library version** — consumers import a pinned version, so saving alone changes nothing for them.
3. Bump that pinned version in each consumer project (Libraries → version dropdown).

Until all three happen, this repo is ahead of what's actually running. Worth syncing while a change is small: the paste is manual and all-or-nothing, so letting several changes pile up makes the one risky step riskier.

**Required project settings** on the live Apps Script project (Project Settings → "Show manifest file" to edit `appsscript.json` there): runtime must be set to **V8** — the code uses optional chaining (`?.`) and nullish coalescing (`??`), which the older Rhino engine doesn't support.

## Exported API

- `handlePost(e, configData, opts?)` — main entry point, call from a consumer project's `doPost(e)`.
- `validateRequest(e, config)` — parses the POST body, validates referrer domain and required fields, optionally stamps a timestamp.
- `saveFormData(data, config)` — writes a row to the configured sheet, honoring field order and per-field transforms.
- `createResponse(message, isError?)` — builds the JSON response.

## Config reference

`handlePost` takes either **one config object** or an **array of them**. The array form is how one Web App serves several forms — each config gets its own destination and its own rules, and the request picks between them with `gas_config_key`:

```js
// One form.
const CONFIG = { sheetId: '...', sheetName: 'Registrations', /* ... */ };

// Several forms — same deployment, one config each.
const CONFIG = [
  { key: 'registration', sheetId: '...', sheetName: 'Inscrições', /* ... */ },
  { key: 'abstract',     sheetId: '...', sheetName: 'Abstracts',  /* ... */ },
];
```

`key` is required in array mode and ignored otherwise. Since `sheetId` is per-config, entries can point at **different spreadsheets**, not just different tabs of one — sharing a `sheetId` (as above) is a convenience, not a constraint.

Full shape of a single config:

```js
{
  key: 'registration',          // array mode only — must match the request's gas_config_key
  allowedDomains: ['example.com'],
  requiredFields: ['email'],
  addTimestamp: true,
  sheetId: '...',               // the SPREADSHEET file id — /spreadsheets/d/<id>/edit — not a tab gid
  sheetName: 'Registrations',   // the tab within that spreadsheet, by its visible name
  sheetGid: 721644865,          // optional alternative to sheetName — rename-proof, wins when set
  fieldOrder: ['email', 'name', 'timestamp'],
  formatValue: (field, value) => value,     // optional global override
  transforms: {                              // optional per-field, ignored if formatValue is set
    atividades: { type: 'join', sep: ', ' },
    subscribed: { type: 'bool' },
  },
  logErrors: true,
}
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `key` | string | — | Array mode only; matched against the request's `gas_config_key`. Ignored when a single config object is passed. |
| `allowedDomains` | string[] | `[]` | **Substring** match against `_referrer` — `'example.com'` also matches `evil-example.com.attacker.tld`. Empty or missing rejects every request. |
| `requiredFields` | string[] | `[]` | Rejects the request if any listed field is **falsy** — `false`, `0` and `''` all count as missing, not just absent keys. |
| `addTimestamp` | boolean | off | Sets `data.timestamp` to `yyyy-MM-dd HH:mm:ss` in the script's timezone. Add `'timestamp'` to `fieldOrder` or it's computed and discarded. Overwrites any incoming field of that name. |
| `sheetId` | string | — | The spreadsheet **file** id, from `/spreadsheets/d/<id>/edit`. |
| `sheetName` | string | — | Target tab by its visible name. Renaming the tab in Sheets breaks it — throws `Sheet not found`. |
| `sheetGid` | number | — | Target tab by gid (the `#gid=` in the URL). Survives renames. **Wins over `sheetName`** when set; a wrong gid throws rather than falling back. Strings are coerced. |
| `fieldOrder` | string[] | `[]` | Column order, left to right. Fields not listed are never written; listed fields absent from the payload become empty cells. Required in practice. |
| `formatValue` | function | — | `(field, value) => cell`. **Global** — if set, `transforms` never runs for any field. Receives the **raw** value. |
| `transforms` | object | `{}` | Per-field rules, keyed by field name. See below. |
| `logErrors` | boolean | off | `console.error` for request failures and transform errors. Never changes the response. |

In array mode the request must carry `gas_config_key` matching one config's `key` — pass `opts.keyField` to `handlePost` to read it from a differently-named field. A missing key, or one matching no config, returns an error response rather than falling back to the first entry.

Every request must also send `_referrer` (host or URL). It's checked against `allowedDomains` and stripped before the row is written. `gas_config_key` is **not** stripped — it lands in the sheet if you list it in `fieldOrder`.

## Per-request destination

A request can carry its own destination, so the sender decides where a submission lands instead of it being fixed in CONFIG. Both fields are optional:

| Payload field | Overrides |
| --- | --- |
| `spreadsheet_id` | `sheetId` — bare id or a full `/spreadsheets/d/<id>/edit` URL |
| `sheet_gid` | `sheetGid` — the `#gid=` number |

Precedence is payload → CONFIG. A field that's **absent, blank, or malformed** leaves CONFIG's value in effect, so CONFIG stays the fallback rather than something you must repeat per request. Both fields are stripped before the row is written, so they can't reach a cell even if listed in `fieldOrder`.

A destination is two separate things — **which spreadsheet**, and **which tab inside it** — and the two payload fields resolve them independently. The left columns are what the request sends; the right columns are where the row actually lands:

| Request sends `spreadsheet_id` | Request sends `sheet_gid` | → Spreadsheet written to | → Tab written to |
| --- | --- | --- | --- |
| not sent | not sent | CONFIG's `sheetId` | CONFIG's `sheetGid`, else its `sheetName` |
| not sent | `721644865` | CONFIG's `sheetId` | gid `721644865` |
| the same file as CONFIG | not sent | CONFIG's `sheetId` | CONFIG's `sheetGid`, else its `sheetName` |
| **a different file** | not sent | the file the request named | CONFIG's `sheetName` — its `sheetGid` is dropped ❌ **fails if the entry has none** |
| a different file | `55` | the file the request named | gid `55` |
| blank or invalid | blank or invalid | CONFIG's `sheetId` | CONFIG's `sheetGid`, else its `sheetName` |

Only row four can fail, and the reason is visible in the columns: it's the one case where the request changes **which spreadsheet** but says nothing about **which tab** — leaving CONFIG's tab reference pointing into a file it doesn't belong to.

Two rules the sender has to respect:

- **Blank is not zero.** `gid=0` is the first tab of every spreadsheet, so it's a real destination. Absence must be sent as an omitted field or an empty string — never as `0`, and never gated on truthiness (`if (!gid)` and PHP's `empty()` both treat a legitimate `0` as unset).
- **A gid belongs to one file.** When `spreadsheet_id` moves a request to a different spreadsheet and no `sheet_gid` comes with it, CONFIG's `sheetGid` is dropped and resolution falls back to `sheetName`. Carrying it over would be meaningless — and since gid 0 exists in *every* spreadsheet, it would silently hit the wrong file's first tab instead of erroring. With no `sheetName` to fall back to, the request fails loudly.

Practical consequence: **give every config a `sheetName`, even when you also set `sheetGid`.** The gid wins in normal operation and the name is never consulted — but it's what keeps a request working when `spreadsheet_id` moves it to another file.

**Security:** the endpoint can't tell your server's request from anyone else's — `_referrer` is a body field, not an HTTP `Origin` header — so accepting a destination means anyone who can reach the Web App URL can name one. The Web App runs as the deploying account, so that reaches any spreadsheet in its Drive. Keep a destination in CONFIG, and if the set of target spreadsheets is known, gate it.

## Transforms

Exactly one path runs per field, in this order:

1. **`formatValue`** — if set, wins for every field. Gets the raw value, no normalization.
2. **Function transform** — `(value, fieldId, data) => cell`. Gets the **normalized** value (see below), not the raw one. If it throws, the error is logged and the **untransformed value is written anyway** — no failed request, so a broken transform shows up as quietly wrong data rather than an error.
3. **Declarative type** — `{ type: … }`, applied to the raw value.
4. **Fallback** — arrays are joined with `', '`, everything else is normalized.

| Type | Options | Behavior |
| --- | --- | --- |
| `join` | `sep` (default `', '`) | Joins arrays. **Only fires if the value is actually an array** — a single-selection checkbox arrives as a string and passes through untouched. |
| `bool` / `boolean` | — | Coerces to a real boolean, so Sheets stores `TRUE`/`FALSE` rather than text. Both spellings work. |

## Value handling

Everything not handled above is normalized: `null`/`undefined` → `''`, objects → JSON string, arrays passed through intact, everything else → `String(value)`.

Boolean coercion (`type: 'bool'`) is case-insensitive and trims: `'1'`, `'true'`, `'yes'`, `'on'` → `true`; `'0'`, `'false'`, `'no'`, `'off'` → `false`. Any other non-empty string is `true`.

**Text prefix guard:** string values starting with `=`, `+`, `-` or `@` are written with a leading apostrophe, so Sheets treats them as text instead of a formula. This applies to every value, including `formatValue` output. It's why a phone number submitted as `+351912345678` is stored as `'+351912345678` — the apostrophe is hidden in the Sheets UI but present in exports and API reads.

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
