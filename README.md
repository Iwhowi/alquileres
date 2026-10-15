# Gestión de alquileres

PWA en español para llevar 6 pisos de alquiler desde el móvil y el Mac: cobros, impagos con
recordatorio por WhatsApp, vencimiento de contratos, gastos con su tratamiento fiscal, hipotecas,
rentabilidad mensual y calendario del piso turístico. No tiene servidor ni cuentas: los datos se
guardan en el navegador del dispositivo.

## Abrirla

Cualquier servidor estático sirve (los service workers no funcionan con `file://`):

```bash
cd gestion-alquileres
npx http-server -c-1 -p 8080 .      # o: python3 -m http.server 8080
```

Abre `http://localhost:8080`. Para tenerla en el móvil, publícala en un hosting estático con
HTTPS (GitHub Pages, Netlify, Cloudflare Pages…) e instálala:

- **iPhone**: Safari → Compartir → «Añadir a pantalla de inicio».
- **Android**: Chrome → ⋮ → «Instalar aplicación».
- **Mac**: Safari → Archivo → «Añadir al Dock», o el icono de instalar de Chrome.

Una vez instalada funciona sin conexión.

## Primer uso

La pantalla de bienvenida ofrece:

1. **Empezar con mi cartera**: crea 2 titulares (tú y tu sociedad) y los 6 pisos vacíos:
   2 tradicionales, 1 por habitaciones y 1 turístico a tu nombre; 2 por habitaciones de la sociedad.
2. **Ver con datos de ejemplo**: datos ficticios para explorar; se quitan desde Ajustes.
3. **Empezar desde mi Excel**: sube la hoja de cálculo que ya usabas, con el formato que tenga.
4. **Restaurar una copia** JSON exportada desde otro dispositivo.

Después, en cada piso: datos (precio de compra, valor de construcción, reducción IRPF), contratos
por habitación o vivienda, hipoteca y gastos fijos (comunidad, IBI, seguro, suministros).

## Qué hace

| Área | Detalle |
|---|---|
| Cobros | Recibos mensuales generados desde cada contrato (con prorrata del primer y último mes), reservas turísticas y cobros manuales. Estado cobrado / en plazo / impagado, pagos parciales. |
| Impagos | Aviso el mismo día del vencimiento («Vence hoy») y como impagado a partir del día siguiente (configurable). Botón de WhatsApp con el mensaje ya redactado, agrupando varios recibos de la misma persona; botón para copiarlo. |
| Contratos | Avisos a 90, 60 y 30 días del fin (configurables), marcar como visto, renovar con actualización de renta, finalizar con ajuste del último recibo. |
| Gastos | Alta rápida, gastos fijos periódicos que se apuntan solos, extraordinarios, categorías con su grupo fiscal. Mejoras y mobiliario se amortizan. |
| Hipotecas | Sistema francés a partir del capital pendiente del último recibo; separa intereses (deducibles) y capital. |
| Panel | Ingresos, gastos, hipoteca, neto operativo, cash-flow y rentabilidad neta anualizada por piso, por titular y total; gráfico de 12 meses; ocupación del turístico. |
| Calendario | Ocupación del turístico con entradas y salidas, canal, ocupación, precio medio y RevPAR. |
| Fiscal | Rendimiento del capital inmobiliario por piso (IRPF, modelo 100) con límite de intereses + reparación y reducción por vivienda; resultado para el Impuesto de Sociedades. Exportación CSV para el asesor. |
| Datos | Copia completa en JSON (exportar / restaurar), CSV de cobros, gastos, reservas, contratos, resumen mensual e hipotecas; importación de gastos y reservas desde CSV. Excel editable con todos los datos (exportar e importar). |

### Definiciones

- **Ingresos**: criterio de devengo (el recibo del mes, o la parte de cada reserva según las noches del mes).
- **Neto operativo** = ingresos − gastos (incluye comisiones de plataformas).
- **Cash-flow** = neto operativo − cuota de hipoteca (intereses + capital).
- **Rentabilidad neta** = neto operativo anualizado ÷ precio de adquisición total.

Los cálculos fiscales son una estimación orientativa; revísalos con tu asesor.

## Justificantes y documentos

En cada gasto, contrato, hipoteca, reserva y en la ficha de cada piso hay una zona para **hacer una
foto** (abre la cámara del móvil) o **adjuntar** una imagen o un PDF. El alta rápida de gastos tiene
también su botón «Ticket». Las fotos se reducen para ocupar poco y se guardan en el dispositivo
(IndexedDB).

En **Fiscal → Justificantes para el gestor** se ve qué gastos deducibles no tienen ticket o factura y
se descarga (o se comparte desde el móvil) un ZIP del ejercicio: carpetas por inmueble con gastos,
contratos, reservas, hipotecas y documentos del piso, más `indice.csv`, el resumen fiscal y la lista
de lo que falta. Conserva los justificantes al menos 4 años.

La copia JSON no incluye los archivos: para pasarlos a otro dispositivo usa **Ajustes → Copia con
documentos (ZIP)** y restáurala con «Restaurar copia».

## Importar tu propio Excel (cualquier formato)

**Ajustes → Importar mi Excel** (o «Empezar desde mi Excel» en la bienvenida) acepta `.xlsx`,
`.numbers` (Apple Numbers), `.ods` y `.csv` hechos por cualquiera, sin plantilla. Un asistente analiza cada hoja:

- **Qué contiene**: gastos, ingresos o cobros de alquiler, movimientos mezclados (extracto del banco,
  con importes positivos y negativos o columnas Debe/Haber), reservas turísticas, inquilinos o
  contratos, pisos, hipotecas, o una **tabla por meses** (conceptos o pisos en filas y Enero, Febrero…
  en columnas, con secciones INGRESOS / GASTOS).
- **Varias tablas en una misma hoja**: una debajo de otra o una al lado de otra (separadas por filas
  o columnas vacías, o por una nueva fila de títulos), cada una con su título («INQUILINOS»,
  «GASTOS 2025»…). Se separan y cada tabla se trata por su cuenta. En Numbers se leen todas las
  tablas de cada hoja.
- **Qué es cada columna**, por su título (Fecha, F. valor, Inmueble, Vivienda, Descripción, Total (€),
  Alquiler €/mes, Llegada, Check-in, Móvil…, también en inglés) y por sus valores (fechas, importes,
  sí/no). La cabecera puede estar en cualquier fila; las filas de totales se ignoran.
- **Los pisos**: los nombres que aparecen en columnas, filas o nombres de hoja («Piso 1», «Ático
  Centro»). Para cada uno se elige si es un piso que ya está en la app, uno nuevo o el mismo que otro
  escrito de otra forma («Mayor 12» = «C/ Mayor 12, 2.º A»). La modalidad se deduce (reservas →
  turístico, varias habitaciones → por habitaciones).
- **Categorías de gasto** por el concepto o el proveedor (comunidad, IBI, Endesa → suministros,
  fontanero → reparación, Mapfre → seguro…). Las cuotas de hipoteca se importan como no deducibles.

Todo se puede corregir con desplegables antes de continuar. Después se ve el resumen habitual y se
puede deshacer. Los cobros de un inquilino se enlazan a su contrato y lo que ya estaba en la app no
se duplica, así que importar dos veces el mismo archivo no repite nada.

Los archivos de Numbers se leen con [SheetJS](https://sheetjs.com) (Apache 2.0, incluido en
`js/vendor/`), que se carga solo al elegir un `.numbers`. Si un archivo de Numbers no se puede leer,
la app indica cómo exportarlo a Excel.

## Gestionar todo desde Excel

**Ajustes → Gestionar todo desde Excel → Descargar Excel con mis datos** genera un libro con una
hoja por tipo de dato: Titulares, Pisos, Habitaciones, Contratos, Hipotecas, Gastos fijos, Gastos,
Cobros, Reservas y Ajustes, más una hoja LEEME con las instrucciones. Las columnas de piso,
titular, modalidad, categoría, canal y sí/no tienen desplegables.

Edítalo en Excel, Numbers o Google Sheets y vuelve a importarlo con **Importar Excel**:

- Fila con **ID** → se actualiza ese registro (no cambies el ID).
- Fila **sin ID** → se crea (un piso nuevo, un contrato, un gasto, un pago, una reserva…).
- Columna **Borrar = sí** → se elimina. Los recibos automáticos se anulan y los apuntes de gastos
  fijos se omiten, para que no vuelvan a generarse.
- **Celda vacía** → no cambia nada. Para vaciar un campo escribe `-`.
- Pisos, titulares y habitaciones se indican por su nombre; un titular que no existe se crea.
- Fechas en `dd/mm/aaaa` o fecha de Excel; meses en `aaaa-mm`; importes con coma o punto.

Antes de aplicar se muestra un resumen por hoja (nuevos, cambiados, borrados y filas con error, que
no se importan). Los datos anteriores se guardan y **Deshacer última importación** los recupera.
También sirve un Excel hecho a mano: basta con hojas que se llamen como las de la app y una fila
de cabecera con sus títulos (Nombre, Piso, Fecha, Importe…).

## Sincronizar móvil y Mac

No hay nube: exporta la copia JSON en un dispositivo (por ejemplo a iCloud Drive) y restáurala en
el otro. El panel avisa si la última copia tiene más de un mes.

## Desarrollo

Sin dependencias ni compilación. Estructura:

```
index.html, manifest.webmanifest, sw.js, css/app.css, icons/
js/calc.js      cálculos puros (fechas, cobros, hipoteca, rentabilidad, fiscal)
js/store.js     estado, persistencia, generación de recibos y gastos fijos
js/state.js     selectores compartidos y avisos
js/forms.js     diálogos de alta y edición
js/views/*.js   pantallas
tests/          pruebas de cálculo:  npm test
```

Al cambiar archivos, sube la versión de `CACHE` en `sw.js` para que los dispositivos instalados se actualicen.
