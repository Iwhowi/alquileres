// Datos de ejemplo relativos a la fecha de hoy, para explorar la aplicación.
import { estructuraInicial, sincronizar, uid } from './store.js';
import { addDays, addMonths, ymOf, todayISO, dayInMonth } from './calc.js';

export function datosDemo(today = todayISO()) {
  const s = estructuraInicial();
  s.ajustes.demo = true;
  const ym = ymOf(today);
  const [yo, soc] = s.titulares;
  yo.nombre = 'Personal';
  soc.nombre = 'Inversiones Norte SL';
  const info = [
    ['Mayor 12, 3.º A', 'C/ Mayor 12, 3.º A', 168000, 95000, -86],
    ['Constitución 45, 1.º B', 'Av. Constitución 45, 1.º B', 142000, 80000, -60],
    ['Luna 8, 2.º', 'C/ Luna 8, 2.º', 155000, 90000, -50],
    ['Apartamento Catedral', 'Pl. Catedral 3, 4.º', 210000, 120000, -40],
    ['Sol 22, 4.º C', 'C/ Sol 22, 4.º C', 176000, 100000, -30],
    ['Plaza España 3, 5.º D', 'Pl. España 3, 5.º D', 189000, 110000, -26],
  ];
  s.pisos.forEach((p, i) => {
    const [nombre, dir, precio, constr, mesesAtras] = info[i];
    Object.assign(p, {
      nombre,
      direccion: dir,
      precioAdquisicion: precio,
      valorConstruccion: constr,
      fechaAdquisicion: dayInMonth(addMonths(ym, mesesAtras), 10),
    });
  });
  const [p1, p2, p3, p4, p5, p6] = s.pisos;
  const uds = (p) => s.unidades.filter((u) => u.pisoId === p.id);
  const desde = addMonths(ym, -14);
  const contrato = (p, u, nombre, tel, renta, ini, fin, dia = 5) => {
    const k = { id: uid(), pisoId: p.id, unidadId: u.id, inquilino: nombre, telefono: tel, email: '', dni: '', renta, diaPago: dia, inicio: ini, fin, fianza: renta, prorratear: true, notas: '', avisosHechos: [] };
    s.contratos.push(k);
    return k;
  };
  contrato(p1, uds(p1)[0], 'Laura Martín', '612345678', 950, `${addMonths(ym, -40)}-01`, addDays(today, 52));
  contrato(p2, uds(p2)[0], 'Javier Ortega', '623456789', 820, `${addMonths(ym, -20)}-01`, dayInMonth(addMonths(ym, 16), 28));
  const nombresHab = [
    ['Marta Ruiz', '634567890', 420], ['Pablo Gil', '645678901', 390], ['Sara León', '656789012', 410], ['Diego Pardo', '667890123', 380],
    ['Irene Vidal', '678901234', 450], ['Hugo Serra', '689012345', 430], ['Nerea Cano', '690123456', 440], ['Álex Romero', '611223344', 400], ['Lucía Moya', '622334455', 395],
    ['Iván Castro', '633445566', 415], ['Claudia Rey', '644556677', 425], ['Óscar Lago', '655667788', 405], ['Elena Sanz', '666778899', 435],
  ];
  let n = 0;
  for (const p of [p3, p5, p6]) {
    uds(p).forEach((u, i) => {
      const [nom, tel, renta] = nombresHab[n++ % nombresHab.length];
      const finOffset = [25, 80, 200, 320][i % 4];
      contrato(p, u, nom, tel, renta, `${addMonths(ym, -10 - i)}-01`, addDays(today, finOffset), 1 + i);
    });
  }
  sincronizar(s, today);
  // Marca casi todo como cobrado, salvo algunos recibos recientes.
  const impagados = new Set();
  const recientes = s.cobros.filter((c) => c.periodo === ym || c.periodo === addMonths(ym, -1));
  recientes.filter((_, i) => i % 6 === 2).forEach((c) => impagados.add(c.id));
  for (const c of s.cobros) {
    if (impagados.has(c.id) || c.vencimiento > today) continue;
    c.cobrado = c.importe;
    c.fechaCobro = c.vencimiento;
  }
  // Reservas del apartamento turístico.
  const canales = ['Airbnb', 'Booking', 'Directo'];
  const huespedes = ['Familia Ferrer', 'Tom Becker', 'Anna Rossi', 'Lucas Moreau', 'Ines Silva', 'Mark Evans', 'Julia Novak', 'Carlos Peña', 'Sophie Laurent', 'Pedro Álvarez'];
  let d = addDays(`${addMonths(ym, -5)}-01`, 0);
  const tope = addDays(today, 45);
  let i = 0;
  while (d < tope) {
    const noches = 2 + ((i * 7) % 5);
    const salida = addDays(d, noches);
    const canal = canales[i % 3];
    const precio = 95 + ((i * 13) % 40);
    const importe = noches * precio + 45;
    const comision = canal === 'Airbnb' ? importe * 0.155 : canal === 'Booking' ? importe * 0.15 : 0;
    s.reservas.push({
      id: uid(), pisoId: p4.id, huesped: huespedes[i % huespedes.length], telefono: `6001${String(10000 + i * 137).slice(-5)}`, canal,
      entrada: d, salida, huespedes: 2 + (i % 3), importe, comision: Math.round(comision * 100) / 100, comisionDescontada: canal !== 'Directo',
      cobrado: 0, fechaCobro: '', vencimiento: '', notas: '', cancelada: false,
    });
    const r = s.reservas[s.reservas.length - 1];
    const neto = canal === 'Directo' ? importe : Math.round((importe - r.comision) * 100) / 100;
    if (d < addDays(today, -12) || (canal === 'Directo' && d <= today && i % 7 !== 3)) { r.cobrado = neto; r.fechaCobro = d; }
    d = addDays(salida, i % 4 === 0 ? 0 : 1 + (i % 3));
    i++;
  }
  // Hipotecas.
  s.hipotecas.push(
    { id: uid(), pisoId: p1.id, entidad: 'Banco Ejemplo', capitalPendiente: 98000, mesRef: ym, tipo: 2.9, mesFin: addMonths(ym, 240), cuota: 0, mesInicio: addMonths(ym, -86), notas: '' },
    { id: uid(), pisoId: p4.id, entidad: 'Caja Ejemplo', capitalPendiente: 142000, mesRef: ym, tipo: 3.2, mesFin: addMonths(ym, 300), cuota: 0, mesInicio: addMonths(ym, -40), notas: '' },
    { id: uid(), pisoId: p5.id, entidad: 'Banco Ejemplo', capitalPendiente: 120000, mesRef: ym, tipo: 3.5, mesFin: addMonths(ym, 280), cuota: 0, mesInicio: addMonths(ym, -30), notas: '' },
  );
  // Gastos recurrentes.
  const rec = (p, categoria, concepto, importe, cadaMeses, dia) =>
    s.recurrentes.push({ id: uid(), pisoId: p.id, categoria, concepto, importe, cadaMeses, dia, desde: dayInMonth(desde, dia), hasta: '', omitidos: [], deducible: true });
  for (const p of s.pisos) {
    rec(p, 'comunidad', 'Cuota de comunidad', 60 + (p.nombre.length % 4) * 10, 1, 3);
    rec(p, 'seguro', 'Seguro de hogar', 240 + (p.nombre.length % 3) * 30, 12, 15);
    rec(p, 'ibi', 'IBI', 380 + (p.nombre.length % 5) * 25, 12, 20);
    if (p.modalidad !== 'tradicional') rec(p, 'suministros', 'Luz, agua e internet', 140 + (p.nombre.length % 4) * 15, 1, 12);
  }
  rec(p4, 'limpieza', 'Limpieza y lavandería', 420, 1, 28);
  sincronizar(s, today);
  // Gastos puntuales y extraordinarios.
  const g = (p, offset, categoria, concepto, importe, extraordinario = false) =>
    s.gastos.push({ id: uid(), pisoId: p.id, fecha: addDays(today, offset), categoria, concepto, proveedor: '', importe, extraordinario, deducible: true });
  g(p1, -12, 'reparacion', 'Fontanero: cambio de grifo', 85);
  g(p3, -3, 'reparacion', 'Cerrajero', 60);
  g(p4, -20, 'consumibles', 'Reposición de menaje y amenities', 74.5);
  g(p5, -45, 'reparacion', 'Caldera nueva', 1850, true);
  g(p6, -7, 'mobiliario', 'Colchones y somieres (2)', 640, true);
  g(p2, -60, 'gestion', 'Asesoría fiscal (renta)', 120);
  return s;
}
