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
3. **Restaurar una copia** JSON exportada desde otro dispositivo.

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
| Datos | Copia completa en JSON (exportar / restaurar), CSV de cobros, gastos, reservas, contratos, resumen mensual e hipotecas; importación de gastos y reservas desde CSV. |

### Definiciones

- **Ingresos**: criterio de devengo (el recibo del mes, o la parte de cada reserva según las noches del mes).
- **Neto operativo** = ingresos − gastos (incluye comisiones de plataformas).
- **Cash-flow** = neto operativo − cuota de hipoteca (intereses + capital).
- **Rentabilidad neta** = neto operativo anualizado ÷ precio de adquisición total.

Los cálculos fiscales son una estimación orientativa; revísalos con tu asesor.

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
