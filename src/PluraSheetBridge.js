/** PluraSheetBridge — POST-only, camelCase config + single-parameter API (ES2020+)
 *
 * Exported top-level API (callable via library identifier):
 *   handlePost(e, configData, opts?)
 *   validateRequest(e, config)
 *   saveFormData(data, config)
 *   createResponse(message, isError?)
 *
 * configData:
 *   - Object  → single form config (ignores .key)
 *   - Array   → multiple form configs; each item must have .key
 *               request must include body.gas_config_key (or opts.keyField)
 */

// ---- Exported API ----
function handlePost(e, configData, opts) {
  const sel = _resolveConfig(e, configData, opts);
  if (sel?.error) return sel.error;
  return _handlePostSingle(e, sel.config);
}

function validateRequest(e, config) {
  if (!e?.postData?.contents) throw new Error("Invalid request format");

  const data = JSON.parse(e.postData.contents);
  const referrer = data._referrer ?? "";

  // Domain validation (substring match)
  const domains = config.allowedDomains ?? [];
  const ok = domains.some(d => referrer.includes(d));
  if (!ok) throw new Error("Unauthorized domain");

  // Remove referrer after validation
  delete data._referrer;

  // Required fields
  for (const f of (config.requiredFields ?? [])) {
    if (!data[f]) throw new Error(`Missing required field: ${f}`);
  }

  // Timestamp (formatted string so Sheets recognizes it consistently)
  if (config.addTimestamp) {
    const tz = Session.getScriptTimeZone();
    data.timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  }

  return data;
}

function saveFormData(data, config) {
  const sheet = _resolveSheet(config);

  const row = (config.fieldOrder ?? []).map(field => {
    const value = data[field];

    // Classic formatter (if provided) wins
    if (typeof config.formatValue === "function") {
      return _sanitizeForSheets(config.formatValue(field, value));
    }

    // Otherwise transforms/fallback
    return _applyTransform(field, value, data, config);
  });

  sheet.appendRow(row);
}

function createResponse(message, isError) {
  const error = !!isError;
  return ContentService
    .createTextOutput(JSON.stringify({ status: error ? "error" : "success", message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Internals (not meant to be called by consumers) ----
function _handlePostSingle(e, config) {
  try {
    const data = validateRequest(e, config);
    saveFormData(data, config);
    return createResponse("Form submitted successfully");
  } catch (err) {
    if (config?.logErrors) console.error(err);
    return createResponse(err.message, true);
  }
}

function _resolveConfig(e, configData, opts) {
	if (!configData) {
		return { error: createResponse("Configuration missing (no CONFIG provided).", true) };
	}

	// Multi-form (array): require key in payload and match by config.key
	if (Array.isArray(configData)) {
		const key = _extractKey(e, opts);

		// If neither the default 'gas_config_key' nor an alternative (opts.keyField) is present
		if (!key) {
			return { error: createResponse(
				"Missing 'gas_config_key' in request payload (or missing alternative key field defined in handler options).",
				true
			) };
		}

		// Key present but no matching config entry
		const cfg = configData.find(c => c?.key === key);
		return cfg
			? { config: cfg }
			: { error: createResponse(`No CONFIG entry found for key value: '${key}'.`, true) };
	}

	// Single-form (object)
	if (typeof configData === "object") {
		return { config: configData };
	}

	return { error: createResponse("Invalid CONFIG type (expected object or array).", true) };
}

function _extractKey(e, opts) {
  const keyField = opts?.keyField ?? "gas_config_key";
  try {
    const body = e?.postData?.contents ? JSON.parse(e.postData.contents) : null;
    return body?.[keyField] ?? null;
  } catch (_) {
    return null;
  }
}

function _resolveSheet(config) {
  const ss = SpreadsheetApp.openById(config.sheetId);

  // sheetGid wins outright when set — a wrong gid throws rather than silently
  // falling back to sheetName and writing to the wrong tab.
  if (config.sheetGid != null) {
    // Coerced because getSheetId() returns a number: a quoted gid would never
    // match under === and would fail identically to a deleted tab.
    const gid = Number(config.sheetGid);
    const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
    if (!sheet) throw new Error(`Sheet not found for gid: ${config.sheetGid}`);
    return sheet;
  }

  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${config.sheetName}`);
  return sheet;
}

function _applyTransform(fieldId, value, data, config) {
  const rules = config.transforms ?? {};
  const rule = rules[fieldId];

  // Baseline normalization
  let v = _normalizeForSheets(value);

  // Per-field function
  if (typeof rule === "function") {
    try {
      v = rule(v, fieldId, data);
    } catch (err) {
      if (config.logErrors) console.error(`TRANSFORM error on '${fieldId}':`, err);
    }
    return _sanitizeForSheets(v);
  }

  // Declarative types
  if (rule?.type === "join") {
    if (Array.isArray(value)) v = value.join(rule.sep ?? ", ");
    return _sanitizeForSheets(v);
  }

  if (rule?.type === "bool" || rule?.type === "boolean") {
    const b = _coerceBoolean(value);
    return _sanitizeForSheets(b); // returns boolean unchanged
  }

  // Fallback
  if (Array.isArray(value)) return _sanitizeForSheets(value.join(", "));
  return _sanitizeForSheets(v);
}

function _coerceBoolean(input) {
	if (typeof input === "boolean") return input;

	if (typeof input === "number") {
		return input === 1 ? true : input === 0 ? false : Boolean(input);
	}

	if (typeof input === "string") {
		const s = input.trim().toLowerCase();

		// truthy strings
		if (s === "1" || s === "true" || s === "yes" || s === "on") return true;

		// falsy strings
		if (s === "0" || s === "false" || s === "no" || s === "off") return false;
	}

	return Boolean(input);
}

function _normalizeForSheets(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function _sanitizeForSheets(v) {
  if (typeof v !== "string") return v;
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}
