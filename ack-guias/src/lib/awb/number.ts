export function checkDigit(first7: string): number {
  return Number(first7) % 7;
}

export function isValidSerial(serial: string): boolean {
  if (!/^\d{8}$/.test(serial)) return false;
  return Number(serial[7]) === checkDigit(serial.slice(0, 7));
}

export function serialFromBase(base7: number): string {
  const head = String(base7).padStart(7, "0").slice(-7);
  return `${head}${checkDigit(head)}`;
}

export function formatAwb(prefix: string, serial: string): string {
  return `${prefix.padStart(3, "0")}-${serial}`;
}

export function parseAwb(value: string): { prefix: string; serial: string } | null {
  const compact = value.replace(/[\s-]/g, "");
  const match = compact.match(/^(\d{3})(\d{8})$/);
  if (!match) return null;
  return { prefix: match[1], serial: match[2] };
}

export function nextSerial(serial: string): string {
  return serialFromBase(Number(serial.slice(0, 7)) + 1);
}

export type StockDraft = {
  prefix: string;
  serial: string;
  awb: string;
};

export function expandCount(prefix: string, start: string, count: number): { ok: StockDraft[]; rejected: string[] } {
  const cleanPrefix = prefix.replace(/\D/g, "").padStart(3, "0").slice(-3);
  const digits = start.replace(/\D/g, "");
  const rejected: string[] = [];
  if (!/^\d{3}$/.test(cleanPrefix) || cleanPrefix === "000") rejected.push(`Bad prefix ${prefix}`);
  if (count < 1 || count > 500) rejected.push("Count must be from 1 to 500");
  if (rejected.length) return { ok: [], rejected };
  let serial: string;
  if (digits.length === 8) {
    if (!isValidSerial(digits)) return { ok: [], rejected: [`${formatAwb(cleanPrefix, digits)} failed the mod-7 check`] };
    serial = digits;
  } else if (digits.length === 7) {
    serial = serialFromBase(Number(digits));
  } else {
    return { ok: [], rejected: ["Start with 7 digits (check digit added) or 8 digits (check digit checked)"] };
  }
  const ok: StockDraft[] = [];
  for (let i = 0; i < count; i += 1) {
    ok.push({ prefix: cleanPrefix, serial, awb: formatAwb(cleanPrefix, serial) });
    serial = nextSerial(serial);
  }
  return { ok, rejected };
}

export function parseStockText(text: string, fallbackPrefix?: string): { ok: StockDraft[]; rejected: string[] } {
  const ok: StockDraft[] = [];
  const rejected: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(awb|prefix|number|mawb)\b/i.test(line)) continue;
    const cells = line.split(/[,;\t]/).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length >= 3 && /^\d{1,3}$/.test(cells[0]) && /^\d+$/.test(cells[1]) && /^\d+$/.test(cells[2]) && cells[1].length <= 8) {
      const batch = expandCount(cells[0], cells[1], Number(cells[2]));
      ok.push(...batch.ok);
      rejected.push(...batch.rejected);
      continue;
    }
    if (cells.length >= 2 && /^\d{1,3}$/.test(cells[0]) && /^\d{7,8}$/.test(cells[1].replace(/\D/g, ""))) {
      const batch = expandCount(cells[0], cells[1], 1);
      ok.push(...batch.ok);
      rejected.push(...batch.rejected.map((reason) => `${line}: ${reason}`));
      continue;
    }
    const parsed = parseAwb(cells[0] ?? "");
    if (parsed && isValidSerial(parsed.serial)) {
      ok.push({ ...parsed, awb: formatAwb(parsed.prefix, parsed.serial) });
      continue;
    }
    if (/^\d{8}$/.test(cells[0] ?? "") && fallbackPrefix) {
      const batch = expandCount(fallbackPrefix, cells[0], 1);
      ok.push(...batch.ok);
      rejected.push(...batch.rejected.map((reason) => `${line}: ${reason}`));
      continue;
    }
    rejected.push(line);
  }
  return { ok, rejected };
}
