import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

test('fechas', () => {
  assert.equal(C.addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(C.addMonths('2026-11', 3), '2027-02');
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.dayInMonth('2026-02', 31), '2026-02-28');
  assert.equal(C.nightsInRange('2026-01-30', '2026-02-03', '2026-02-01', '2026-02-28'), 2);
});

test('recibos con prorrata', () => {
  const r = C.recibosEsperados({ inicio: '2026-01-16', fin: '2026-03-10', renta: 900, diaPago: 5 }, '2026-12');
  assert.equal(r.length, 3);
  assert.equal(r[0].importe, C.r2((900 * 16) / 31));
  assert.equal(r[0].vencimiento, '2026-01-16');
  assert.equal(r[1].importe, 900);
  assert.equal(r[2].importe, C.r2((900 * 10) / 31));
});

test('estado cobro', () => {
  const c = { importe: 100, cobrado: 0, vencimiento: '2026-05-05' };
  assert.equal(C.estadoCobro(c, '2026-05-05'), 'pendiente');
  assert.equal(C.estadoCobro(c, '2026-05-06'), 'impagado');
  assert.equal(C.estadoCobro({ ...c, cobrado: 100 }, '2026-06-01'), 'pagado');
});

test('hipoteca: cuota francesa y reconstrucción hacia atrás', () => {
  const h = { capitalPendiente: 100000, mesRef: '2026-01', tipo: 3, mesFin: '2045-12', cuota: 0 };
  const m0 = C.hipotecaMes(h, '2026-01');
  assert.equal(m0.intereses, 250);
  assert.ok(Math.abs(m0.cuota - C.cuotaFrancesa(100000, 3, 240)) < 0.01);
  assert.equal(C.hipotecaMes(h, '2025-12').cuota, 0, 'sin primera cuota no hay cuotas anteriores');
  const prev = C.hipotecaMes({ ...h, mesInicio: '2020-01' }, '2025-12');
  // capital pendiente anterior menos su amortización = capital de referencia
  assert.ok(Math.abs(prev.pendiente - prev.capital - 100000) < 0.02);
  const ultimo = C.hipotecaMes(h, '2045-12');
  assert.ok(ultimo.pendiente > 0 && ultimo.pendiente < m0.cuota + 1);
  assert.equal(C.hipotecaMes(h, '2046-01').cuota, 0);
  // suma de capital = capital inicial
  const cuadro = C.cuadroAmortizacion(h, '2026-01');
  const cap = cuadro.reduce((a, x) => a + x.capital, 0);
  assert.ok(Math.abs(cap - 100000) < 1, `capital amortizado ${cap}`);
});

test('resultado mensual con reservas prorrateadas', () => {
  const ctx = {
    cobros: [{ periodo: '2026-03', importe: 800, cobrado: 800 }],
    reservas: [{ entrada: '2026-03-30', salida: '2026-04-03', importe: 400, comision: 40, cobrado: 400 }],
    gastos: [{ fecha: '2026-03-10', importe: 100 }, { fecha: '2026-03-12', importe: 500, extraordinario: true }],
    hipotecas: [],
  };
  const r = C.resultadoPiso(ctx, '2026-03-01', '2026-03-31');
  assert.equal(r.ingresos, 1000); // 800 + 2/4 de 400
  assert.equal(r.comisiones, 20);
  assert.equal(r.gastos, 620);
  const sinExtra = C.resultadoPiso(ctx, '2026-03-01', '2026-03-31', { incluirExtra: false });
  assert.equal(sinExtra.gastos, 120);
});

test('amortización anual prorrateada y con tope', () => {
  assert.ok(Math.abs(C.amortizacionAnual(1000, '2026-07-01', 2026, 0.1) - (100 * 184) / 365) < 0.01);
  assert.equal(C.amortizacionAnual(1000, '2026-07-01', 2027, 0.1), 100);
  const total = Array.from({ length: 12 }, (_, i) => C.amortizacionAnual(1000, '2026-07-01', 2026 + i, 0.1)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1000) < 0.01);
});

test('fiscal IRPF: límite intereses + reparación y reducción', () => {
  const piso = { valorConstruccion: 0, reduccion: 50, pctFiscal: 100 };
  const ctx = {
    cobros: [{ periodo: '2026-01', importe: 1000, cobrado: 1000 }],
    reservas: [],
    gastos: [{ fecha: '2026-02-01', importe: 3000, categoria: 'reparacion' }, { fecha: '2026-02-01', importe: 200, categoria: 'ibi' }],
    hipotecas: [],
  };
  const f = C.fiscalPiso(piso, ctx, 2026, 'IRPF');
  assert.equal(f.grupos.conservacion, 1000);
  assert.equal(f.exceso, 2000);
  assert.equal(f.rendimientoNeto, -200);
  assert.equal(f.reduccion, 0);
  const is = C.fiscalPiso(piso, ctx, 2026, 'IS');
  assert.equal(is.rendimientoNeto, -2200);
});

test('whatsapp', () => {
  assert.equal(C.telefonoWhatsApp('612 34 56 78'), '34612345678');
  assert.equal(C.telefonoWhatsApp('+44 7700 900123'), '447700900123');
});

test('num: formatos españoles', () => {
  assert.equal(C.num('12,50'), 12.5);
  assert.equal(C.num('1.234,56'), 1234.56);
  assert.equal(C.num('1.234'), 1234);
  assert.equal(C.num('12.5'), 12.5);
  assert.equal(C.num('1 250 €'), 1250);
});

test('actualización de renta por meses y vencimiento dentro del contrato', () => {
  const k = { inicio: '2026-01-01', fin: '2026-06-10', renta: 800, diaPago: 15, rentas: [{ desde: '2026-04', renta: 824 }] };
  const r = C.recibosEsperados(k, '2026-12');
  assert.deepEqual(r.map((x) => x.importe), [800, 800, 800, 824, 824, C.r2((824 * 10) / 30)]);
  assert.equal(r[5].vencimiento, '2026-06-10');
  assert.equal(C.addMonthsISO('2028-02-29', 12), '2029-02-28');
});

test('IRPF: arrastre del exceso a años siguientes', () => {
  const piso = { valorConstruccion: 0, reduccion: 0, pctFiscal: 100 };
  const ctx = {
    cobros: [{ periodo: '2026-01', importe: 1000 }, { periodo: '2027-01', importe: 5000 }],
    reservas: [], hipotecas: [],
    gastos: [{ fecha: '2026-02-01', importe: 3000, categoria: 'reparacion' }, { fecha: '2027-02-01', importe: 500, categoria: 'reparacion' }],
  };
  const f26 = C.fiscalPiso(piso, ctx, 2026, 'IRPF');
  assert.equal(f26.exceso, 2000);
  const f27 = C.fiscalPiso(piso, ctx, 2027, 'IRPF');
  assert.equal(f27.arrastreAplicado, 2000);
  assert.equal(f27.rendimientoNeto, 2500);
});

test('días arrendado: unión de contratos y noches turísticas', () => {
  assert.equal(C.diasCubiertos([['2026-01-01', '2026-01-31'], ['2026-01-15', '2026-02-10']], 2026), 41);
  const f = C.factorArrendado({ modalidad: 'tradicional' }, { contratos: [{ inicio: '2026-07-01', fin: null }] }, 2026);
  assert.ok(Math.abs(f - 184 / 365) < 1e-9);
  const t = C.factorArrendado({ modalidad: 'turistico' }, { reservas: [{ entrada: '2026-12-30', salida: '2027-01-02' }] }, 2026);
  assert.ok(Math.abs(t - 2 / 365) < 1e-9);
});

test('reserva con pago neto de plataforma cuenta como cobrada', () => {
  const r = { importe: 500, comision: 75, comisionDescontada: true, cobrado: 425 };
  assert.equal(C.esperadoReserva(r), 425);
  assert.equal(C.cobradoReserva(r), 500);
});

import * as S from '../js/store.js';

const base = () => {
  const s = S.estadoVacio();
  s.pisos.push({ id: 'p', modalidad: 'tradicional' });
  s.unidades.push({ id: 'u', pisoId: 'p' });
  return s;
};

test('prórroga tácita y renovación sin recibos duplicados', () => {
  const s = base();
  const a = { id: 'a', pisoId: 'p', unidadId: 'u', renta: 800, diaPago: 1, inicio: '2025-08-01', fin: '2026-07-31' };
  s.contratos.push(a);
  S.sincronizar(s, '2026-10-14');
  assert.equal(s.cobros.filter((c) => c.periodo >= '2026-08').length, 3, 'prórroga sigue cobrando');
  const b = { id: 'b', pisoId: 'p', unidadId: 'u', renta: 824, diaPago: 1, inicio: '2026-08-01', fin: '2027-07-31' };
  s.contratos.push(b);
  S.reajustarUnidad(s, b, '2026-10-14');
  for (const ym of ['2026-08', '2026-09', '2026-10']) assert.equal(s.cobros.filter((c) => c.periodo === ym).length, 1, ym);
});

test('migración v1: contratos vencidos se finalizan', () => {
  const s = base();
  s.version = 1;
  s.contratos.push({ id: 'a', pisoId: 'p', unidadId: 'u', renta: 700, diaPago: 1, inicio: '2023-07-01', fin: '2024-06-30' });
  const m = S.migrar(JSON.parse(JSON.stringify(s)));
  S.sincronizar(m, '2026-10-14');
  assert.equal(m.cobros.filter((c) => c.periodo > '2024-06').length, 0);
});

test('exceso previo declarado no se pierde con datos de ese año', () => {
  const piso = { valorConstruccion: 0, reduccion: 0, pctFiscal: 100, excesoPrevio: 3000, excesoPrevioAnio: 2025 };
  const ctx = { cobros: [{ periodo: '2026-01', importe: 10000 }], reservas: [], hipotecas: [], gastos: [{ fecha: '2025-11-01', importe: 60, categoria: 'comunidad' }] };
  assert.equal(C.fiscalPiso(piso, ctx, 2026, 'IRPF').arrastreAplicado, 3000);
});

test('regenerar gasto fijo conserva importes pasados', () => {
  const s = base();
  const rec = { id: 'r', pisoId: 'p', categoria: 'comunidad', concepto: 'Comunidad', importe: 80, cadaMeses: 1, dia: 3, desde: '2025-08-03', omitidos: [] };
  s.recurrentes.push(rec);
  S.sincronizar(s, '2026-10-14');
  rec.importe = 95;
  rec.desde = '2025-08-10';
  rec.dia = 10;
  S.regenerarRecurrente(s, rec, '2026-10-14');
  const g = s.gastos.filter((x) => x.recurrenteId === 'r');
  assert.equal(g.length, 15);
  assert.ok(g.every((x) => x.importe === 80 && x.fecha.endsWith('-10')));
});

test('IS sin prorrateo por días; año en curso hasta hoy', () => {
  const piso = { modalidad: 'habitaciones', valorConstruccion: 100000 };
  const ctx = { cobros: [], reservas: [], hipotecas: [], gastos: [], contratos: [{ inicio: '2026-07-01', fin: null }] };
  const is = C.fiscalPiso(piso, ctx, 2025, 'IS');
  assert.equal(is.grupos.amort_inm, 2000);
  const irpf = C.fiscalPiso(piso, ctx, 2026, 'IRPF', '2026-10-14');
  assert.ok(irpf.enCurso && Math.abs(irpf.grupos.amort_inm - 3000 * (106 / 365)) < 0.01);
});

test('piso sin contratos pero con recibos: prorrateo por meses con recibo', () => {
  const f = C.factorArrendado({ modalidad: 'tradicional' }, { contratos: [], cobros: [{ periodo: '2025-01' }, { periodo: '2025-02' }] }, 2025);
  assert.ok(Math.abs(f - 59 / 365) < 1e-9);
});

test('nuevo inquilino conserva la deuda de la prórroga del anterior y sus importes', () => {
  const s = base();
  const a = { id: 'a', pisoId: 'p', unidadId: 'u', renta: 500, diaPago: 1, inicio: '2025-07-01', fin: '2026-06-30' };
  s.contratos.push(a);
  S.sincronizar(s, '2026-10-14');
  a.rentas = [{ desde: '2026-10', renta: 550 }];
  S.reajustarRecibos(s, a, '2026-10-14', '2026-10');
  const b = { id: 'b', pisoId: 'p', unidadId: 'u', renta: 900, diaPago: 1, inicio: '2026-09-01', fin: '2027-08-31' };
  s.contratos.push(b);
  S.reajustarUnidad(s, b, '2026-10-14');
  const deA = s.cobros.filter((c) => c.contratoId === 'a').map((c) => c.periodo);
  assert.ok(deA.includes('2026-07') && deA.includes('2026-08') && !deA.includes('2026-09'));
  assert.ok(s.cobros.filter((c) => c.contratoId === 'a').every((c) => c.importe === 500));
});

test('amortización de mobiliario sin doble prorrateo', () => {
  const ctx = { cobros: [], reservas: [], hipotecas: [], contratos: [{ inicio: '2025-07-01', fin: null }], gastos: [{ fecha: '2025-07-01', importe: 10000, categoria: 'mobiliario' }] };
  const f = C.fiscalPiso({ modalidad: 'tradicional' }, ctx, 2025, 'IRPF');
  assert.ok(Math.abs(f.grupos.amort_mue - (1000 * 184) / 365) < 0.02, f.grupos.amort_mue);
  const is = C.fiscalPiso({ modalidad: 'habitaciones', fechaAdquisicion: '2025-07-01' }, ctx, 2025, 'IS');
  assert.ok(Math.abs(is.grupos.amort_mue - (1000 * 184) / 365) < 0.02);
});

test('exceso declarado no se suma en su propio año', () => {
  const piso = { pctFiscal: 100, excesoPrevio: 5000, excesoPrevioAnio: 2025 };
  const ctx = { cobros: [{ periodo: '2025-01', importe: 100 }], reservas: [], hipotecas: [], gastos: [] };
  assert.equal(C.fiscalPiso(piso, ctx, 2025, 'IRPF').pendienteFuturo, 0);
});
