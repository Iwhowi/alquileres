// Lectura y escritura mínima de libros Excel (.xlsx) sin librerías externas, para que funcione sin
// conexión. Escribe hojas con cabecera en negrita fija, fechas e importes con formato, anchos de
// columna y listas desplegables; lee cualquier .xlsx (Excel, Numbers, Google Sheets, LibreOffice).
import { crearZip, leerZip } from './docs.js';

// Excel admite 32 767 caracteres por celda; se quitan los caracteres que no caben en XML.
const esc = (s) => String(s).slice(0, 32767).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
/** Marca de una celda con fórmula sin valor calculado (libros generados por programas). */
export const SIN_CALCULAR = Symbol('sin calcular');
export const colLetra = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndice = (letras) => [...letras].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Fecha ISO 'AAAA-MM-DD' → número de serie de Excel. */
export function serialDe(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d || 1) / 86400000 + 25569;
}
/** Número de serie de Excel → 'AAAA-MM-DD'. */
export function isoDeSerial(n) {
  const t = new Date(Math.round((n - 25569) * 86400000));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/* ───────────── Escritura ───────────── */

// Estilos: 0 normal · 1 cabecera · 2 fecha · 3 importe · 4 texto de solo lectura (gris) · 5 título
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF8A8F96"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F5C47"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * hojas: [{ nombre, columnas: [{ titulo, tipo: 'texto'|'fecha'|'importe'|'numero'|'id', ancho, lista? }], filas: [[…]], oculta? , notas? }]
 * `lista` es el nombre de una columna de la hoja «Listas» para crear un desplegable.
 */
export async function crearXlsx(hojas, listas = {}) {
  const todas = [...hojas];
  const nombresListas = Object.keys(listas);
  if (nombresListas.length) {
    const max = Math.max(...nombresListas.map((k) => listas[k].length));
    todas.push({
      nombre: 'Listas', oculta: true,
      columnas: nombresListas.map((k) => ({ titulo: k, tipo: 'texto', ancho: 28 })),
      filas: Array.from({ length: max }, (_, i) => nombresListas.map((k) => listas[k][i] ?? '')),
    });
  }
  const refLista = (k) => {
    const i = nombresListas.indexOf(k);
    return `Listas!$${colLetra(i)}$2:$${colLetra(i)}$${Math.max(2, listas[k].length + 1)}`;
  };
  const entradas = [];
  const sheetsXml = [];
  todas.forEach((h, n) => {
    const filasXml = [];
    const cab = h.cabecera || [];
    let r = 1;
    for (const linea of cab) { // líneas de título encima de la tabla (hoja LEEME)
      filasXml.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="${linea.titulo ? 5 : 0}"><is><t xml:space="preserve">${esc(linea.texto ?? linea)}</t></is></c></row>`);
      r++;
    }
    if (h.columnas?.length) {
      filasXml.push(`<row r="${r}">${h.columnas.map((c, i) => `<c r="${colLetra(i)}${r}" t="inlineStr" s="1"><is><t>${esc(c.titulo)}</t></is></c>`).join('')}</row>`);
      const filaCab = r;
      r++;
      for (const fila of h.filas) {
        const celdas = [];
        fila.forEach((v, i) => {
          if (v === '' || v == null) return;
          const c = h.columnas[i] || {};
          const ref = `${colLetra(i)}${r}`;
          if (c.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) celdas.push(`<c r="${ref}" s="2"><v>${serialDe(v)}</v></c>`);
          else if ((c.tipo === 'importe' || c.tipo === 'numero') && typeof v === 'number' && Number.isFinite(v)) celdas.push(`<c r="${ref}"${c.tipo === 'importe' ? ' s="3"' : ''}><v>${v}</v></c>`);
          else celdas.push(`<c r="${ref}" t="inlineStr"${c.tipo === 'id' ? ' s="4"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
        });
        filasXml.push(`<row r="${r}">${celdas.join('')}</row>`);
        r++;
      }
      h._filaCab = filaCab;
    }
    const cols = (h.columnas || []).map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 16}" customWidth="1"/>`).join('');
    const dv = (h.columnas || []).map((c, i) => (c.lista && listas[c.lista] ? `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${colLetra(i)}${(h._filaCab || 1) + 1}:${colLetra(i)}5000"><formula1>${refLista(c.lista)}</formula1></dataValidation>` : '')).filter(Boolean);
    const congelar = h.columnas?.length ? `<sheetViews><sheetView workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ''}><pane ySplit="${h._filaCab}" topLeftCell="A${h._filaCab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ''}/></sheetViews>`;
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${congelar}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${filasXml.join('')}</sheetData>${h.columnas?.length && h.filas.length ? `<autoFilter ref="A${h._filaCab}:${colLetra(h.columnas.length - 1)}${h._filaCab + h.filas.length}"/>` : ''}${dv.length ? `<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>` : ''}</worksheet>`;
    entradas.push({ nombre: `xl/worksheets/sheet${n + 1}.xml`, datos: xml });
    sheetsXml.push(`<sheet name="${esc(h.nombre)}" sheetId="${n + 1}"${h.oculta ? ' state="hidden"' : ''} r:id="rId${n + 1}"/>`);
  });
  const defNames = todas.map((h, n) => (h.columnas?.length && h.filas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${n}" hidden="1">'${esc(h.nombre)}'!$A$${h._filaCab}:$${colLetra(h.columnas.length - 1)}$${h._filaCab + h.filas.length}</definedName>` : '')).join('');
  entradas.unshift(
    { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${todas.map((_, n) => `<Override PartName="/xl/worksheets/sheet${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nombre: '_rels/.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetsXml.join('')}</sheets>${defNames ? `<definedNames>${defNames}</definedNames>` : ''}</workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${todas.map((_, n) => `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n + 1}.xml"/>`).join('')}<Relationship Id="rId${todas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: 'xl/styles.xml', datos: ESTILOS },
  );
  const zip = await crearZip(entradas);
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ───────────── Lectura ───────────── */

const porTag = (nodo, tag) => [...nodo.getElementsByTagNameNS('*', tag)];
const xmlDe = (txt) => {
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El Excel está dañado o tiene un formato que no se puede leer.');
  return doc;
};

/**
 * Lee un .xlsx → { nombreHoja: [[valor, …], …] } (valores: string o number; las fechas llegan como
 * número de serie salvo que la celda sea texto).
 */
// Formatos de número integrados de Excel que son fechas.
const FMT_FECHA = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const esCodigoFecha = (code) => /[dmy]/i.test(String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0.,\s%]*$/.test(code);

/**
 * `fechas: true` → las celdas con formato de fecha se devuelven como 'AAAA-MM-DD' (útil para leer
 * libros de cualquier origen, donde no se sabe qué columnas son fechas).
 */
export async function leerXlsx(blob, { fechas = false } = {}) {
  const entradas = await leerZip(blob);
  const dec = new TextDecoder();
  const arch = Object.fromEntries(entradas.map((e) => [e.nombre.replace(/^\//, ''), e.datos]));
  const texto = (ruta) => (arch[ruta] ? dec.decode(arch[ruta]) : null);
  const wb = texto('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no es un Excel (.xlsx) válido. Si es .xls antiguo, guárdalo como .xlsx.');
  const rels = xmlDe(texto('xl/_rels/workbook.xml.rels') || '<r/>');
  const destino = Object.fromEntries(porTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const compartidas = [];
  const ss = texto('xl/sharedStrings.xml');
  // Texto de una celda con formato enriquecido: todos los <t> salvo los de la guía fonética (<rPh>).
  const textoDe = (nodo) => porTag(nodo, 't').filter((t) => t.parentNode?.localName !== 'rPh').map((t) => t.textContent).join('');
  if (ss) for (const si of porTag(xmlDe(ss), 'si')) compartidas.push(textoDe(si));
  const libro = {};
  // Libros con el sistema de fechas de 1904 (Excel antiguo de Mac): se avisa al lector para corregirlas.
  const wbDoc = xmlDe(wb);
  const pr = porTag(wbDoc, 'workbookPr')[0]?.getAttribute('date1904');
  Object.defineProperty(libro, 'fecha1904', { value: pr === '1' || pr === 'true', enumerable: false });
  // Estilos de fecha (índice de estilo de celda → es fecha)
  const estiloFecha = [];
  const st = fechas && texto('xl/styles.xml');
  if (st) {
    const doc = xmlDe(st);
    const propios = Object.fromEntries(porTag(doc, 'numFmt').map((n) => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') || '']));
    const xfs = porTag(doc, 'cellXfs')[0];
    if (xfs) for (const xf of [...xfs.children].filter((x) => x.localName === 'xf')) {
      const id = Number(xf.getAttribute('numFmtId') || 0);
      estiloFecha.push(FMT_FECHA.has(id) || (id in propios && esCodigoFecha(propios[id])));
    }
  }
  const desfase = libro.fecha1904 ? 1462 : 0;
  for (const h of porTag(wbDoc, 'sheet')) {
    const rid = h.getAttribute('r:id') || h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let ruta = destino[rid] || '';
    ruta = ruta.startsWith('/') ? ruta.slice(1) : `xl/${ruta.replace(/^\.\//, '')}`;
    const xml = texto(ruta);
    if (!xml) continue;
    const filas = [];
    for (const row of porTag(xmlDe(xml), 'row')) {
      const ri = Number(row.getAttribute('r')) - 1;
      const fila = [];
      let auto = 0;
      for (const c of porTag(row, 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndice(ref.replace(/\d+/g, '')) : auto;
        auto = ci + 1;
        const t = c.getAttribute('t');
        const v = porTag(c, 'v')[0]?.textContent;
        let val = '';
        if (t === 's') val = compartidas[Number(v)] ?? '';
        else if (t === 'inlineStr') val = textoDe(c);
        else if (t === 'str' || t === 'e') val = v ?? '';
        else if (t === 'b') val = v === '1' ? 'sí' : 'no';
        else if (v != null && v !== '') {
          val = Number(v);
          if (estiloFecha[Number(c.getAttribute('s') || 0)] && val > 0 && val < 2958466) val = isoDeSerial(val + desfase);
        }
        else if (porTag(c, 'f').length) val = SIN_CALCULAR;
        fila[ci] = val;
      }
      filas[Number.isFinite(ri) && ri >= 0 ? ri : filas.length] = fila;
    }
    libro[h.getAttribute('name')] = filas.map((f) => (f || []).map((x) => (x == null ? '' : x)));
  }
  return libro;
}

/** Lee una hoja de cálculo de LibreOffice / OpenOffice (.ods) con la misma salida que leerXlsx. */
export async function leerOds(blob) {
  const entradas = await leerZip(blob);
  const c = entradas.find((e) => e.nombre === 'content.xml');
  if (!c) throw new Error('El archivo .ods no es válido.');
  const doc = xmlDe(new TextDecoder().decode(c.datos));
  const libro = {};
  for (const t of porTag(doc, 'table')) {
    if (t.namespaceURI && !/table/.test(t.namespaceURI)) continue;
    const filas = [];
    for (const row of porTag(t, 'table-row')) {
      const fila = [];
      for (const cel of [...row.children].filter((x) => x.localName === 'table-cell' || x.localName === 'covered-table-cell')) {
        const rep = Math.min(Number(cel.getAttribute('table:number-columns-repeated') || 1), 200);
        const tipo = cel.getAttribute('office:value-type');
        let val = '';
        if (tipo === 'float' || tipo === 'currency' || tipo === 'percentage') val = Number(cel.getAttribute('office:value'));
        else if (tipo === 'date') val = (cel.getAttribute('office:date-value') || '').slice(0, 10);
        else if (tipo === 'boolean') val = cel.getAttribute('office:boolean-value') === 'true' ? 'sí' : 'no';
        else val = porTag(cel, 'p').map((p) => p.textContent).join('\n');
        for (let i = 0; i < rep; i++) fila.push(val);
      }
      while (fila.length && fila[fila.length - 1] === '') fila.pop();
      const repF = Math.min(Number(row.getAttribute('table:number-rows-repeated') || 1), fila.length ? 1000 : 1);
      for (let i = 0; i < repF; i++) filas.push([...fila]);
    }
    while (filas.length && !filas[filas.length - 1].length) filas.pop();
    libro[t.getAttribute('table:name') || `Hoja ${Object.keys(libro).length + 1}`] = filas;
  }
  return libro;
}
