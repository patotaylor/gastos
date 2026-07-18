/**
 * Gastos Variables — backend (Apps Script standalone) · versión 0.5
 * © 2026 Patricio Taylor. Todos los derechos reservados.
 *
 * MODELO DE LA HOJA (verificado en la planilla, no suponer):
 *   AF16 = =UNIQUE(BH16:BH139)  → la lista de descripciones SE GENERA SOLA.
 *          NUNCA se escribe en AF. Escribir ahí bloquea la expansión,
 *          AF16 pasa a #REF! y el mes entero se va a cero.
 *   AI   = la categoría, a mano, POSICIONAL: la de AI40 es la categoría de
 *          lo que UNIQUE haya puesto en AF40. Si cambia el orden de AF y AI
 *          no se reacomoda, el mes queda mal clasificado EN SILENCIO
 *          (el total no se mueve). Por eso todo cambio en BH pasa por
 *          reacomodarCategorias().
 *   AE48:AF48 está fusionada ("TOTAL") → la expansión topa ahí.
 *          32 descripciones distintas es el máximo. La 33 rompe el mes.
 *   J12  = MROUND(GOOGLEFINANCE("CURRENCY:USDARS")*1.010921,5) → cotización
 *          sugerida para las compras en dólares.
 *   BK   = número, o =BJ*BL cuando la compra es en dólares.
 *
 * Script Properties:
 *   SPREADSHEET_ID · ANIO_LIBRO · TOKEN
 */

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Versión del proyecto entero: tiene que coincidir con la del index.html.
// Si no coincide, el /exec quedó sirviendo código viejo y la app te avisa.
// Subirla en cada cambio.
const VERSION = '0.4';

const CARGA_FILA_INI = 16;
const CARGA_FILA_FIN = 139;   // BG16:BO139
const CARGA_COL_INI  = 59;    // BG
const CARGA_ANCHO    = 9;     // BG..BO

const COL_BG = 59;
const COL_BH = 60;
const COL_BI = 61;   // fórmula =$G$11 — NUNCA se escribe ni se borra
const COL_BJ = 62;

const AF_FILA_INI = 16;
const AF_FILA_FIN = 47;
const AF_COL_INI  = 32;       // AF — SOLO LECTURA
const AF_COL_CAT  = 35;       // AI — lo único que escribimos del bloque
const AF_ANCHO    = 4;        // AF..AI
const AF_SLOTS    = AF_FILA_FIN - AF_FILA_INI + 1;   // 32

const CATEGORIAS_RANGO = 'H5:H21';
const CELDA_CAMBIO = 'J12';

const MEDIOS_FALLBACK = [
  'Transf. / Deb.', 'Visa Galicia', 'Mastercard Galicia',
  'Visa BNA', 'Mastercard BNA', 'Visa Brubank', 'Mastercard ARQ'
];

// ═══════════════════════════════════════════════════════════
//  doGet — leer / auditar
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.token !== prop('TOKEN')) throw new Error('Token inválido');

    const ss = abrirLibro();
    const pideTodos = (String(params.mes || '').toLowerCase() === 'todos');
    const hoja = (params.mes && !pideTodos)
      ? hojaPorNombre(ss, params.mes)
      : hojaDelMes(ss, params.fecha || hoyISO(ss));

    if (params.accion === 'auditar') {
      // mes=todos → recorre las 12 hojas del libro de una sola pasada
      if (String(params.mes || '').toLowerCase() === 'todos') {
        const yy = String(prop('ANIO_LIBRO')).slice(-2);
        const porMes = {};
        let total = 0;
        MESES.forEach(function (m) {
          const h = ss.getSheetByName(m + ' ' + yy);
          if (!h) return;
          const hs = auditar(ss, h);
          if (hs.length) { porMes[h.getName()] = hs; total += hs.length; }
        });
        return json({ ok: true, version: VERSION, mes: 'todos', total: total, hallazgos: porMes });
      }
      return json({ ok: true, version: VERSION, mes: hoja.getName(), hallazgos: auditar(ss, hoja) });
    }

    return json({
      ok: true,
      version: VERSION,
      hoy: hoyISO(ss),
      mes: hoja.getName(),
      cambio: leerCambio(hoja),
      categorias: leerCategorias(ss),
      medios: leerMedios(hoja),
      indice: leerIndice(hoja),
      gastos: leerGastos(ss, hoja),
      presupuesto: leerPresupuesto(hoja)
    });

  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

// ═══════════════════════════════════════════════════════════
//  doPost — alta / editar / check
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const crudo = (e && e.postData && e.postData.contents) || '';
    if (!crudo) throw new Error('El POST llegó vacío.');

    const body = JSON.parse(crudo);
    if (body.token !== prop('TOKEN')) throw new Error('Token inválido');

    const accion = String(body.accion || 'alta');

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error('El script está ocupado. Probá de nuevo en unos segundos.');
    }

    try {
      if (accion === 'alta')   return json(altaGasto(body));
      if (accion === 'editar') return json(editarGasto(body));
      if (accion === 'check')  return json(marcarCheck(body));
      throw new Error('Acción desconocida: "' + accion + '".');
    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

// ── Alta ──

function altaGasto(body) {
  const d = validarDatos(body);
  const ss = abrirLibro();
  const hoja = hojaDelMes(ss, d.fecha);

  const indice = leerIndice(hoja);
  chequearSano(hoja, indice);
  validarMedio(hoja, d.medio);

  const existente = buscarEnIndice(indice, d.desc);
  const desc = existente ? existente.desc : d.desc;   // grafía canónica
  const fila = primeraFilaLibre(hoja);

  // El muro: cuántas descripciones únicas quedarían DESPUÉS de escribir.
  const cuenta = unicasSimuladas(hoja, fila, desc);
  if (cuenta > AF_SLOTS) {
    throw new Error(muroLleno(hoja, d.desc));
  }

  const faltaCategoria = !existente || !existente.categoria;
  if (faltaCategoria && !d.categoria) {
    return {
      ok: false, requiereCategoria: true, desc: d.desc, nueva: !existente,
      sugerencia: sugerirCategoria(ss, hoja.getName(), d.desc),
      indice: resumen(indice)
    };
  }
  if (faltaCategoria) validarCategoria(ss, d.categoria);

  const mapa = mapaCategorias(indice);
  if (faltaCategoria) mapa[normalizar(desc)] = d.categoria;

  escribirFila(hoja, fila, desc, d, ss.getSpreadsheetTimeZone(), true);
  SpreadsheetApp.flush();

  return cerrarEscritura(ss, hoja, mapa, {
    fila: fila, desc: desc,
    deshacer: function () { limpiarFila(hoja, fila); }
  });
}

// ── Edición ──

function editarGasto(body) {
  const d = validarDatos(body);
  const ss = abrirLibro();
  const hoja = hojaPorNombre(ss, body.mes);
  const fila = filaValida(body.fila);

  // Cambiar la fecha a otro mes implicaría mover la fila de hoja. No va.
  if (nombreDeHoja(d.fecha) !== hoja.getName()) {
    throw new Error(
      'La fecha ' + d.fecha + ' es de ' + nombreDeHoja(d.fecha) + ' y el gasto está en ' +
      hoja.getName() + '. Para moverlo de mes hay que darlo de baja acá y cargarlo allá.'
    );
  }

  const indice = leerIndice(hoja);
  chequearSano(hoja, indice);
  validarMedio(hoja, d.medio);

  const descAnterior = String(hoja.getRange(fila, COL_BH).getValue() || '').trim();
  if (!descAnterior) {
    throw new Error('La fila ' + fila + ' de ' + hoja.getName() + ' está vacía: no hay nada que editar.');
  }

  const existente = buscarEnIndice(indice, d.desc);
  const desc = existente ? existente.desc : d.desc;
  const cambiaDesc = (normalizar(desc) !== normalizar(descAnterior));

  if (cambiaDesc && unicasSimuladas(hoja, fila, desc) > AF_SLOTS) {
    throw new Error(muroLleno(hoja, d.desc));
  }

  const faltaCategoria = cambiaDesc && (!existente || !existente.categoria);
  if (faltaCategoria && !d.categoria) {
    return {
      ok: false, requiereCategoria: true, desc: d.desc, nueva: !existente,
      sugerencia: sugerirCategoria(ss, hoja.getName(), d.desc),
      indice: resumen(indice)
    };
  }
  if (faltaCategoria) validarCategoria(ss, d.categoria);

  // El mapa se arma ANTES de tocar BH: es la memoria de qué categoría le
  // corresponde a cada descripción, independiente de en qué fila caiga después.
  const mapa = mapaCategorias(indice);
  if (faltaCategoria) mapa[normalizar(desc)] = d.categoria;

  escribirFila(hoja, fila, desc, d, ss.getSpreadsheetTimeZone(), false);
  SpreadsheetApp.flush();

  return cerrarEscritura(ss, hoja, mapa, {
    fila: fila, desc: desc,
    deshacer: function () { hoja.getRange(fila, COL_BH).setValue(descAnterior); }
  });
}

/** Común a alta y edición: verificar que AF no se rompió y reacomodar AI. */
function cerrarEscritura(ss, hoja, mapa, ctx) {
  const despues = leerIndice(hoja);

  if (despues.roto) {
    ctx.deshacer();
    SpreadsheetApp.flush();
    throw new Error(
      'Al escribir "' + ctx.desc + '", AF16 de ' + hoja.getName() + ' pasó a #REF!. ' +
      'Se deshizo el cambio. Revisá que no haya nada escrito a mano en AF16:AF47.'
    );
  }

  const realineadas = reacomodarCategorias(hoja, mapa);
  SpreadsheetApp.flush();

  return {
    ok: true,
    mes: hoja.getName(),
    fila: ctx.fila,
    desc: ctx.desc,
    realineadas: realineadas,          // celdas de AI que hubo que corregir
    indice: resumen(leerIndice(hoja))
  };
}

// ── Check (el borrado lógico) ──

function marcarCheck(body) {
  const ss = abrirLibro();
  const hoja = hojaPorNombre(ss, body.mes);
  const fila = filaValida(body.fila);

  const desc = String(hoja.getRange(fila, COL_BH).getValue() || '').trim();
  if (!desc) throw new Error('La fila ' + fila + ' de ' + hoja.getName() + ' está vacía.');

  // No toca BH: UNIQUE no se mueve y AI no se desalinea.
  hoja.getRange(fila, COL_BG).setValue(body.check === true);
  SpreadsheetApp.flush();

  return { ok: true, mes: hoja.getName(), fila: fila, desc: desc, check: body.check === true };
}

// ═══════════════════════════════════════════════════════════
//  Escritura
// ═══════════════════════════════════════════════════════════

function escribirFila(hoja, fila, desc, d, tz, esAlta) {
  if (esAlta) hoja.getRange(fila, COL_BG).setValue(true);
  hoja.getRange(fila, COL_BH).setValue(desc);
  // BI ni se toca: tiene =$G$11.

  // La fecha se arma en la zona horaria de LA PLANILLA, no en la del proyecto:
  // si el script está en GMT y la planilla en Buenos Aires, la medianoche del 17
  // cae el 16 a las 21:00 y el gasto queda cargado un día antes.
  const fechaObj = Utilities.parseDate(d.fecha, tz, 'yyyy-MM-dd');

  // En dólares, BK replica la convención de la planilla: =BJ*BL
  const montoPesos = d.enUSD ? ('=BJ' + fila + '*BL' + fila) : d.monto;

  hoja.getRange(fila, COL_BJ, 1, 6).setValues([[
    d.montoUSD === null ? '' : d.montoUSD,   // BJ
    montoPesos,                              // BK
    d.cambio === null ? '' : d.cambio,       // BL
    d.medio,                                 // BM
    fechaObj,                                // BN
    d.notas                                  // BO
  ]]);
}

function limpiarFila(hoja, fila) {
  hoja.getRange(fila, COL_BG, 1, 2).clearContent();   // BG, BH
  hoja.getRange(fila, COL_BJ, 1, 6).clearContent();   // BJ..BO — BI queda
  SpreadsheetApp.flush();
}

/**
 * Vuelve a poner cada categoría donde corresponde después de que UNIQUE se
 * reacomodó, y limpia los AI que quedaron sin descripción al lado.
 * Devuelve cuántas celdas hubo que tocar (0 = nada se movió).
 */
function reacomodarCategorias(hoja, mapa) {
  const vals = hoja.getRange(AF_FILA_INI, AF_COL_INI, AF_SLOTS, AF_ANCHO).getValues();
  let tocadas = 0;

  for (let i = 0; i < AF_SLOTS; i++) {
    const desc = String(vals[i][0] || '').trim();
    const actual = String(vals[i][3] || '').trim();
    const debeSer = desc ? (mapa[normalizar(desc)] || '') : '';

    if (debeSer !== actual) {
      hoja.getRange(AF_FILA_INI + i, AF_COL_CAT).setValue(debeSer);
      tocadas++;
    }
  }
  return tocadas;
}

// ═══════════════════════════════════════════════════════════
//  Auditoría — la historia como maestra blanda
// ═══════════════════════════════════════════════════════════

function auditar(ss, hoja) {
  const vals = hoja.getRange(AF_FILA_INI, AF_COL_INI, AF_SLOTS, AF_ANCHO).getValues();
  const hist = historial(ss, hoja.getName());
  const hallazgos = [];

  for (let i = 0; i < AF_SLOTS; i++) {
    const fila = AF_FILA_INI + i;
    const desc = String(vals[i][0] || '').trim();
    const cat  = String(vals[i][3] || '').trim();

    if (!desc && cat) {
      hallazgos.push({ fila: fila, tipo: 'huerfana', categoria: cat,
        detalle: 'AI' + fila + ' dice "' + cat + '" pero AF' + fila + ' está vacía.' });
      continue;
    }
    if (!desc) continue;

    if (!cat) {
      hallazgos.push({ fila: fila, tipo: 'sin_categoria', desc: desc,
        detalle: '"' + desc + '" no tiene categoría: no suma en ninguna.' });
      continue;
    }

    const previas = hist[normalizar(desc)];
    if (previas && !previas[cat]) {
      const usadas = Object.keys(previas).map(function (c) {
        return c + ' (' + previas[c].join(', ') + ')';
      });
      hallazgos.push({ fila: fila, tipo: 'distinta', desc: desc, categoria: cat, usadas: usadas,
        detalle: '"' + desc + '" figura como ' + cat + '. En otros meses: ' + usadas.join(' · ') });
    }
  }
  return hallazgos;
}

/** { descripción normalizada: { categoría: [meses] } } de los otros meses del libro. */
function historial(ss, excepto) {
  const yy = String(prop('ANIO_LIBRO')).slice(-2);
  const hist = {};

  MESES.forEach(function (m) {
    const nombre = m + ' ' + yy;
    if (nombre === excepto) return;
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) return;

    hoja.getRange(AF_FILA_INI, AF_COL_INI, AF_SLOTS, AF_ANCHO).getValues().forEach(function (f) {
      const d = String(f[0] || '').trim();
      const c = String(f[3] || '').trim();
      if (!d || !c) return;
      const k = normalizar(d);
      if (!hist[k]) hist[k] = {};
      if (!hist[k][c]) hist[k][c] = [];
      hist[k][c].push(nombre);
    });
  });
  return hist;
}

// ═══════════════════════════════════════════════════════════
//  Índice AF
// ═══════════════════════════════════════════════════════════

function normalizar(s) {
  return String(s || '').trim().toLowerCase();
}

function mapaCategorias(indice) {
  const mapa = {};
  indice.items.forEach(function (i) {
    if (i.categoria) mapa[normalizar(i.desc)] = i.categoria;
  });
  return mapa;
}

function buscarEnIndice(indice, desc) {
  const buscado = normalizar(desc);
  for (let i = 0; i < indice.items.length; i++) {
    if (normalizar(indice.items[i].desc) === buscado) return indice.items[i];
  }
  return null;
}

/** Cuántas descripciones únicas habría en BH si la fila pasara a valer nuevoDesc. */
function unicasSimuladas(hoja, fila, nuevoDesc) {
  const n = CARGA_FILA_FIN - CARGA_FILA_INI + 1;
  const vals = hoja.getRange(CARGA_FILA_INI, COL_BH, n, 1).getValues();
  const vistas = {};
  let cuenta = 0;

  for (let i = 0; i < n; i++) {
    let v = String(vals[i][0] || '').trim();
    if (CARGA_FILA_INI + i === fila) v = String(nuevoDesc || '').trim();
    if (!v) continue;
    const k = normalizar(v);
    if (!vistas[k]) { vistas[k] = true; cuenta++; }
  }
  return cuenta;
}

function muroLleno(hoja, desc) {
  return 'El índice de ' + hoja.getName() + ' llegaría a ' + (AF_SLOTS + 1) + ' descripciones con "' +
         desc + '", y el máximo es ' + AF_SLOTS + '. No se escribió nada: UNIQUE se expandiría sobre ' +
         'AE48:AF48 y tiraría todo el mes a cero. Usá una descripción que ya exista, o liberá una.';
}

function sugerirCategoria(ss, mesActual, desc) {
  const previas = historial(ss, mesActual)[normalizar(desc)];
  if (!previas) return null;

  // La más usada; si empatan, la del mes más reciente.
  let mejor = null;
  Object.keys(previas).forEach(function (c) {
    const meses = previas[c];
    const peso = meses.length * 100 + MESES.indexOf(meses[meses.length - 1].slice(0, 3));
    if (!mejor || peso > mejor.peso) mejor = { categoria: c, mes: meses[meses.length - 1], peso: peso };
  });
  return mejor ? { categoria: mejor.categoria, mes: mejor.mes } : null;
}

function primeraFilaLibre(hoja) {
  const n = CARGA_FILA_FIN - CARGA_FILA_INI + 1;
  const vals = hoja.getRange(CARGA_FILA_INI, COL_BH, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (String(vals[i][0] || '').trim() === '') return CARGA_FILA_INI + i;
  }
  throw new Error('No quedan renglones libres en ' + hoja.getName() + ' (BH16:BH139).');
}

// ═══════════════════════════════════════════════════════════
//  Validaciones
// ═══════════════════════════════════════════════════════════

function validarDatos(body) {
  const d = {
    desc:      String(body.desc || '').trim(),
    fecha:     String(body.fecha || '').trim(),
    medio:     String(body.medio || '').trim(),
    notas:     String(body.notas || '').trim(),
    categoria: String(body.categoria || '').trim(),
    monto:     aNumero(body.monto, 'monto'),
    montoUSD:  aNumero(body.montoUSD, 'monto USD'),
    cambio:    aNumero(body.cambio, 'cambio')
  };

  if (!d.desc)  throw new Error('Falta la descripción.');
  if (!d.medio) throw new Error('Falta el medio de pago.');

  d.enUSD = (d.montoUSD !== null || d.cambio !== null);
  if (d.enUSD) {
    if (d.montoUSD === null) throw new Error('Falta el monto en dólares.');
    if (d.cambio === null)   throw new Error('Falta la cotización.');
    if (d.montoUSD <= 0)     throw new Error('El monto en dólares tiene que ser mayor a cero.');
    if (d.cambio <= 0)       throw new Error('La cotización tiene que ser mayor a cero.');
    d.monto = null;
  } else {
    if (d.monto === null) throw new Error('Falta el monto.');
    if (d.monto <= 0)     throw new Error('El monto tiene que ser mayor a cero.');
  }

  return d;
}

function validarMedio(hoja, medio) {
  if (leerMedios(hoja).indexOf(medio) === -1) {
    throw new Error('Medio de pago desconocido: "' + medio + '".');
  }
}

function validarCategoria(ss, categoria) {
  if (leerCategorias(ss).indexOf(categoria) === -1) {
    throw new Error('Categoría desconocida: "' + categoria + '".');
  }
}

function chequearSano(hoja, indice) {
  if (indice.roto) {
    throw new Error(
      'AF16 de ' + hoja.getName() + ' está en #REF!: la fórmula =UNIQUE no se puede expandir ' +
      'porque hay algo escrito en su camino. Hay que destrabarla a mano antes de cargar nada.'
    );
  }
}

function filaValida(fila) {
  const n = Number(fila);
  if (!(n >= CARGA_FILA_INI && n <= CARGA_FILA_FIN)) {
    throw new Error('Fila fuera del bloque de carga: "' + fila + '".');
  }
  return n;
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

function prop(nombre) {
  const v = PropertiesService.getScriptProperties().getProperty(nombre);
  if (!v) throw new Error('Falta la Script Property: ' + nombre);
  return v;
}

function abrirLibro() { return SpreadsheetApp.openById(prop('SPREADSHEET_ID')); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function hoyISO(ss) {
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function resumen(indice) {
  return { usados: indice.usados, libres: indice.libres, total: indice.total,
           lleno: indice.lleno, roto: indice.roto };
}

function aNumero(v, campo) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!isFinite(n)) throw new Error('El ' + campo + ' tiene que ser un número (llegó "' + v + '").');
  return n;
}

/** Fecha AAAA-MM-DD → "JUL 26", validando el año del libro. */
function nombreDeHoja(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO));
  if (!m) throw new Error('Fecha inválida: "' + fechaISO + '". Se espera AAAA-MM-DD.');

  const anio = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) throw new Error('Fecha inválida: ' + fechaISO);

  // REGLA DURA: las hojas de 2025 tienen otro layout, corrido 2 columnas y sin
  // medio de pago. Escribir ahí sería corromper en silencio.
  const anioLibro = Number(prop('ANIO_LIBRO'));
  if (anio !== anioLibro) {
    throw new Error('La fecha ' + fechaISO + ' está fuera del libro (año ' + anioLibro + '). ' +
      'Este libro solo acepta de ENE ' + String(anioLibro).slice(-2) + ' a DIC ' + String(anioLibro).slice(-2) + '.');
  }
  return MESES[mes - 1] + ' ' + String(anio).slice(-2);
}

function hojaDelMes(ss, fechaISO) {
  return hojaPorNombre(ss, nombreDeHoja(fechaISO));
}

function hojaPorNombre(ss, nombre) {
  nombre = String(nombre || '').trim();
  const m = /^([A-Z]{3}) (\d{2})$/.exec(nombre);
  if (!m || MESES.indexOf(m[1]) === -1) throw new Error('Mes inválido: "' + nombre + '".');

  if (m[2] !== String(prop('ANIO_LIBRO')).slice(-2)) {
    throw new Error('El mes "' + nombre + '" está fuera del libro (año ' + prop('ANIO_LIBRO') + ').');
  }
  const hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new Error('No existe la pestaña "' + nombre + '".');
  return hoja;
}

// ═══════════════════════════════════════════════════════════
//  Lecturas
// ═══════════════════════════════════════════════════════════

function leerCategorias(ss) {
  const inicio = ss.getSheetByName('INICIO');
  if (!inicio) throw new Error('No existe la hoja INICIO.');
  return inicio.getRange(CATEGORIAS_RANGO).getValues()
    .map(function (f) { return String(f[0] || '').trim(); })
    .filter(function (v) { return v !== '' && v !== '-'; });
}

function leerMedios(hoja) {
  const dv = hoja.getRange('BM16').getDataValidation();
  if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    const lista = dv.getCriteriaValues()[0];
    if (lista && lista.length) return lista.map(function (v) { return String(v).trim(); });
  }
  return MEDIOS_FALLBACK;
}

/** La cotización que ya usa la planilla (GOOGLEFINANCE). Se propone, no se impone. */
function leerCambio(hoja) {
  const v = hoja.getRange(CELDA_CAMBIO).getValue();
  return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
}

function leerIndice(hoja) {
  const vals = hoja.getRange(AF_FILA_INI, AF_COL_INI, AF_SLOTS, AF_ANCHO).getValues();
  const primera = String(vals[0][0] || '');
  const roto = (primera.indexOf('#REF') === 0 || primera.indexOf('#ERROR') === 0);

  const items = [];
  if (!roto) {
    vals.forEach(function (f, i) {
      const desc = String(f[0] || '').trim();
      if (!desc) return;
      items.push({ fila: AF_FILA_INI + i, desc: desc, categoria: String(f[3] || '').trim() });
    });
  }

  return { total: AF_SLOTS, usados: items.length, libres: AF_SLOTS - items.length,
           lleno: items.length >= AF_SLOTS, roto: roto, items: items };
}

function leerGastos(ss, hoja) {
  const tz = ss.getSpreadsheetTimeZone();
  const n = CARGA_FILA_FIN - CARGA_FILA_INI + 1;
  const vals = hoja.getRange(CARGA_FILA_INI, CARGA_COL_INI, n, CARGA_ANCHO).getValues();

  const out = [];
  vals.forEach(function (f, i) {
    const desc = String(f[1] || '').trim();
    if (!desc) return;
    out.push({
      fila:     CARGA_FILA_INI + i,
      check:    f[0] === true,
      desc:     desc,
      montoUSD: f[3] === '' ? null : f[3],
      monto:    f[4] === '' ? null : f[4],
      cambio:   f[5] === '' ? null : f[5],
      medio:    String(f[6] || '').trim(),
      fecha:    (f[7] instanceof Date) ? Utilities.formatDate(f[7], tz, 'yyyy-MM-dd') : String(f[7] || ''),
      notas:    String(f[8] || '')
    });
  });
  return out;
}

// Lee el bloque Presupuesto vs Real (U15:Z33). Solo lectura.
// V = categoría · X = presupuesto (a mano) · Z = real (fórmula FILTER).

function leerPresupuesto(hoja) {
  var vals = hoja.getRange('V16:Z33').getValues();  // 18 filas: 16..33
  var items = [];

  for (var i = 0; i < 17; i++) {                    // 16..32 = las 17 categorías
    var cat = String(vals[i][0] || '').trim();      // V
    if (!cat) continue;
    items.push({
      categoria: cat,
      presupuesto: typeof vals[i][2] === 'number' ? vals[i][2] : 0,  // X
      real:        typeof vals[i][4] === 'number' ? vals[i][4] : 0    // Z
    });
  }

  var totalFila = vals[17];                          // fila 33
  return {
    items: items,
    totalPresupuesto: typeof totalFila[2] === 'number' ? totalFila[2] : 0,
    totalReal:        typeof totalFila[4] === 'number' ? totalFila[4] : 0
  };
}

// ═══════════════════════════════════════════════════════════
//  Pruebas desde el editor
// ═══════════════════════════════════════════════════════════

function probar() {
  Logger.log(doGet({ parameter: { token: prop('TOKEN') } }).getContent());
}

/** Pasa TODO el libro por la auditoría. No escribe nada. */
function probarAuditoria() {
  const e = { parameter: { token: prop('TOKEN'), accion: 'auditar', mes: 'todos' } };
  Logger.log(doGet(e).getContent());
}

/** OJO: escribe. */
function probarPost() {
  const payload = {
    token: prop('TOKEN'), accion: 'alta',
    fecha: '2026-07-17', desc: 'Cena', monto: 1234,
    medio: 'Transf. / Deb.', notas: 'prueba — borrar'
  };
  Logger.log(doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
}

/** OJO: escribe. Cambiar fila por una real. */
function probarEditar() {
  const payload = {
    token: prop('TOKEN'), accion: 'editar', mes: 'JUL 26', fila: 50,
    fecha: '2026-07-17', desc: 'Cena', monto: 4321,
    medio: 'Transf. / Deb.', notas: 'editado'
  };
  Logger.log(doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
}
