/** Extracts client metadata for audit logs and token records. */
export function clientInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
  };
}

/** Serialises rows to CSV with formula-injection protection. */
export function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    let s = value instanceof Date ? value.toISOString() : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(','));
  return [header, ...body].join('\r\n');
}
