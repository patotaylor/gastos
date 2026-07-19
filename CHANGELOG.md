# Changelog

## [0.7] — 2026-07-19
- Pestaña Fijos: carga de gastos fijos con desplegable de servicios, soporte USD y medios de pago.
- Lista de fijos con lo pagado, la fecha de pago y el vencimiento por servicio.
- Editar un fijo ya cargado (monto, fecha de pago y vencimiento) desde un panel.
- Copiar los vencimientos del mes anterior sumándoles un mes.
- Selector de mes desde el encabezado: cambia gastos, fijos y presupuesto de una.
- Presupuesto de fijos en la pestaña Presupuesto, con toggle Variables/Fijos.
- Botón para actualizar los presupuestos que se pasaron, igualándolos al real (con confirmación que lista los cambios).

## [0.6] — 2026-07-18
- Borrado real de gastos: limpia la fila, restituye la precarga =BJ*BL y realinea las categorías de AI solo. Se suma al "Quitar del total".
- Confirmación de borrado con panel propio (en vez del diálogo del navegador).
- Feedback táctil en las fichas (achique al tocar + vibración donde el dispositivo la soporta).

## [0.5] — 2026-07-18
- Pestaña Presupuesto: comparación presupuesto vs real por categoría, con barras de progreso (solo lectura).
- Repo reorganizado en carpetas (`css/`, `js/`, `assets/`, `apps-script/`) y JS dividido en módulos ES (`config`, `api`, `ui`, `app`). Sin cambios de comportamiento.
- Flujo de trabajo con ramas + Pull Request.

## [0.4] — 2026-07-18
- Editar y borrar gastos desde la lista.
- Compras en dólares con cotización sugerida desde J12.
- Auditoría de categorías ("Revisar").
- Botón de recargar y refresco automático al volver a la app.
- Firma y versión en el pie.

## [0.3] — 2026-07-18
- Alta de gastos con el paso 3 (categoría).
- Soporte del modelo real de la planilla (AF = UNIQUE, AI posicional).

## [0.2] — 2026-07-17
- doPost: alta de gastos variables.

## [0.1] — 2026-07-17
- doGet: lectura del mes, categorías, medios e índice.
