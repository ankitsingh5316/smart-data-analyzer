function toPostgres(sql) {
  let text = sql;
  text = text.replace(
    /JSON_UNQUOTE\(\s*JSON_EXTRACT\(\s*([a-zA-Z0-9_.]+)\s*,\s*\?\s*\)\s*\)/g,
    '($1->>substring(? from 3))'
  );
  text = text.replace(
    /JSON_EXTRACT\(\s*([a-zA-Z0-9_.]+)\s*,\s*\?\s*\)/g,
    '($1->substring(? from 3))'
  );
  text = text.replace(/AS DECIMAL\((\d+)\s*,\s*(\d+)\)/g, 'AS NUMERIC($1,$2)');
  text = text.replace(/AS DATETIME/g, 'AS TIMESTAMP');
  text = text.replace(/CAST\(\s*([a-zA-Z0-9_.]+)\s*AS CHAR\s*\)/g, '($1)::text');
  text = text.replace(
    /DATE_ADD\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL \? MINUTE\s*\)/g,
    "(CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))"
  );
  text = text.replace(
    /DATE_SUB\(\s*UTC_TIMESTAMP\(\)\s*,\s*INTERVAL (\d+) DAY\s*\)/g,
    "(CURRENT_TIMESTAMP - INTERVAL '$1 days')"
  );
  text = text.replace(/DATE\(\s*CAST\((.+?) AS TIMESTAMP\)\s*\)/g, '(CAST($1 AS TIMESTAMP))::date');
  text = text.replace(/\bDATE\(\s*([a-zA-Z0-9_.]+)\s*\)/g, '($1)::date');
  text = text.replace(/\bREGEXP\b/g, '~*');
  text = text.replace(/\bLIKE\b/g, 'ILIKE');
  return numberPlaceholders(text);
}

function numberPlaceholders(sql) {
  let out = '';
  let index = 0;
  let count = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (char === "'") {
      let end = index + 1;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") {
          end += 2;
          continue;
        }
        if (sql[end] === "'") break;
        end += 1;
      }
      out += sql.slice(index, Math.min(end + 1, sql.length));
      index = end + 1;
      continue;
    }
    if (char === '?') {
      count += 1;
      out += `$${count}`;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

module.exports = { toPostgres };
