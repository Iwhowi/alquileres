// CSV compatible con Excel en español: separador «;», coma decimal y BOM UTF-8.

const SEP = ';';

function celda(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `cols` = [[cabecera, fn(fila)], …] */
export function aCSV(filas, cols) {
  const lineas = [cols.map(([h]) => celda(h)).join(SEP)];
  for (const f of filas) lineas.push(cols.map(([, fn]) => celda(fn(f))).join(SEP));
  return '﻿' + lineas.join('\r\n');
}

/** Parsea CSV con «;» o «,» (detectado en la cabecera) y comillas. Devuelve objetos por cabecera normalizada. */
export function deCSV(texto) {
  const [cab, ...resto] = filasCSV(texto).filter((f) => f.some((c) => c.trim() !== ''));
  if (!cab) return [];
  const claves = cab.map(normalizar);
  return resto.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}

/** CSV → filas de texto. Separador «;», «,» o tabulador, detectado en las primeras líneas. */
export function filasCSV(texto) {
  const t = texto.replace(/^﻿/, '');
  const muestra = t.split(/\r?\n/, 5).join('\n');
  const cuenta = (c) => (muestra.match(new RegExp(c === '\t' ? '\t' : `\\${c}`, 'g')) || []).length;
  const sep = ['\t', ';', ','].reduce((a, c) => (cuenta(c) > cuenta(a) ? c : a), ';');
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

export function normalizar(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Convierte "dd/mm/aaaa", "d-m-aa" o ISO a 'YYYY-MM-DD'. */
export function fechaISO(s) {
  if (!s) return '';
  const v = String(s).trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}
