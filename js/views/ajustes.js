import { hayDeshacer } from '../excel.js';
import { html, raw, fmtFecha, ICON } from '../ui.js';
import { app, pisosDe } from '../state.js';

export function vistaAjustes() {
  const s = app.s;
  const a = s.ajustes;
  return html`
    <header class="page-head"><div><h1>Ajustes</h1><p class="muted">Titulares, avisos, mensajes y copias de seguridad</p></div></header>

    <section class="card">
      <div class="card-head"><h2>Titulares</h2><button class="btn btn-sm" data-action="nuevo-titular">${raw(ICON.plus)}<span>Titular</span></button></div>
      <ul class="list">
        ${s.titulares.map((t) => html`
          <li class="row">
            <div class="row-main"><div class="row-title"><strong>${t.nombre}</strong>${t.nif ? html`<span class="muted"> · ${t.nif}</span>` : ''}</div>
            <div class="row-sub">${t.tipo === 'sociedad' ? 'Sociedad · Impuesto de Sociedades' : 'Persona física · IRPF'} · ${pisosDe(t.id).length} pisos · tipo estimado ${t.tipoEstimado} %</div></div>
            <div class="row-actions"><button class="icon-btn" data-action="editar-titular" data-id="${t.id}" aria-label="Editar">${raw(ICON.edit)}</button></div>
          </li>`)}
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>Avisos y mensajes</h2></div>
      <form data-form="ajustes" class="form-grid">
        <label class="field"><span class="field-label">Días de cortesía antes de marcar impagado</span><input type="number" name="gracia" min="0" max="30" value="${a.gracia}"><small class="field-help">0 = el día siguiente al vencimiento ya figura como impagado. El mismo día del vencimiento aparece el aviso «Vence hoy».</small></label>
        <label class="field"><span class="field-label">Avisos de fin de contrato (días antes)</span><input name="tramos" value="${(a.tramos || [90, 60, 30]).join(', ')}" pattern="^\\s*\\d+(\\s*,\\s*\\d+)*\\s*$"><small class="field-help">Separados por comas.</small></label>
        <label class="field span2"><span class="field-label">Recordatorio de impago</span><textarea name="impago" rows="3">${a.plantillas.impago}</textarea></label>
        <label class="field span2"><span class="field-label">Recordatorio el día del vencimiento</span><textarea name="hoy" rows="2">${a.plantillas.hoy}</textarea></label>
        <label class="field span2"><span class="field-label">Varios recibos pendientes</span><textarea name="varios" rows="3">${a.plantillas.varios}</textarea></label>
        <label class="field span2"><span class="field-label">Pago pendiente de reserva turística</span><textarea name="reserva" rows="2">${a.plantillas.reserva}</textarea></label>
        <p class="foot-note span2">Variables: <code>{nombre}</code> <code>{concepto}</code> <code>{importe}</code> <code>{fecha}</code> <code>{piso}</code> <code>{dias}</code> <code>{lista}</code></p>
        <div class="span2 form-actions"><button type="button" class="btn btn-ghost" data-action="plantillas-defecto">Restaurar textos</button><button class="btn btn-primary" type="submit">Guardar</button></div>
      </form>
    </section>

    <section class="card excel-card" id="excel">
      <div class="card-head"><h2>Importar tu Excel o gestionar todo desde Excel</h2></div>
      <p class="muted"><b>¿Ya llevabas tus pisos en una hoja de cálculo?</b> Súbela tal cual (Excel, CSV o LibreOffice, con el formato que tenga). La app reconoce qué hay en cada hoja y cada columna —pisos, inquilinos, gastos, cobros, reservas, hipotecas o tablas por meses—, te enseña lo que ha entendido para que lo corrijas y crea todo. Lo que ya tengas no se duplica ni se borra.</p>
      <p class="muted small">También puedes descargar un Excel con <b>todos tus datos</b>, editarlo y volver a subirlo: las filas con ID se actualizan, las nuevas se crean y las marcadas con <b>Borrar = sí</b> se eliminan.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="excel-exportar">${raw(ICON.download)}<span>Descargar Excel con mis datos</span></button>
        <label class="btn">${raw(ICON.upload)}<span>Importar mi Excel</span><input type="file" accept=".xlsx,.xls,.ods,.csv,.numbers,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" data-import="xlsx" hidden></label>
        ${hayDeshacer() ? html`<button class="btn btn-ghost" data-action="excel-deshacer">Deshacer última importación</button>` : ''}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Datos y copias de seguridad</h2></div>
      <p class="muted">Todo se guarda solo en este dispositivo y navegador. Para usarlo en el móvil y en el Mac, exporta la copia en uno e impórtala en el otro. La copia JSON no lleva las fotos y documentos: para pasarlos usa la copia con documentos (ZIP). Última copia: <b>${a.ultimoBackup ? fmtFecha(a.ultimoBackup) : 'nunca'}</b>. Documentos guardados: <b>${s.docs.length}</b>.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="exportar-json">${raw(ICON.download)}<span>Copia completa (JSON)</span></button>
        <button class="btn" data-action="exportar-zip">${raw(ICON.download)}<span>Copia con documentos (ZIP)</span></button>
        <label class="btn">${raw(ICON.upload)}<span>Restaurar copia (JSON o ZIP)</span><input type="file" accept=".json,.zip,application/json,application/zip" data-import="json" hidden></label>
      </div>
      <h3 class="sub-h">Exportar a CSV (Excel, Numbers)</h3>
      <div class="btn-row">
        ${[['cobros', 'Cobros'], ['gastos', 'Gastos'], ['reservas', 'Reservas'], ['contratos', 'Contratos'], ['resumen', 'Resumen mensual por piso'], ['hipotecas', 'Cuadro de hipotecas']].map(([k, t]) => html`<button class="btn btn-sm" data-action="exportar-csv" data-tabla="${k}">${t}</button>`)}
      </div>
      <h3 class="sub-h">Importar desde CSV</h3>
      <p class="muted small">Columnas reconocidas — gastos: <code>fecha; piso; categoria; concepto; importe; extraordinario; proveedor</code>. Reservas: <code>piso; huesped; telefono; canal; entrada; salida; importe; comision; cobrado</code>. El piso puede ser su nombre exacto. La primera fila debe ser la cabecera; puedes partir de un CSV exportado.</p>
      <div class="btn-row">
        <label class="btn btn-sm">${raw(ICON.upload)}<span>Gastos</span><input type="file" accept=".csv,text/csv" data-import="csv-gastos" hidden></label>
        <label class="btn btn-sm">${raw(ICON.upload)}<span>Reservas</span><input type="file" accept=".csv,text/csv" data-import="csv-reservas" hidden></label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Instalar en el móvil y el Mac</h2></div>
      <ul class="steps">
        <li><b>iPhone:</b> abre la app en Safari → botón Compartir → «Añadir a pantalla de inicio».</li>
        <li><b>Android:</b> Chrome → menú ⋮ → «Instalar aplicación».</li>
        <li><b>Mac:</b> Safari → Archivo → «Añadir al Dock», o Chrome → icono de instalar en la barra de direcciones.</li>
      </ul>
      <p class="muted small">Funciona sin conexión una vez instalada.</p>
    </section>

    <section class="card card-danger">
      <div class="card-head"><h2>Zona delicada</h2></div>
      <div class="btn-row">
        ${a.demo ? html`<button class="btn" data-action="quitar-demo">Quitar datos de ejemplo y empezar</button>` : html`<button class="btn" data-action="cargar-demo">Ver con datos de ejemplo</button>`}
        <button class="btn btn-danger" data-action="borrar-todo">${raw(ICON.trash)}<span>Borrar todos los datos</span></button>
      </div>
    </section>
    <p class="foot-note center">Gestión de alquileres · v${app.version}</p>`;
}
