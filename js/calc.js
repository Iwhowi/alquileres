// Cálculos puros: fechas, cobros, hipotecas, rentabilidad y fiscalidad.
// Sin acceso al DOM ni a localStorage, para poder probarlos con `node --test`.

/* ───────────── Fechas (siempre cadenas ISO 'YYYY-MM-DD' / 'YYYY-MM') ───────────── */

export const pad = (n) => String(n).padStart(2, '0');

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayNum(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d || 1) / 86400000;
}

/** Días desde `a` hasta `b` (b − a). */
export const diffDays = (a, b) => dayNum(b) - dayNum(a);

export function fromDayNum(n) {
  const t = new Date(n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const addDays = (s, n) => fromDayNum(dayNum(s) + n);

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const ymOf = (s) => s.slice(0, 7);

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Suma meses a una fecha ISO, ajustando al último día del mes si hace falta. */
export function addMonthsISO(s, n) {
  const ym = addMonths(s.slice(0, 7), n);
  return dayInMonth(ym, Number(s.slice(8, 10)));
}

export function monthsDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesLargo = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export const monthStart = (ym) => `${ym}-01`;
export const monthEnd = (ym) => `${ym}-${pad(daysInMonth(ym))}`;

/** Fecha del día `dia` en el mes `ym`, ajustada al último día si el mes es más corto. */
export function dayInMonth(ym, dia) {
  return `${ym}-${pad(Math.min(Math.max(1, dia | 0), daysInMonth(ym)))}`;
}

export function daysInYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

/** Noches de [entrada, salida) que caen dentro de [desde, hasta] (ambos inclusive). */
export function nightsInRange(entrada, salida, desde, hasta) {
  const a = Math.max(dayNum(entrada), dayNum(desde));
  const b = Math.min(dayNum(salida), dayNum(hasta) + 1);
  return Math.max(0, b - a);
}

/** Días de [inicio, fin] (inclusive) que caen dentro de [desde, hasta] (inclusive). */
export function daysOverlap(inicio, fin, desde, hasta) {
  const a = Math.max(dayNum(inicio), dayNum(desde));
  const b = Math.min(dayNum(fin), dayNum(hasta));
  return Math.max(0, b - a + 1);
}

/* ───────────── Dinero ───────────── */

export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const num = (x) => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (x == null || x === '') return 0;
  const s = String(x).trim().replace(/\s|€/g, '');
  // Admite "1.234,56", "1234,56" y "1234.56"
  let norm;
  if ((s.match(/,/g) || []).length > 1) return 0;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 · 12,5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, ''); // 1.234 = mil doscientos…
  else norm = s;
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : 0;
};

/* ───────────── Catálogos ───────────── */

export const MODALIDADES = {
  tradicional: 'Alquiler tradicional',
  habitaciones: 'Por habitaciones',
  turistico: 'Turístico',
};

// Grupos fiscales (conceptos de gasto deducible de los rendimientos del capital inmobiliario).
export const GRUPOS_FISCALES = {
  financiacion: 'Intereses y otros gastos de financiación',
  conservacion: 'Reparación y conservación',
  tributos: 'Tributos, recargos y tasas',
  dudoso: 'Saldos de dudoso cobro',
  juridico: 'Formalización del contrato y defensa jurídica',
  seguros: 'Primas de seguros',
  servicios: 'Servicios de terceros (gestión, limpieza, comisiones)',
  suministros: 'Suministros y comunidad',
  otros: 'Otros gastos deducibles',
  arrastre: 'Exceso de intereses y reparación de años anteriores',
  amort_inm: 'Amortización del inmueble y mejoras',
  amort_mue: 'Amortización de mobiliario y enseres',
};

// `trato`: 'gasto' (deducible en el año), 'amort_inm' / 'amort_mue' (se amortiza), 'no' (no deducible).
export const CATEGORIAS = [
  { id: 'reparacion', nombre: 'Reparación y conservación', grupo: 'conservacion', trato: 'gasto' },
  { id: 'comunidad', nombre: 'Comunidad de propietarios', grupo: 'suministros', trato: 'gasto' },
  { id: 'ibi', nombre: 'IBI', grupo: 'tributos', trato: 'gasto' },
  { id: 'tasas', nombre: 'Basuras y otras tasas', grupo: 'tributos', trato: 'gasto' },
  { id: 'seguro', nombre: 'Seguros (hogar, impago)', grupo: 'seguros', trato: 'gasto' },
  { id: 'suministros', nombre: 'Luz, agua, gas e internet', grupo: 'suministros', trato: 'gasto' },
  { id: 'limpieza', nombre: 'Limpieza y lavandería', grupo: 'servicios', trato: 'gasto', directo: true },
  { id: 'consumibles', nombre: 'Menaje y consumibles', grupo: 'suministros', trato: 'gasto', directo: true },
  { id: 'gestion', nombre: 'Gestión, administración y asesoría', grupo: 'servicios', trato: 'gasto' },
  { id: 'comisiones', nombre: 'Comisiones de agencia o plataforma', grupo: 'servicios', trato: 'gasto', directo: true },
  { id: 'financieros', nombre: 'Gastos financieros y bancarios', grupo: 'financiacion', trato: 'gasto' },
  { id: 'juridico', nombre: 'Abogado, notaría y formalización', grupo: 'juridico', trato: 'gasto' },
  { id: 'dudoso', nombre: 'Saldo de dudoso cobro', grupo: 'dudoso', trato: 'gasto' },
  { id: 'otros_ded', nombre: 'Otros gastos deducibles', grupo: 'otros', trato: 'gasto' },
  { id: 'mobiliario', nombre: 'Mobiliario y electrodomésticos', grupo: 'amort_mue', trato: 'amort_mue' },
  { id: 'mejora', nombre: 'Mejora o ampliación', grupo: 'amort_inm', trato: 'amort_inm' },
  { id: 'no_deducible', nombre: 'No deducible', grupo: null, trato: 'no' },
];
export const CAT = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

// Coeficientes de amortización lineal.
export const COEF = {
  IRPF: { inmueble: 0.03, muebles: 0.10 },
  IS: { inmueble: 0.02, muebles: 0.10 },
};

/* ───────────── Cobros ───────────── */

/**
 * Estado de un cobro normalizado.
 * pagado: cobrado ≥ importe · impagado: vencido y sin cobrar del todo · pendiente: aún en plazo.
 */
export function estadoCobro(c, today, gracia = 0) {
  if (c.importe <= 0 || num(c.cobrado) >= c.importe - 0.005) return 'pagado';
  if (diffDays(c.vencimiento, today) > gracia) return 'impagado';
  return 'pendiente';
}

/** Renta aplicable a un mes: la última actualización con `desde` ≤ mes, o la renta inicial. */
export function rentaDelMes(contrato, ym) {
  let renta = num(contrato.renta);
  const hist = [...(contrato.rentas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1));
  for (const h of hist) if (h.desde <= ym) renta = num(h.renta);
  return renta;
}

/**
 * Recibos mensuales que debería tener un contrato hasta el mes `hastaYm` (inclusive).
 * Prorratea el primer y último mes si el contrato no los cubre completos.
 * `fin` es la fecha de fin efectiva (null si sigue vigente, p. ej. en prórroga tácita).
 */
export function recibosEsperados(contrato, hastaYm, fin = contrato.fin || null) {
  const out = [];
  if (!contrato.inicio || !(num(contrato.renta) > 0)) return out;
  const ini = contrato.inicio;
  if (fin && fin < ini) return out;
  let ultimoYm = hastaYm;
  if (fin && ymOf(fin) < ultimoYm) ultimoYm = ymOf(fin);
  for (let ym = ymOf(ini); ym <= ultimoYm; ym = addMonths(ym, 1)) {
    const dim = daysInMonth(ym);
    const dias = daysOverlap(ini, fin || monthEnd(ym), monthStart(ym), monthEnd(ym));
    if (dias <= 0) continue;
    const renta = rentaDelMes(contrato, ym);
    const prorrata = contrato.prorratear !== false && dias < dim;
    const importe = r2(prorrata ? (renta * dias) / dim : renta);
    let vencimiento = dayInMonth(ym, contrato.diaPago || 1);
    if (vencimiento < ini) vencimiento = ini;
    if (fin && vencimiento > fin) vencimiento = fin;
    out.push({
      periodo: ym,
      importe,
      vencimiento,
      concepto: prorrata ? `Renta de ${mesLargo(ym)} (${dias}/${dim} días)` : `Renta de ${mesLargo(ym)}`,
    });
  }
  return out;
}

/* ───────────── Hipotecas (sistema francés) ───────────── */

export function cuotaFrancesa(capital, tipoAnual, meses) {
  if (meses <= 0) return 0;
  const r = tipoAnual / 100 / 12;
  if (r === 0) return capital / meses;
  return (capital * r) / (1 - Math.pow(1 + r, -meses));
}

/**
 * Datos base de la hipoteca: capital pendiente al inicio de `mesRef` (antes de pagar la cuota de ese mes),
 * tipo nominal anual vigente, último mes de pago y cuota (si no se indica, se calcula).
 */
export function hipotecaBase(h) {
  const mesRef = h.mesRef;
  const mesFin = h.mesFin;
  const n = monthsDiff(mesRef, mesFin) + 1;
  const capital = num(h.capitalPendiente);
  const cuota = num(h.cuota) > 0 ? num(h.cuota) : cuotaFrancesa(capital, num(h.tipo), n);
  return { mesRef, mesFin, n, capital, cuota, r: num(h.tipo) / 100 / 12, mesInicio: h.mesInicio || null };
}

/**
 * Desglose de la cuota de un mes concreto. Hacia delante amortiza normalmente;
 * hacia atrás reconstruye el capital pendiente con la misma cuota y tipo
 * (exacto si el tipo no ha cambiado), sin pasar de `mesInicio` si se indicó.
 */
export function hipotecaMes(h, ym) {
  const b = hipotecaBase(h);
  const zero = { cuota: 0, intereses: 0, capital: 0, pendiente: 0 };
  if (!(b.capital > 0) || b.n <= 0) return zero;
  if (ym > b.mesFin) return zero;
  // Sin «primera cuota» no se inventan cuotas anteriores al recibo de referencia.
  if (ym < (b.mesInicio || b.mesRef)) return zero;
  const k = monthsDiff(b.mesRef, ym);
  let bal = b.capital;
  if (k >= 0) {
    for (let i = 0; i < k; i++) {
      const int = bal * b.r;
      bal -= Math.min(bal, b.cuota - int);
      if (bal <= 0.005) return zero;
    }
  } else {
    for (let i = 0; i < -k; i++) bal = (bal + b.cuota) / (1 + b.r);
  }
  const intereses = bal * b.r;
  let capital = Math.min(bal, b.cuota - intereses);
  if (ym === b.mesFin) capital = bal; // última cuota liquida el resto
  return { cuota: r2(capital + intereses), intereses: r2(intereses), capital: r2(capital), pendiente: r2(bal) };
}

/** Cuadro de amortización completo desde `desde` hasta el final (máx. `limite` meses). */
export function cuadroAmortizacion(h, desde, limite = 600) {
  const b = hipotecaBase(h);
  const out = [];
  let ym = desde || b.mesRef;
  for (let i = 0; i < limite && ym <= b.mesFin; i++, ym = addMonths(ym, 1)) {
    const m = hipotecaMes(h, ym);
    if (m.cuota <= 0 && i > 0) break;
    out.push({ ym, ...m });
  }
  return out;
}

/* ───────────── Agregados por piso ───────────── */

/** Lo que debe llegar a la cuenta por una reserva: si la plataforma descuenta la comisión, el neto. */
export const esperadoReserva = (r) => r2(num(r.importe) - (r.comisionDescontada ? num(r.comision) : 0));

/** Parte del importe bruto ya cubierta (el pago neto de la plataforma cuenta como cobro completo). */
export function cobradoReserva(r) {
  const esperado = esperadoReserva(r);
  if (!(esperado > 0)) return 0;
  return Math.min(num(r.importe), (Math.min(num(r.cobrado), esperado) / esperado) * num(r.importe));
}

/** Ingreso y comisión de una reserva imputables a un rango de fechas, en proporción a las noches. */
export function reservaEnRango(res, desde, hasta) {
  const total = Math.max(1, diffDays(res.entrada, res.salida));
  const n = nightsInRange(res.entrada, res.salida, desde, hasta);
  const f = n / total;
  return { noches: n, ingreso: num(res.importe) * f, comision: num(res.comision) * f, cobrado: cobradoReserva(res) * f };
}

/**
 * Resultado de un piso en un periodo [desde, hasta] (inclusive).
 * `ctx` = { cobros, reservas, gastos, hipotecas } ya filtrados por piso.
 */
export function resultadoPiso(ctx, desde, hasta, { incluirExtra = true } = {}) {
  const ymDesde = ymOf(desde);
  const ymHasta = ymOf(hasta);
  let ingresos = 0;
  let cobrado = 0;
  let comisiones = 0;
  let noches = 0;
  for (const c of ctx.cobros) {
    if (c.anulado) continue;
    if (c.periodo >= ymDesde && c.periodo <= ymHasta) {
      ingresos += num(c.importe);
      cobrado += Math.min(num(c.cobrado), num(c.importe));
    }
  }
  for (const r of ctx.reservas) {
    if (r.cancelada) {
      // Cancelada: lo cobrado y no devuelto es ingreso del día de entrada previsto.
      if (num(r.cobrado) > 0 && r.entrada >= desde && r.entrada <= hasta) { ingresos += num(r.cobrado); cobrado += num(r.cobrado); }
      continue;
    }
    const x = reservaEnRango(r, desde, hasta);
    ingresos += x.ingreso;
    cobrado += x.cobrado;
    comisiones += x.comision;
    noches += x.noches;
  }
  let gOrd = 0;
  let gExtra = 0;
  for (const g of ctx.gastos) {
    if (g.fecha < desde || g.fecha > hasta) continue;
    if (g.extraordinario) gExtra += num(g.importe);
    else gOrd += num(g.importe);
  }
  let cuota = 0;
  let intereses = 0;
  let amortCapital = 0;
  for (let ym = ymDesde; ym <= ymHasta; ym = addMonths(ym, 1)) {
    for (const h of ctx.hipotecas) {
      const m = hipotecaMes(h, ym);
      cuota += m.cuota;
      intereses += m.intereses;
      amortCapital += m.capital;
    }
  }
  const gastos = gOrd + comisiones + (incluirExtra ? gExtra : 0);
  const neto = ingresos - gastos; // resultado operativo (antes de financiación)
  return {
    ingresos: r2(ingresos),
    cobrado: r2(cobrado),
    pendiente: r2(ingresos - cobrado),
    gastosOrdinarios: r2(gOrd + comisiones),
    gastosExtra: r2(gExtra),
    gastos: r2(gastos),
    comisiones: r2(comisiones),
    neto: r2(neto),
    cuota: r2(cuota),
    intereses: r2(intereses),
    amortCapital: r2(amortCapital),
    beneficio: r2(neto - intereses), // después de intereses, antes de impuestos
    resultado: r2(neto - cuota), // devengado tras hipoteca
    cashflow: r2(cobrado - gastos - cuota), // lo realmente cobrado menos gastos e hipoteca
    noches,
  };
}

export function sumar(rs) {
  const out = {};
  for (const r of rs) for (const [k, v] of Object.entries(r)) out[k] = (out[k] || 0) + (typeof v === 'number' ? v : 0);
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

/** Rentabilidad neta anualizada: resultado operativo × (12 / meses) ÷ inversión. */
export function rentabilidadAnual(neto, meses, inversion) {
  if (!(inversion > 0) || !(meses > 0)) return null;
  return (neto * (12 / meses)) / inversion;
}

/* ───────────── Fiscalidad ───────────── */

/**
 * Amortización de un elemento adquirido el `fecha` por `importe`, en el año `y`,
 * prorrateada por días el primer año y limitada a no superar el importe total.
 */
export function amortizacionAnual(importe, fecha, y, coef) {
  if (!(importe > 0) || !fecha) return 0;
  const y0 = Number(fecha.slice(0, 4));
  if (y < y0) return 0;
  const anual = importe * coef;
  // Lo amortizado hasta el inicio de `y`
  const diasPrimero = diffDays(fecha, `${y0}-12-31`) + 1;
  const primero = (anual * diasPrimero) / daysInYear(y0);
  let acumulado = 0;
  let cuotaY = 0;
  for (let a = y0; a <= y; a++) {
    const c = a === y0 ? primero : anual;
    const posible = Math.max(0, Math.min(c, importe - acumulado));
    if (a === y) cuotaY = posible;
    acumulado += posible;
  }
  return cuotaY;
}

/** Días entre `desde` y `hasta` (inclusive) cubiertos por al menos uno de los intervalos [inicio, fin] (fin null = abierto). */
export function diasCubiertos(intervalos, y, hasta = `${y}-12-31`, desde = `${y}-01-01`) {
  const a0 = dayNum(desde);
  const a1 = dayNum(hasta);
  const tramos = intervalos
    .map(([i, f]) => [Math.max(a0, dayNum(i)), Math.min(a1, f ? dayNum(f) : a1)])
    .filter(([i, f]) => f >= i)
    .sort((x, z) => x[0] - z[0]);
  let total = 0;
  let cur = null;
  for (const t of tramos) {
    if (!cur || t[0] > cur[1] + 1) { if (cur) total += cur[1] - cur[0] + 1; cur = [...t]; }
    else cur[1] = Math.max(cur[1], t[1]);
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

/**
 * Días arrendado del piso entre el 1 de enero de `y` y `hasta`.
 * Turístico: noches ocupadas. Resto: días con algún contrato vigente; si no hay contratos
 * pero sí recibos (cobros manuales), los meses con recibo.
 */
export function diasArrendado(piso, ctx, y, hasta = `${y}-12-31`, desde = `${y}-01-01`) {
  if (piso.modalidad === 'turistico') {
    return (ctx.reservas || []).filter((r) => !r.cancelada).reduce((a, r) => a + nightsInRange(r.entrada, r.salida, desde, hasta), 0);
  }
  const ints = (ctx.contratos || []).map((k) => [k.inicio, k.finEfectivo === undefined ? k.fin || null : k.finEfectivo]);
  const dias = diasCubiertos(ints, y, hasta, desde);
  if (dias > 0) return dias;
  const meses = new Set((ctx.cobros || []).filter((c) => !c.anulado && c.periodo >= ymOf(desde) && c.periodo <= ymOf(hasta)).map((c) => c.periodo));
  return [...meses].reduce((a, m) => a + daysOverlap(monthStart(m), monthEnd(m), desde, hasta), 0);
}

/**
 * Proporción arrendada (0–1) del periodo [1 ene, hasta] para prorratear gastos generales e intereses.
 * `piso.pctFiscal` (si se indica) manda. En el IS el inmueble está afecto a la actividad aunque esté vacío: 100 %.
 */
export function factorArrendado(piso, ctx, y, { regimen = 'IRPF', hasta = `${y}-12-31` } = {}) {
  if (piso.pctFiscal != null && piso.pctFiscal !== '') return Math.min(100, Math.max(0, num(piso.pctFiscal))) / 100;
  if (regimen === 'IS') return 1;
  const periodo = diffDays(`${y}-01-01`, hasta) + 1;
  return Math.min(1, diasArrendado(piso, ctx, y, hasta) / periodo);
}

function primerAnio(ctx) {
  const ys = [
    ...ctx.cobros.map((c) => c.periodo),
    ...ctx.reservas.map((r) => r.entrada),
    ...ctx.gastos.map((g) => g.fecha),
  ].filter(Boolean).map((x) => Number(x.slice(0, 4)));
  return ys.length ? Math.min(...ys) : null;
}

/**
 * Cálculo fiscal anual de un piso.
 * IRPF: límite conjunto de intereses + reparación ≤ ingresos, con arrastre del exceso 4 años, y reducción por vivienda.
 * IS: sin ese límite; amortización del inmueble al 2 %.
 * Si `hoy` cae dentro del año, el cálculo llega solo hasta hoy (año en curso), para no mezclar
 * ingresos parciales con intereses o amortización del año completo.
 */
export function fiscalPiso(piso, ctx, y, regimen, hoy = null) {
  if (regimen !== 'IRPF') return fiscalAnio(piso, ctx, y, regimen, [], hoy).f;
  let pend = [];
  const previo = num(piso.excesoPrevio) > 0 && piso.excesoPrevioAnio ? Number(piso.excesoPrevioAnio) : null;
  let ini;
  if (previo && y > previo) {
    // El exceso declarado es lo pendiente al cierre de ese año: se parte de ahí sin recalcular años ya declarados.
    pend.push({ anio: previo, importe: num(piso.excesoPrevio) });
    ini = Math.max(y - 8, previo + 1);
  } else {
    ini = Math.max(y - 8, Math.min(primerAnio(ctx) ?? y, y));
  }
  if (ini > y) ini = y;
  let r;
  for (let a = ini; a <= y; a++) {
    r = fiscalAnio(piso, ctx, a, regimen, pend, a === y ? hoy : null);
    pend = r.pendientes;
  }
  return r.f;
}

function fiscalAnio(piso, ctx, y, regimen, pendientes, hoy) {
  const desde = `${y}-01-01`;
  const finAnio = `${y}-12-31`;
  const hasta = hoy && hoy >= desde && hoy < finAnio ? hoy : finAnio;
  const enCurso = hasta !== finAnio;
  const res = resultadoPiso(ctx, desde, hasta, { incluirExtra: true });
  const pct = factorArrendado(piso, ctx, y, { regimen, hasta });
  const diasPeriodo = diffDays(desde, hasta) + 1;
  // Amortización del inmueble: proporción del año completo (días arrendado o, en el IS, días en balance).
  let fAmort;
  if (piso.pctFiscal != null && piso.pctFiscal !== '') fAmort = pct * (diasPeriodo / daysInYear(y));
  else if (regimen === 'IS') {
    const inicio = piso.fechaAdquisicion && piso.fechaAdquisicion > desde ? piso.fechaAdquisicion : desde;
    fAmort = inicio > hasta ? 0 : (diffDays(inicio, hasta) + 1) / daysInYear(y);
  } else fAmort = diasArrendado(piso, ctx, y, hasta) / daysInYear(y);
  const coef = COEF[regimen] || COEF.IRPF;
  const grupos = Object.fromEntries(Object.keys(GRUPOS_FISCALES).map((k) => [k, 0]));
  let noDeducible = 0;

  for (const g of ctx.gastos) {
    if (g.fecha < desde || g.fecha > hasta) continue;
    const cat = CAT[g.categoria] || CAT.otros_ded;
    if (cat.trato === 'no' || g.deducible === false) { noDeducible += num(g.importe); continue; }
    // Los gastos ligados a cada estancia o contrato se imputan enteros; los generales, por días arrendado.
    if (cat.trato === 'gasto') grupos[cat.grupo] += num(g.importe) * (cat.directo ? 1 : pct);
  }
  grupos.servicios += res.comisiones;
  grupos.financiacion += res.intereses * pct;

  const amortInm = num(piso.valorConstruccion) * coef.inmueble * fAmort;
  let mejoras = 0;
  let amortMue = 0;
  for (const g of ctx.gastos) {
    if (g.fecha > hasta || g.deducible === false) continue;
    const cat = CAT[g.categoria];
    if (!cat) continue;
    if (cat.trato !== 'amort_inm' && cat.trato !== 'amort_mue') continue;
    const c = cat.trato === 'amort_inm' ? coef.inmueble : coef.muebles;
    // Cuota del periodo: anual (prorrateada desde la compra) o, en el año en curso, hasta hoy.
    const ini = g.fecha > desde ? g.fecha : desde;
    let cuota = amortizacionAnual(num(g.importe), g.fecha, y, c);
    if (enCurso) cuota = Math.min(cuota, (num(g.importe) * c * (diffDays(ini, hasta) + 1)) / daysInYear(y));
    // Proporción arrendada desde que el elemento está en uso.
    let f;
    if (piso.pctFiscal != null && piso.pctFiscal !== '') f = pct;
    else if (regimen === 'IS') f = 1;
    else f = diasArrendado(piso, ctx, y, hasta, ini) / (diffDays(ini, hasta) + 1);
    if (cat.trato === 'amort_inm') mejoras += cuota * Math.min(1, f);
    else amortMue += cuota * Math.min(1, f);
  }
  grupos.amort_inm = amortInm + mejoras;
  grupos.amort_mue = amortMue;

  const ingresos = res.ingresos;
  let exceso = 0;
  let aplicadoPrevio = 0;
  let siguientes = [];
  if (regimen === 'IRPF') {
    const base = Math.max(0, ingresos);
    const limitado = grupos.financiacion + grupos.conservacion;
    if (limitado > base) {
      exceso = limitado - base;
      const f = limitado > 0 ? base / limitado : 0;
      grupos.financiacion *= f;
      grupos.conservacion *= f;
    }
    // Hueco disponible para aplicar excesos de los 4 años anteriores, empezando por el más antiguo.
    let hueco = Math.max(0, base - grupos.financiacion - grupos.conservacion);
    const vivos = pendientes.filter((p) => p.anio < y && p.anio >= y - 4).sort((a, b) => a.anio - b.anio).map((p) => ({ ...p }));
    for (const p of vivos) {
      const usar = Math.min(hueco, p.importe);
      p.importe -= usar;
      hueco -= usar;
      aplicadoPrevio += usar;
    }
    grupos.arrastre = aplicadoPrevio;
    // Se conservan los que siguen vivos y los que aún no son aplicables (de este año o posteriores).
    siguientes = [...vivos.filter((p) => p.importe > 0.005), ...pendientes.filter((p) => p.anio >= y)];
    if (exceso > 0.005) siguientes.push({ anio: y, importe: exceso });
  }
  for (const k of Object.keys(grupos)) grupos[k] = r2(grupos[k]);
  const gastosDeducibles = r2(Object.values(grupos).reduce((a, b) => a + b, 0));
  const rendimientoNeto = r2(ingresos - gastosDeducibles);
  const pctReduccion = regimen === 'IRPF' ? num(piso.reduccion) / 100 : 0;
  const reduccion = r2(rendimientoNeto > 0 ? rendimientoNeto * pctReduccion : 0);
  return {
    pendientes: siguientes,
    f: {
      ingresos,
      grupos,
      gastosDeducibles,
      exceso: r2(exceso),
      arrastreAplicado: r2(aplicadoPrevio),
      pendienteFuturo: r2(siguientes.reduce((a, p) => a + p.importe, 0)),
      rendimientoNeto,
      reduccion,
      rendimientoReducido: r2(rendimientoNeto - reduccion),
      noDeducible: r2(noDeducible),
      pct,
      hasta,
      enCurso,
    },
  };
}

/* ───────────── Avisos ───────────── */

/** Tramo de aviso de un contrato según los días que faltan para su fin (90/60/30 por defecto). */
export function tramoContrato(fin, today, tramos = [90, 60, 30]) {
  if (!fin) return null;
  const dias = diffDays(today, fin);
  if (dias < 0) return { tramo: 0, dias };
  const orden = [...tramos].sort((a, b) => a - b);
  for (const t of orden) if (dias <= t) return { tramo: t, dias };
  return null;
}

/** Normaliza un teléfono español para wa.me (solo dígitos, con prefijo 34 si hace falta). */
export function telefonoWhatsApp(tel) {
  let d = String(tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 9 && /^[6789]/.test(d)) d = '34' + d;
  return d.replace(/\D/g, '');
}

export function rellenarPlantilla(tpl, datos) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (datos[k] != null ? String(datos[k]) : m));
}

/** Reservas que se solapan con [entrada, salida) en el mismo piso. */
export function solapes(reservas, entrada, salida, excluirId) {
  return reservas.filter(
    (r) => !r.cancelada && r.id !== excluirId && dayNum(r.entrada) < dayNum(salida) && dayNum(entrada) < dayNum(r.salida),
  );
}
