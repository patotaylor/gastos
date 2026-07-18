[app-gastos-handoff v0.4.md](https://github.com/user-attachments/files/30146196/app-gastos-handoff.v0.4.md)
# gastos
El objetivo es la PWA + Apps Script.

# App Gastos Variables — Handoff

**Estado: andando en producción.** PWA instalada en el iPhone, backend deployado, planilla con
auditoría en cero. Versión **0.4** (front y script comparten número).

© 2026 Patricio Taylor.

> ⚠️ **Este documento reemplaza por completo al anterior.** El viejo describía `AF` como una lista
> manual que la app escribía. **Era falso, y esa suposición rompió el mes dos veces.** Si algo de
> acá contradice notas viejas, vale esto.
>
> **Regla de oro que salió de eso: en esta planilla no se escribe en ningún lado sin haber mirado
> antes la fórmula de la celda.** No el valor: la fórmula.

---

## 1. Qué es

PWA (un HTML con JS vanilla) + Apps Script standalone como Web App. Carga **solo gastos variables**
en la hoja del mes de la planilla `Presupuesto`. Los gastos fijos se siguen cargando a mano.

```
iPhone (PWA)  ──POST /exec──▶  Apps Script  ──openById──▶  Planilla
              ◀──JSON────────  (corre en Google)
```

Nada corre localmente. El teléfono manda un JSON; Google escribe.

| Pieza | Dónde vive |
|---|---|
| Planilla | Google Drive |
| Script | script.google.com, **standalone**, ID en Script Properties |
| PWA | GitHub Pages (repo público) |
| URL `/exec` + token | `localStorage` del teléfono — **no están en el repo** |

**Script Properties:** `SPREADSHEET_ID` · `ANIO_LIBRO` (=2026) · `TOKEN`.

---

## 2. El modelo de la hoja del mes — LEER ANTES DE TOCAR NADA

### 2.1 `AF` es una fórmula, no una lista

```
AF16 = =UNIQUE(BH16:BH139)
```

**`AF` se genera solo** a partir de las descripciones cargadas en `BH`, y se expande hacia abajo
tantas filas como descripciones distintas haya, en **orden de primera aparición**.

- **Nunca escribir en `AF16:AF47`.** Cualquier cosa ahí bloquea la expansión → `AF16` = `#REF!` →
  los 32 `AH` se quedan sin contra qué filtrar → **el mes entero suma cero**.
- Por eso `AF` "arranca vacío" cada mes: porque `BH` está vacío. No se hereda nada.

### 2.2 `AI` es posicional — el peligro real

`AI` (la categoría) es **manual y posicional**: la de `AI40` es la categoría de *lo que `UNIQUE`
haya puesto en `AF40`*. No está atada al texto.

**Si cambia el orden de `AF` y `AI` no se reacomoda, el mes queda mal clasificado EN SILENCIO.**
El total no se mueve ni un peso: cada gasto sigue sumando, pero en la categoría equivocada.

Cualquier cambio en `BH` puede correr el orden:
- borrar una fila cuya descripción era única → todo lo de abajo sube una fila
- corregir una descripción (ej. sacarle un espacio) → ídem
- llenar un hueco en el medio de `BH` → `UNIQUE` deja de contar el blanco → ídem

Ya pasó dos veces (ver §7). Por eso **toda escritura del script pasa por `reacomodarCategorias()`**,
que guarda el mapa `descripción → categoría` *antes* de tocar `BH` y lo vuelve a aplicar después.

`AI` está fusionada con `AJ` fila por fila (`AI16:AJ16`, etc.). `setValue` sobre el ancla anda bien.

### 2.3 El muro de 32

`AE48:AF48` está **fusionada** ("TOTAL"). Cuando aparezca la descripción única número 33, `UNIQUE`
va a querer expandirse ahí, no va a poder, y **el mes se cae a `#REF!`**.

Eso es **bueno**: falla ruidosa. Si se sacara la fusión, la 33 se expandiría a `AF48`, donde no hay
ninguna fórmula que la sume (`AH48` es el TOTAL, `=SUM(AH16:AH47)`) → ese gasto no contaría nunca,
sin un solo error a la vista. La fusión prefiere romperse a mentir.

El script **simula** el conteo antes de escribir (`unicasSimuladas`) y corta si daría 33.

Máximo alcanzado: `MAY 26` con 32/32.

### 2.4 Rango válido: `ENE 26` … `DIC 26`, y nada más

16 hojas de mes: `SEP 25`…`DIC 25` y `ENE 26`…`DIC 26`. **Las 4 de 2025 tienen otro layout,
corrido 2 columnas y sin medio de pago:**

| | check | desc | símbolo | USD | pesos | cambio | medio | fecha | notas |
|---|---|---|---|---|---|---|---|---|---|
| **2025** | BE | BF | BG | BH | **BI** | BJ | — | BK | BL |
| **2026** | BG | BH | BI | BJ | **BK** | BL | BM | BN | BO |

Una fecha de 2025 **encuentra** la pestaña y escribiría en las columnas equivocadas, callada.
**Regla dura en el script: año ≠ `ANIO_LIBRO` → corta.** Coincide con lo que cubre el
`RESUMEN ANUAL` (§8).

### 2.5 Mapa completo (vale de `ENE 26` en adelante)

**Bloque de carga — `BG16:BO139`** (124 filas)

| Col | Contenido | Nota |
|---|---|---|
| BG | Checkbox | borrado lógico, cableado al `FILTER` |
| BH | Descripción | **la única fuente de `AF`** |
| BI | Símbolo moneda | fórmula `=$G$11` — **no tocar, no borrar** |
| BJ | Monto USD | |
| BK | Monto pesos | número, o `=BJ*BL` si es en dólares |
| BL | Cambio | |
| BM | Medio de pago | dropdown — **fuente de verdad de los medios** |
| BN | Fecha | |
| BO | Notas | |

**Cadena de agregación**

```
BH/BK  (carga)
  ↓  AF16 = UNIQUE(BH16:BH139)                    ← se expande solo, 32 slots (16:47)
AF/AI  (descripción + categoría posicional)
  ↓  AH16 = SUM(IFERROR(FILTER($BK$16:$BK$139,$BH$16:$BH$139=AF16,$BG$16:$BG$139=TRUE),))
  ↓  AH48 = SUM(AH16:AH47)                        ← el TOTAL, no un renglón más
  ↓  Z16  = SUM(IFERROR(FILTER($AH$16:$AH$48,$AI$16:$AI$48=V16),))
V/Z    (por categoría, 17 filas: V16:V32 ← INICIO!H5:H21)
  ↓  Z33 = SUM(Z16:Z32) → I43 → dashboard
```

**Bloque presupuesto vs real — `U15:Z33`**

| Col | |
|---|---|
| U | checkbox por categoría |
| V | Categoría (17) |
| W/X | símbolo / **PRESUPUESTO** |
| Y/Z | símbolo / **ACTUAL** |
| fila 33 | TOTAL (`X33` presupuestado vs `Z33` real) |

**Otras celdas que importan**

| Celda | |
|---|---|
| `G9` | año (2026) |
| `G10` | mes en texto ("Julio"). Lo lee `B2 = =G10`, el título grande. Nada de afuera lo lee. |
| `G11` | símbolo de moneda, lo consume `BI` |
| `J12` | `=MROUND(GOOGLEFINANCE("CURRENCY:USDARS")*1.010921,5)` → **cotización sugerida** (1495) |
| `F29` | lo que lee el `RESUMEN ANUAL` (12 fórmulas por mes) |
| `I48` | saldo del mes, lo leen 4 celdas de "mes anterior" (§8) |

**Medios de pago (7):** `Transf. / Deb.`, `Visa Galicia`, `Mastercard Galicia`, `Visa BNA`,
`Mastercard BNA`, `Visa Brubank`, `Mastercard ARQ`. El script los lee de la **validación de `BM16`**,
no de una lista hardcodeada.

**Fila = id.** No hace falta columna de id: nadie ordena un dashboard de 67 columnas.
`JUL 26!41` es una dirección firme.

---

## 3. Invariantes del script — no negociables

1. **Nunca escribir en `AF`.** Se llena solo.
2. **Nunca escribir ni borrar `BI`** (tiene `=$G$11`). Se escribe `BG:BH` y `BJ:BO`, salteándola.
3. **Año ≠ `ANIO_LIBRO` → cortar.** Jamás tocar una hoja de 2025.
4. **Simular antes de escribir**: si el mes llegaría a 33 descripciones únicas, cortar sin escribir.
5. **`AF16` en `#REF!` → negarse a cargar.** No apilar encima de un mes roto.
6. **Todo cambio en `BH` → `reacomodarCategorias()`** con el mapa tomado *antes* del cambio.
7. **Trim + case-insensitive** al comparar, y **escribir la grafía canónica de `AF`**: Sheets compara
   texto sin distinguir mayúsculas, así que `Cena` y `cena` como dos slots harían contar doble.
8. **Fechas con `Utilities.parseDate(fecha, tz_de_la_planilla, 'yyyy-MM-dd')`**, nunca `new Date(a,m,d)`.
9. Toda escritura dentro de `LockService.getScriptLock()`.

---

## 4. El backend (`Codigo.gs`, v0.4)

**`doGet`** (`?token=…`)
- `&fecha=AAAA-MM-DD` o `&mes=JUL 26` → mes a abrir (default: hoy)
- devuelve `version`, `hoy`, `mes`, `cambio` (de `J12`), `categorias`, `medios`, `indice`, `gastos`
- `&accion=auditar` (`&mes=todos` para las 12 hojas)

**`doPost`** (JSON, `Content-Type: text/plain`)

| `accion` | Qué hace |
|---|---|
| `alta` | primera fila libre de `BH`, escribe `BG:BO` |
| `editar` | reescribe la fila (no toca `BG`) y realinea `AI` |
| `check` | tilda/destilda `BG`. No toca `BH` → no puede desalinear nada |

**El paso 3 (la categoría)** no es un error, es una pregunta: si la descripción es nueva —o ya está
pero su `AI` quedó vacío— devuelve `{ok:false, requiereCategoria:true, sugerencia:{...}}` **sin
escribir nada**. La sugerencia sale de la categoría **más usada** en el resto del año.

**La auditoría** compara cada `descripción → categoría` contra el resto del libro. Tres hallazgos:

| tipo | |
|---|---|
| `distinta` | la categoría no coincide con la de los otros meses |
| `sin_categoria` | descripción sin categoría → no suma en ninguna |
| `huerfana` | categoría sin descripción al lado |

**Marca, no corrige.** Al 18/7/2026 el libro está en **0 hallazgos** en las 12 hojas, y sin
excepciones toleradas: cualquier cosa que salte de acá en adelante es un error de verdad.

**Cosas de Apps Script que muerden:**
- No soporta preflight CORS → POST con `Content-Type: text/plain`, `JSON.parse(e.postData.contents)`
- Usar la URL `/exec`, nunca `/dev`
- **El `/exec` sirve la versión deployada, no la del editor.** `probarPost` corre el editor; la app
  corre el deploy. Cambiar código sin *Administrar implementaciones → Nueva versión* no hace nada.
  Por eso `VERSION` sale en el `doGet` y la app avisa si no coincide con la suya.

---

## 5. La PWA (`index.html`, v0.4)

Un archivo, sin dependencias ni webfonts: tiene que abrir en un segundo con 3G. Números en
monoespaciada, rótulos en mayúscula chica como los encabezados de la planilla.

- Descripción → monto (`$`/`USD`) → medio (fichas) → fecha → notas
- En `USD`: cotización precargada de `J12`, editable, con el equivalente en pesos en vivo
- Header: mes + `DESCRIPCIONES 24/32` con barra, ámbar cuando quedan ≤4
- Lista completa: tocás una fila → editar / **Quitar del total** (destilda, queda tachada)
- **Revisar** → auditoría del mes ahí mismo
- Ícono de recarga + **refresco automático al volver a la app** (>15s, nunca en medio de un guardado)
- El pie muestra `© 2026 Patricio · v0.4`; si el script responde otra versión, avisa en ámbar

**Nada de `localStorage` salvo la config.** Sin service worker **a propósito**: cachearía el HTML y
serviría versiones viejas sin avisar — la misma trampa del `/exec`, que ya nos mordió dos veces.

---

## 6. Deploy

| Qué | Cómo |
|---|---|
| Script | pegar en el editor → Guardar → **Administrar implementaciones → ✏️ → Nueva versión** |
| Front | commit en el repo → Pages actualiza en ~1 min |
| iPhone | cerrar la app del multitarea y volver a abrir |

**Subir las dos versiones juntas.** Si sube una sola, la app protesta. Es a propósito.

---

## 7. Lo que rompimos, y por qué — la parte más cara de este documento

| # | Qué pasó | Causa | Lección |
|---|---|---|---|
| 1 | `AF16` = `#REF!`, mes en cero | el script escribió en `AF` | **el `.xlsx` miente**: leí los *valores* cacheados de `AF` ("Cena", "Agua") y supuse lista manual. Nunca miré la fórmula. |
| 2 | `AF16` = `#REF!`, otra vez | el `/exec` servía la versión vieja | el editor y el deploy son dos códigos distintos |
| 3 | `JUN 26`: 10 categorías mal | corregir `Cena ` a mano en `BH` | tocar `BH` corre `AF` y desalinea `AI`, **sin mover el total** |
| 4 | `JUL 26`: Almuerzo mal clasificado | se llenó un hueco de `BH25` | ídem — `UNIQUE` contaba el blanco como valor |
| 5 | Fecha un día antes | `new Date(a,m,d)` usa la tz del **script**, no la de la planilla | `Utilities.parseDate` con `getSpreadsheetTimeZone()` |
| 6 | Panel tapando la config | `hidden` vs `display:flex` en CSS | `[hidden] { display: none !important }` |
| 7 | Fecha y Notas pisándose en iOS | `1fr` = `minmax(auto,1fr)`; el `input[type=date]` de iOS tiene ancho mínimo grande | `minmax(0, 1fr)` |

**Las dos silenciosas (3 y 4) son las importantes.** `Z33` no se movió: `JUN` siguió en
4.073.414,75 y `JUL` en 2.482.270,03. El total nunca estuvo mal — estaba mal el reparto. La
auditoría existe por esto.

**Sheets no reescribe una referencia ya rota.** Por eso `INICIO!H27` sigue diciendo `=ENE!`: estaba
en `#REF!` de antes. Y por eso **renombrar es seguro pero borrar no**.

---

## 8. Ciclo: enero 2027

`RESUMEN ANUAL` apunta a `ENE 26`…`DIC 26` (12 slots `K17:K28`, 144 fórmulas a `F29`).
Es **año calendario**. Las 4 hojas de 2025 no las lee nadie.

**Cero `INDIRECT` en todo el libro.** Es lo único que no se auto-reescribe al renombrar, y es lo que
hace que la receta de enero sea trivial. **No introducir `INDIRECT` nunca** (ver §9.7).

### Receta — renombrar, no duplicar

1. Copiar el libro (`Archivo → Hacer una copia`).
2. **Renombrar** las 12 → `ENE 27`…`DIC 27`. Las 144 del `RESUMEN ANUAL` se reescriben solas.
3. Limpiar `BH16:BO139` en las 12 — **borrar contenido, no borrar filas**. (`AF` se vacía solo.)
4. Ctrl+H → `#REF!` en todas las hojas, con "buscar dentro de fórmulas".
5. Cambiar `SPREADSHEET_ID` y `ANIO_LIBRO` en Script Properties. Sin redeploy, sin URL nueva.

**Por qué no duplicar:** duplicar obliga a borrar las viejas, y borrar colapsa las fórmulas del
`RESUMEN ANUAL` a `=#REF!$F$29` — 12 por mes, sin rastro de a qué apuntaban.

**Ojo con las 4 celdas de "saldo mes anterior"** (`NOV 25!F28`, `DIC 25!F27`, `ENE 26!F27`,
`ABR 26!F27` → `I48` del mes previo). Existen solo en esas 4, sin patrón. `ENE 26!F27` apunta a
`'DIC 25'!I48`: **si en la copia borrás las hojas de 2025, se rompe.**

**Enero es la ventana para §9.2** (ampliar los 32): libro nuevo, hojas vacías, y si sale mal el
viejo queda intacto.

---

## 9. Roadmap

### Prioridad 1 — 🔨 Arquitectura del repo

Hoy: 5 archivos sueltos en la raíz, todo en un `index.html` de ~700 líneas. Funciona, pero no
escala y no se puede revisar un diff.

**Objetivo:**

```
gastos/
├── index.html                 solo estructura
├── manifest.json
├── README.md                  qué es, cómo se deploya, cómo se prueba
├── CHANGELOG.md               una línea por versión
├── LICENSE                    © 2026 Patricio Taylor — Todos los derechos reservados
├── .gitignore
├── assets/icons/              los 3 png
├── css/estilos.css
├── js/
│   ├── config.js              localStorage, URL + token
│   ├── api.js                 fetch al /exec
│   ├── ui.js                  pintar mes, lista, paneles
│   └── app.js                 arranque y eventos
└── apps-script/
    ├── Codigo.gs              copia versionada
    └── README.md              las 3 Script Properties y cómo deployar
```

**Decisión pendiente — el precio de dividir el JS:** con `<script type="module">` el doble clic en
`index.html` deja de andar (`file://` no tiene origen y los módulos se bloquean). Para probar local
haría falta `python -m http.server` y entrar por `localhost`. Es lo profesional y es un comando,
pero cambia el flujo de trabajo que venimos usando. La alternativa es un solo `js/app.js` sin
módulos, que sigue andando con doble clic.

**Sobre la propiedad:** un repo público **sin** archivo de licencia ya es "todos los derechos
reservados" por defecto — publicar el código no cede ningún derecho. El `LICENSE` explícito es para
que no haya dudas. (No soy abogado; si te importa de verdad, consultá uno.)

**Deuda a asumir:** el `Codigo.gs` del repo es una **copia a mano**. Se puede desincronizar del que
está deployado. La solución real es `clasp` (CLI de Google que sincroniza el repo con Apps Script);
queda anotado, no es para ahora.

### Prioridad 2 — 📊 Presupuesto vs real (era el 4)

El de mejor relación valor/trabajo. Está todo servido en `U15:Z33`: categoría, presupuesto, actual,
totales. Una solapa de **solo lectura** en el `doGet`. Sin riesgo: no escribe nada.

### Prioridad 3 — 🗑️ Borrado real (sale del 3)

**Lo pedido era: al destildar, borrar la categoría de `AI`. Eso NO se puede hacer.**

`AI` es la categoría **de la descripción**, no del gasto. Una por descripción, no una por fila.
`JUL 26` tiene cuatro cenas (filas 16, 24, 27, 33) y las suma todas `AH16` = 195.653. Si se destilda
la de la fila 24 y se borra `AI16`:

- `BH` no cambió → `AF16` sigue diciendo "Cena" → `AH16` sigue sumando las otras tres = 157.505
- sin categoría, `Z` ya no lo encuentra → **Restaurante y el total pierden 157.505**

O sea: destildar un gasto de 38.148 haría caer el mes 195.653.

**Lo que sí resuelve el problema real:** un **borrado de verdad** que limpie `BH` (no solo el check).
Ahí la descripción desaparece de `AF` y `reacomodarCategorias()` limpia `AI` sola — que es
exactamente lo que hoy se hace a mano y lo que rompió `JUN 26`. Son ~15 líneas; la maquinaria ya está.

Quedarían dos botones distintos, y la diferencia importa:

| | |
|---|---|
| **Quitar del total** | destilda. Queda de registro, se puede revivir |
| **Borrar** | limpia la fila. Se va del mes, `AI` se reacomoda solo |

### Prioridad 4 — 📌 Gastos fijos (era el 1)

**Primero un relevamiento de solo lectura del bloque.** Nada de escribir en una zona de esta
planilla sin haber mirado las fórmulas: ya sabemos cómo termina (§7).

### Prioridad 5 — 📏 Ampliar los 32 (era el 2)

**Se puede: debajo del TOTAL la columna `AF` está vacía hasta abajo.** Correr el total a la fila 60
daría 44 slots.

Costo por hoja: extender los `AH`, la validación de `AI`, mover la fusión `AE48:AF48`, y actualizar
las 17 fórmulas `Z` que dicen `$AH$16:$AH$48`. ~200 fórmulas × 12 hojas → **script de migración**,
no a mano.

**Hacerlo en enero, sobre la copia** (§8). Hoy, sobre 7 meses cargados, es jugar con fuego para
resolver algo que pasó una vez (`MAY 26`, 32/32).

### Prioridad 6 — 🏦 Ahorros / Deudas / Inversiones (era el 6)

El más grande: **merece su propio handoff.** `DEUDAS` (38.187 fórmulas) y
`PAGO DEUDAS | BOLA DE NIEVE` (19.841) están abandonadas — revivirlas o rehacerlas es la primera
decisión. `INICIO!G84` está en `#REF!` justo en el bloque de "Ahorros": esa parte ya viene tocada.

### No hacer (por ahora)

**Optimizar la planilla (era el 5).** No hay nada que optimizar: usa el **4%** de la grilla
(~397.000 celdas de 10M), 1,5 MB, y de sus 73.575 fórmulas el **79%** está en las dos hojas
abandonadas — que son `IF`/`SUM` estáticas y no recalculan nunca. Lo único volátil son 100
`GOOGLEFINANCE`, y **87 están en `Gastos Vacaciones!H2:H88`** (los otros 13: uno por mes y uno en
`AHORROS`). Si algún día lagea: pegar esa columna como valores. **No tocar los meses.**
Optimizar cuando algo lagee, no antes. Ojo que esto pelea con la prioridad 6: si `DEUDAS` revive,
ahí sí hay algo que medir.

**Mover las tarjetas a una hoja aparte (era el 7).** Una hoja única tendría que leer los 12 meses:
o 12 bloques estáticos (peor que ahora), o **`INDIRECT`** — lo único que no sobrevive un renombre, o
sea justo lo que hace que enero sea trivial (§8). El principio del libro es *cada mes se basta a sí
mismo, los resúmenes lo leen por nombre*. Las tarjetas por mes lo respetan.

### Fuera de alcance por decisión

Reestructurar la planilla · `Gastos Vacaciones` / `Presupuesto Vacaciones` · `AI` como fórmula
`VLOOKUP` contra una hoja maestra.

> **Sobre la maestra**, porque la idea va a volver: mataría el desalineo de raíz, pero una fórmula no
> se pisa a mano. Se perdería el override por mes — el `kiosko` de `ABR 26` en Vacaciones porque
> abril fue el mes del viaje. Sobre 87 descripciones del año, solo 4 tenían categoría distinta según
> el mes, y una era deliberada. La auditoría da la misma protección sin perder el criterio.
> *(Nota: en julio 2026 el kiosko se unificó a Super/mercado por decisión de Patricio — "no quiero
> mentir". El ejemplo sigue valiendo como principio.)*

---

## 10. Números de control

`Z33` de cada mes (= `AH48` = `I43`), al 17/7/2026:

| ENE 26 | FEB 26 | MAR 26 | ABR 26 | MAY 26 | JUN 26 | JUL 26 |
|---|---|---|---|---|---|---|
| 3.612.430,48 | 3.362.226,28 | 2.978.906,01 | 2.514.582,14 | 12.792.529,86 | 4.073.414,75 | 2.482.270,03 |

(`JUL` se mueve con cada carga; los otros son meses cerrados y **no deberían moverse nunca**.)

**Descripciones únicas por mes:** ENE 29 · FEB 23 · MAR 27 · ABR 28 · **MAY 32/32** · JUN 24 ·
JUL 24 · AGO–DIC 0.

**Errores preexistentes (2, ninguno del renombre, ninguno apunta a un mes):**

| Celda | Fórmula | |
|---|---|---|
| `INICIO!H27` | `=ENE!AD16:AD115` | estructura vieja, fuera de alcance |
| `INICIO!G84` | `=#REF!` | colapsada hace mucho, bloque "Ahorros" |

**Hojas ocultas:** `TARJETAS DE CREDITO`, `Respuestas de formulario 1`, `Link Carga Gastos App`.
