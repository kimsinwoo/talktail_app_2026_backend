/**
 * Input sanitization for CSV and logs to prevent injection.
 * - CSV: prefix formula-like cells with ' and escape quotes.
 * - Logs: strip control chars and limit length to avoid log injection.
 */

/**
 * Sanitize a value for safe inclusion in a CSV cell.
 * Prefixes = + - @ \t \r \n with ' to prevent formula injection.
 * Wraps in quotes and escapes " if needed.
 *
 * @param {*} value - Cell value (number, string, null, undefined)
 * @returns {string} Safe CSV cell content
 */
function sanitizeCsvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/^[=+\-@\t\r\n]/.test(s)) {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Sanitize user-controlled input before writing to logs.
 * Removes newlines/tabs and truncates to maxLength.
 *
 * @param {*} value - Any value
 * @param {number} maxLength - Max characters (default 200)
 * @returns {string}
 */
function sanitizeForLog(value, maxLength = 200) {
  if (value == null) return '';
  const s = String(value).replace(/[\r\n\t]/g, ' ').trim();
  return s.length > maxLength ? s.slice(0, maxLength) + '…' : s;
}

/**
 * Sanitize device id for use in filenames only (alphanumeric, hyphen, underscore).
 * Does not allow path separators or ..
 *
 * @param {string} deviceId
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeDeviceIdForFilename(deviceId, maxLen = 80) {
  if (typeof deviceId !== 'string') return 'unknown';
  const safe = deviceId.replace(/[:-]/g, '-').replace(/[^a-zA-Z0-9-]/g, '_');
  return safe.slice(0, maxLen) || 'unknown';
}

module.exports = {
  sanitizeCsvCell,
  sanitizeForLog,
  sanitizeDeviceIdForFilename,
};
