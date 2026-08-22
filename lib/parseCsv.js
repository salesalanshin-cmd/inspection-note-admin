/** 간단 CSV 파서 (따옴표·쉼표 필드 지원). 외부 라이브러리 없음. */

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim();
    });
    return row;
  });

  return { headers, rows };
}
