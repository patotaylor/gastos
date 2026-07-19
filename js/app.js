// app.js — el director: importa de los otros tres, guarda el estado, escucha
// los eventos y coordina el flujo. Es el único que puede tocar todo.

import { leerConfig, guardarConfig } from './config.js';
import { traer, mandar } from './api.js';
import {
  $, plata, esc, num, aviso, limpiarAvisos,
  pintar, pintarLista, pedirCategoria, pintarAuditoria, pintarPresupuesto, pintarFijos
} from './ui.js';

// Versión del proyecto entero: esta y la del script tienen que coincidir.
const APP = '0.7';
const AUTOR = 'Patricio Taylor';

// Estado de la app. Lo que antes eran variables sueltas "en el aire".
var cfg = null, datos = null, medioElegido = '', usd = false, edUsd = false;
var enviando = false, editando = null, pendiente = null, ultimaCarga = 0;
var vencServicioActual = '';
var fijoUsd = false, fijoMedio = '';

// ── Configuración ──

function mostrarConfig() {
  $('vistaApp').hidden = true; $('vistaConfig').hidden = false;
  if (cfg) { $('cfgUrl').value = cfg.url; $('cfgToken').value = cfg.token; }
}

$('cfgGuardar').addEventListener('click', function () {
  try {
    cfg = guardarConfig($('cfgUrl').value, $('cfgToken').value);   // config valida y guarda
  } catch (e) {
    return aviso($('cfgError'), 'mal', esc(e.message));
  }
  $('cfgError').innerHTML = '';
  $('vistaConfig').hidden = true; $('vistaApp').hidden = false;
  cargar();
});

$('reconfigurar').addEventListener('click', mostrarConfig);
$('firma').addEventListener('click', function () {
  alert('Gastos Variables v' + APP + '\n© 2026 ' + AUTOR +
        '\nTodos los derechos reservados.\n\n' +
        'Script: ' + (datos ? datos.version : 'sin conectar') + '\n' +
        'Planilla: ' + (datos ? datos.mes : '—'));
});

// ── Pestañas ──

function irA(pestania) {
  $('panelCargar').hidden = pestania !== 'cargar';
  $('panelFijos').hidden  = pestania !== 'fijos';
  $('panelPresu').hidden  = pestania !== 'presu';

  $('tabCargar').setAttribute('aria-pressed', pestania === 'cargar');
  $('tabFijos').setAttribute('aria-pressed', pestania === 'fijos');
  $('tabPresu').setAttribute('aria-pressed', pestania === 'presu');

  // Presupuesto no carga nada: se esconde el pie entero. Las otras dos muestran
  // el pie con su botón (y ocultan el de la otra).
  $('pie').hidden = (pestania === 'presu');
  $('guardar').hidden = (pestania !== 'cargar');
  $('guardarFijo').hidden = (pestania !== 'fijos');

  if (pestania === 'presu' && datos) pintarPresupuesto(datos);
  if (pestania === 'fijos' && datos) pintarFijos(datos);
}

$('tabCargar').addEventListener('click', function () { irA('cargar'); });
$('tabFijos').addEventListener('click', function () { irA('fijos'); });
$('tabPresu').addEventListener('click', function () { irA('presu'); });

$('subVar').addEventListener('click', function () {
  $('subVar').setAttribute('aria-pressed', 'true');
  $('subFijos').setAttribute('aria-pressed', 'false');
  if (datos) pintarPresupuesto(datos);
});
$('subFijos').addEventListener('click', function () {
  $('subVar').setAttribute('aria-pressed', 'false');
  $('subFijos').setAttribute('aria-pressed', 'true');
  if (datos) pintarPresupuesto(datos);
});

// ── Selector de mes ──

var MESES_APP = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

$('mesBtn').addEventListener('click', function () {
  if (!datos) return;
  var yy = datos.mes.split(' ')[1];           // "26"
  var actual = datos.mes.split(' ')[0];        // "JUL"
  $('mesesGrid').innerHTML = MESES_APP.map(function (m) {
    return '<button class="mes-opcion" aria-pressed="' + (m === actual) +
           '" data-mes="' + m + ' ' + yy + '">' + m + '</button>';
  }).join('');
  $('fondoMes').hidden = false;
});

$('mesesGrid').addEventListener('click', function (ev) {
  var b = ev.target.closest('.mes-opcion');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(10);
  $('fondoMes').hidden = true;
  cambiarMes(b.dataset.mes);
});

$('mesCancelar').addEventListener('click', function () { $('fondoMes').hidden = true; });

function cambiarMes(mes) {
  $('fecha').value = '';                        // que no fuerce el mes por fecha
  $('mes').textContent = '···'; $('mes').classList.add('cargando');
  $('recargar').classList.add('girando');

  traer(cfg, '&mes=' + encodeURIComponent(mes))
    .then(function (r) {
      if (!r.ok) { $('mes').textContent = '—'; return aviso($('avisos'), 'mal', esc(r.error)); }
      datos = r;
      var estado = { medioElegido: medioElegido, usd: usd, APP: APP, AUTOR: AUTOR };
      pintar(datos, estado);
      medioElegido = estado.medioElegido;
      refrescarFijos();
      // Repintá la pestaña activa
      if (!$('panelFijos').hidden) pintarFijos(datos);
      if (!$('panelPresu').hidden) pintarPresupuesto(datos);
    })
    .catch(function (e) { $('mes').textContent = '—'; aviso($('avisos'), 'mal', esc(e.message)); })
    .then(function () { $('recargar').classList.remove('girando'); ultimaCarga = Date.now(); });
}

// ── Fijos ──

// Se llama desde pintar()/cargar cuando llegan datos, para tener medios y desplegable al día.
function refrescarFijos() {
  if (!datos) return;
  if (!fijoMedio || datos.medios.indexOf(fijoMedio) === -1) fijoMedio = datos.medios[0];
  $('fijoMedios').innerHTML = datos.medios.map(function (m) {
    return '<button type="button" class="ficha" aria-pressed="' + (m === fijoMedio) +
           '" data-m="' + esc(m) + '">' + esc(m) + '</button>';
  }).join('');
  if (!$('fijoFecha').value) $('fijoFecha').value = datos.hoy;
  if (fijoUsd && !$('fijoCambio').value && datos.cambio) $('fijoCambio').value = datos.cambio;
}

$('fijoMedios').addEventListener('click', function (ev) {
  var b = ev.target.closest('.ficha');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(10);
  fijoMedio = b.dataset.m;
  [].forEach.call(this.querySelectorAll('.ficha'), function (x) { x.setAttribute('aria-pressed', x === b); });
});

function fijoModoMoneda(esUSD) {
  fijoUsd = esUSD;
  $('fijoArs').setAttribute('aria-pressed', !esUSD);
  $('fijoUsd').setAttribute('aria-pressed', esUSD);
  $('fijoSimbolo').textContent = esUSD ? 'US$' : '$';
  $('fijoRotMonto').textContent = esUSD ? 'Monto dólares' : 'Monto pesos';
  $('fijoBloqueUSD').hidden = !esUSD;
  if (esUSD && !$('fijoCambio').value && datos && datos.cambio) $('fijoCambio').value = datos.cambio;
  fijoEquivalencia();
}
$('fijoArs').addEventListener('click', function () { fijoModoMoneda(false); });
$('fijoUsd').addEventListener('click', function () { fijoModoMoneda(true); });

function fijoEquivalencia() {
  if (!fijoUsd) return ($('fijoEquivale').textContent = '');
  var u = Number(num($('fijoMonto').value)), c = Number(num($('fijoCambio').value));
  $('fijoEquivale').textContent = (u > 0 && c > 0) ? '= $ ' + plata.format(u * c) : '';
}
$('fijoMonto').addEventListener('input', fijoEquivalencia);
$('fijoCambio').addEventListener('input', fijoEquivalencia);

$('guardarFijo').addEventListener('click', function () {
  $('avisosFijos').innerHTML = ''; 
  var p = { accion: 'altaFijo', fecha: $('fijoFecha').value,
            servicio: $('fijoServicio').value, medio: fijoMedio };
  if (fijoUsd) { p.montoUSD = num($('fijoMonto').value); p.cambio = num($('fijoCambio').value); }
  else { p.monto = num($('fijoMonto').value); }

  if (!(fijoUsd ? p.montoUSD : p.monto)) return aviso($('avisosFijos'), 'mal', 'Falta el monto.');

  procesar(p, $('guardarFijo'), 'Guardando…', function (r) {
    aviso($('avisosFijos'), 'bien', '<b>' + esc(r.servicio) + '</b> cargado en ' + esc(r.mes) + ', fila <b>' + r.fila + '</b>.');
    $('fijoMonto').value = '';
    fijoEquivalencia();
    var av = $('avisosFijos').innerHTML;
    cargar().then(function () { $('avisosFijos').innerHTML = av; irA('fijos'); });
  });
});

$('btnCopiarVenc').addEventListener('click', function () {
  var b = this; b.textContent = '···';
  procesar({ accion: 'copiarVenc', mes: datos.mes }, b, '···', function (r) {
    b.textContent = 'Copiar del mes anterior';
    aviso($('avisosFijos'), 'bien', r.copiados
      ? 'Se copiaron <b>' + r.copiados + '</b> vencimientos del mes anterior (+1 mes).'
      : 'No había vencimientos nuevos para copiar (los que hay ya estaban cargados).');
    var av = $('avisosFijos').innerHTML;
    cargar().then(function () { $('avisosFijos').innerHTML = av; irA('fijos'); });
  });
});

// ── Editar un fijo (pago + vencimiento en un solo panel) ──

var fijoEdServicio = '', fijoEdUsd = false, fijoEdMedio = '';

$('listaFijos').addEventListener('click', function (ev) {
  var b = ev.target.closest('.fijo-fila[data-servicio]');
  if (!b || b.classList.contains('fijo-head')) return;
  abrirEdicionFijo(b.dataset.servicio);
});

function abrirEdicionFijo(servicio) {
  var item = null;
  datos.fijos.items.forEach(function (x) { if (x.servicio === servicio) item = x; });
  if (!item) return;

  fijoEdServicio = servicio;
  $('fijoEdTitulo').textContent = servicio;
  $('fijoEdError').innerHTML = '';

  // Medios
  if (!fijoEdMedio || datos.medios.indexOf(fijoEdMedio) === -1) fijoEdMedio = datos.medios[0];
  $('fijoEdMedios').innerHTML = datos.medios.map(function (m) {
    return '<button type="button" class="ficha" aria-pressed="' + (m === fijoEdMedio) +
           '" data-m="' + esc(m) + '">' + esc(m) + '</button>';
  }).join('');

  // Monto (siempre en pesos al abrir; el real ya es pesos)
  fijoEdModoMoneda(false);
  $('fijoEdMonto').value = item.real > 0 ? item.real : '';
  $('fijoEdFecha').value = item.pagado || datos.hoy;
  $('fijoEdVence').value = item.vence || '';

  $('fondoFijo').hidden = false;
}

$('fijoEdMedios').addEventListener('click', function (ev) {
  var b = ev.target.closest('.ficha');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(10);
  fijoEdMedio = b.dataset.m;
  [].forEach.call(this.querySelectorAll('.ficha'), function (x) { x.setAttribute('aria-pressed', x === b); });
});

function fijoEdModoMoneda(esUSD) {
  fijoEdUsd = esUSD;
  $('fijoEdArs').setAttribute('aria-pressed', !esUSD);
  $('fijoEdUsd').setAttribute('aria-pressed', esUSD);
  $('fijoEdSimbolo').textContent = esUSD ? 'US$' : '$';
  $('fijoEdRotMonto').textContent = esUSD ? 'Monto dólares' : 'Monto pesos';
  $('fijoEdBloqueUSD').hidden = !esUSD;
  if (esUSD && !$('fijoEdCambio').value && datos && datos.cambio) $('fijoEdCambio').value = datos.cambio;
  fijoEdEquivalencia();
}
$('fijoEdArs').addEventListener('click', function () { fijoEdModoMoneda(false); });
$('fijoEdUsd').addEventListener('click', function () { fijoEdModoMoneda(true); });

function fijoEdEquivalencia() {
  if (!fijoEdUsd) return ($('fijoEdEquivale').textContent = '');
  var u = Number(num($('fijoEdMonto').value)), c = Number(num($('fijoEdCambio').value));
  $('fijoEdEquivale').textContent = (u > 0 && c > 0) ? '= $ ' + plata.format(u * c) : '';
}
$('fijoEdMonto').addEventListener('input', fijoEdEquivalencia);
$('fijoEdCambio').addEventListener('input', fijoEdEquivalencia);

$('fijoEdCancelar').addEventListener('click', function () { $('fondoFijo').hidden = true; });

$('fijoEdGuardar').addEventListener('click', function () {
  // 1) Guardar el pago (monto + fecha + medio)
  var p = { accion: 'editarFijo', mes: datos.mes, servicio: fijoEdServicio,
            fecha: $('fijoEdFecha').value, medio: fijoEdMedio };
  if (fijoEdUsd) { p.montoUSD = num($('fijoEdMonto').value); p.cambio = num($('fijoEdCambio').value); }
  else { p.monto = num($('fijoEdMonto').value); }

  if (!(fijoEdUsd ? p.montoUSD : p.monto)) return aviso($('fijoEdError'), 'mal', 'Falta el monto.');

  var vence = $('fijoEdVence').value;

  procesar(p, $('fijoEdGuardar'), 'Guardando…', function (r) {
    // 2) Si hay vencimiento, guardarlo también (segunda llamada)
    if (vence) {
      mandar(cfg, { accion: 'vencimiento', mes: datos.mes, servicio: fijoEdServicio, vence: vence })
        .then(function () { cerrarYRefrescarFijo(r.servicio); });
    } else {
      cerrarYRefrescarFijo(r.servicio);
    }
  });
});

function cerrarYRefrescarFijo(servicio) {
  $('fondoFijo').hidden = true;
  aviso($('avisosFijos'), 'bien', '<b>' + esc(servicio) + '</b> actualizado.');
  var av = $('avisosFijos').innerHTML;
  cargar().then(function () { $('avisosFijos').innerHTML = av; irA('fijos'); });
}

// ── Actualizar presupuesto ──

$('btnActualizarPresu').addEventListener('click', function () {
  var b = this; b.textContent = '···';
  mandar(cfg, { accion: 'actualizarPresu', mes: datos.mes, soloVer: true })
    .then(function (r) {
      b.textContent = 'Actualizar presupuesto';
      if (!r.ok) return aviso($('avisosPresu'), 'mal', esc(r.error));
      if (!r.cambios.length) {
        return aviso($('avisosPresu'), 'bien', 'Ningún presupuesto se pasó. No hay nada que actualizar.');
      }
      $('presuCambios').innerHTML = r.cambios.map(function (c) {
        return '<div class="presu-cambio"><span>' + esc(c.nombre) +
               ' <small>(' + c.tipo + ')</small></span>' +
               '<span class="cifras">' + plata.format(c.de) + ' → <b>' + plata.format(c.a) + '</b></span></div>';
      }).join('');
      $('fondoPresu').hidden = false;
    })
    .catch(function (e) { b.textContent = 'Actualizar presupuesto'; aviso($('avisosPresu'), 'mal', esc(e.message)); });
});

$('presuCancelar').addEventListener('click', function () { $('fondoPresu').hidden = true; });

$('presuConfirmar').addEventListener('click', function () {
  $('fondoPresu').hidden = true;
  procesar({ accion: 'actualizarPresu', mes: datos.mes, soloVer: false },
    $('presuConfirmar'), '···', function (r) {
      cargar().then(function () {
        aviso($('avisosPresu'), 'bien', 'Se actualizaron ' + r.aplicados + ' presupuestos.');
        pintarPresupuesto(datos);
      });
    });
});
// ── Cargar el mes ──

function cargar(marcar) {
  var f = $('fecha').value;
  $('mes').textContent = '···'; $('mes').classList.add('cargando');
  $('recargar').classList.add('girando');

  return traer(cfg, f ? '&fecha=' + f : '')
    .then(function (r) {
      if (!r.ok) { $('mes').textContent = '—'; return aviso($('avisos'), 'mal', esc(r.error)); }
      datos = r;
      if (!$('fecha').value) $('fecha').value = r.hoy;
      var estado = { medioElegido: medioElegido, usd: usd, APP: APP, AUTOR: AUTOR, marcar: marcar };
      pintar(datos, estado);
      medioElegido = estado.medioElegido;
      refrescarFijos();
      // Repintar la pestaña activa (igual que en cambiarMes)
      if (!$('panelFijos').hidden) pintarFijos(datos);
      if (!$('panelPresu').hidden) pintarPresupuesto(datos);   // pintar pudo reajustarlo
    })
    .catch(function (e) {
      $('mes').textContent = '—';
      aviso($('avisos'), 'mal', 'No se pudo conectar con el script.<br>' + esc(e.message));
    })
    .then(function () {
      $('recargar').classList.remove('girando');
      ultimaCarga = Date.now();
    });
}

$('recargar').addEventListener('click', function () { limpiarAvisos(); cargar(); });

// Al volver a la app después de un rato, refrescar sola: el caso típico es
// haber tocado la planilla en Sheets y volver acá.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (!cfg || !datos || enviando) return;
  if (Date.now() - ultimaCarga < 15000) return;
  cargar();
});

// ── Alta ──

$('medios').addEventListener('click', function (ev) {
  var b = ev.target.closest('.ficha');
  if (!b) return;
  medioElegido = b.dataset.m;
  [].forEach.call(this.querySelectorAll('.ficha'), function (x) { x.setAttribute('aria-pressed', x === b); });
});

$('fecha').addEventListener('change', function () { cargar(); });

function modoMoneda(esUSD) {
  usd = esUSD;
  $('mArs').setAttribute('aria-pressed', !esUSD);
  $('mUsd').setAttribute('aria-pressed', esUSD);
  $('simbolo').textContent = esUSD ? 'US$' : '$';
  $('rotMonto').textContent = esUSD ? 'Monto dólares' : 'Monto pesos';
  $('bloqueUSD').hidden = !esUSD;
  if (esUSD && !$('cambio').value && datos && datos.cambio) $('cambio').value = datos.cambio;
  equivalencia();
}
$('mArs').addEventListener('click', function () { modoMoneda(false); });
$('mUsd').addEventListener('click', function () { modoMoneda(true); });

function equivalencia() {
  if (!usd) return ($('equivale').textContent = '');
  var u = Number(num($('monto').value)), c = Number(num($('cambio').value));
  $('equivale').textContent = (u > 0 && c > 0) ? '= $ ' + plata.format(u * c) + '  →  BK = =BJ*BL' : '';
}
$('monto').addEventListener('input', equivalencia);
$('cambio').addEventListener('input', equivalencia);

$('guardar').addEventListener('click', function () {
  var p = { accion: 'alta', fecha: $('fecha').value, desc: $('desc').value.trim(),
            medio: medioElegido, notas: $('notas').value.trim() };
  if (usd) { p.montoUSD = num($('monto').value); p.cambio = num($('cambio').value); }
  else { p.monto = num($('monto').value); }

  if (!p.desc) return aviso($('avisos'), 'mal', 'Falta la descripción.');
  if (!(usd ? p.montoUSD : p.monto)) return aviso($('avisos'), 'mal', 'Falta el monto.');

  limpiarAvisos();
  procesar(p, $('guardar'), 'Guardando…', function (r) {
    aviso($('avisos'), 'bien', 'Guardado en <b>' + esc(r.mes) + '</b>, fila <b>' + r.fila + '</b>.' +
      (r.realineadas ? ' Se realinearon ' + r.realineadas + ' categorías.' : ''));
    $('desc').value = ''; $('monto').value = ''; $('notas').value = '';
    equivalencia();
    var av = $('avisos').innerHTML;
    cargar(r.fila).then(function () { $('avisos').innerHTML = av; });
  });
});

// ── Motor común: alta, edición y check pasan por acá ──

function procesar(payload, boton, texto, alSalirBien) {
  if (enviando) return;
  enviando = true;
  var original = boton.textContent;
  boton.disabled = true; boton.textContent = texto;

  mandar(cfg, payload)
    .then(function (r) {
      if (r.requiereCategoria) {
        pendiente = { payload: payload, boton: boton, texto: texto, ok: alSalirBien };
        return pedirCategoria(datos, r, conCategoria);
      }
      if (!r.ok) { return aviso(boton === $('guardar') ? $('avisos') : $('edError'), 'mal', esc(r.error)); }
      cerrarPaneles();
      alSalirBien(r);
    })
    .catch(function (e) {
      aviso(boton === $('guardar') ? $('avisos') : $('edError'), 'mal', 'No se pudo guardar.<br>' + esc(e.message));
    })
    .then(function () { enviando = false; boton.disabled = false; boton.textContent = original; });
}

// ── Edición ──

$('lista').addEventListener('click', function (ev) {
  var b = ev.target.closest('.g[data-fila]');
  if (b) abrirEdicion(Number(b.dataset.fila));
});

function abrirEdicion(fila) {
  var g = null;
  datos.gastos.forEach(function (x) { if (x.fila === fila) g = x; });
  if (!g) return;
  editando = g;

  $('edFila').textContent = datos.mes + ' · ' + fila;
  $('edSub').textContent = g.check ? 'Suma en el total del mes.' : 'Está fuera del total (check destildado).';
  $('edDesc').value = g.desc;
  $('edFecha').value = g.fecha || datos.hoy;
  $('edNotas').value = g.notas || '';
  $('edMedio').value = g.medio;
  $('edError').innerHTML = '';

  edModo(!!g.montoUSD);
  $('edMonto').value = g.montoUSD ? g.montoUSD : (typeof g.monto === 'number' ? g.monto : '');
  $('edCambio').value = g.cambio || (datos.cambio || '');
  edEquivalencia();

  $('edQuitar').textContent = g.check ? 'Quitar del total' : 'Volver a sumar';
  $('edQuitar').className = 'btn ' + (g.check ? 'peligro' : 'verde');
  $('fondoEd').hidden = false;
}

function edModo(esUSD) {
  edUsd = esUSD;
  $('edArs').setAttribute('aria-pressed', !esUSD);
  $('edUsd').setAttribute('aria-pressed', esUSD);
  $('edRotMonto').textContent = esUSD ? 'Monto dólares' : 'Monto pesos';
  $('edBloqueUSD').hidden = !esUSD;
  edEquivalencia();
}
$('edArs').addEventListener('click', function () { edModo(false); });
$('edUsd').addEventListener('click', function () { edModo(true); });

function edEquivalencia() {
  if (!edUsd) return ($('edEquivale').textContent = '');
  var u = Number(num($('edMonto').value)), c = Number(num($('edCambio').value));
  $('edEquivale').textContent = (u > 0 && c > 0) ? '= $ ' + plata.format(u * c) : '';
}
$('edMonto').addEventListener('input', edEquivalencia);
$('edCambio').addEventListener('input', edEquivalencia);

$('edGuardar').addEventListener('click', function () {
  var p = { accion: 'editar', mes: datos.mes, fila: editando.fila, fecha: $('edFecha').value,
            desc: $('edDesc').value.trim(), medio: $('edMedio').value, notas: $('edNotas').value.trim() };
  if (edUsd) { p.montoUSD = num($('edMonto').value); p.cambio = num($('edCambio').value); }
  else { p.monto = num($('edMonto').value); }

  if (!p.desc) return aviso($('edError'), 'mal', 'Falta la descripción.');

  procesar(p, $('edGuardar'), 'Guardando…', function (r) {
    aviso($('avisos'), 'bien', 'Fila <b>' + r.fila + '</b> actualizada.' +
      (r.realineadas ? ' Se realinearon <b>' + r.realineadas + '</b> categorías en AI.' : ''));
    var av = $('avisos').innerHTML;
    cargar(r.fila).then(function () { $('avisos').innerHTML = av; });
  });
});

$('edQuitar').addEventListener('click', function () {
  var nuevo = !editando.check;
  procesar({ accion: 'check', mes: datos.mes, fila: editando.fila, check: nuevo },
    $('edQuitar'), '…', function (r) {
      aviso($('avisos'), 'bien', 'Fila <b>' + r.fila + '</b> ' +
        (nuevo ? 'vuelve a sumar en el total.' : 'quedó fuera del total. La descripción sigue ahí: por eso no se desalinea nada.'));
      var av = $('avisos').innerHTML;
      cargar(r.fila).then(function () { $('avisos').innerHTML = av; });
    });
});

$('edBorrar').addEventListener('click', function () {
  $('borrarDesc').textContent = editando.desc;
  $('borrarSub').textContent = 'Fila ' + editando.fila + ' de ' + datos.mes +
    '. Se va de la planilla y no se puede deshacer.';
  $('fondoBorrar').hidden = false;
});

$('borrarCancelar').addEventListener('click', function () { $('fondoBorrar').hidden = true; });

$('borrarConfirmar').addEventListener('click', function () {
  $('fondoBorrar').hidden = true;
  var g = editando;
  procesar({ accion: 'borrar', mes: datos.mes, fila: g.fila },
    $('borrarConfirmar'), 'Borrando…', function (r) {
      aviso($('avisos'), 'bien', 'Fila <b>' + r.fila + '</b> borrada.' +
        (r.realineadas ? ' Se realinearon <b>' + r.realineadas + '</b> categorías en AI.' : ''));
      var av = $('avisos').innerHTML;
      cargar().then(function () { $('avisos').innerHTML = av; });
    });
});

$('edCerrar').addEventListener('click', cerrarPaneles);

// ── Paso 3: la categoría ──

$('cats').addEventListener('click', function (ev) {
  var b = ev.target.closest('.ficha');
  if (b) {
    if (navigator.vibrate) navigator.vibrate(10);
    conCategoria(b.dataset.c);
  }
});

function conCategoria(cat) {
  if (!pendiente) return;
  var p = pendiente;
  pendiente = null;
  $('fondoCat').hidden = true;
  p.payload.categoria = cat;
  procesar(p.payload, p.boton, p.texto, p.ok);
}

$('catCancelar').addEventListener('click', function () { pendiente = null; $('fondoCat').hidden = true; });

function cerrarPaneles() {
  $('fondoCat').hidden = true;
  $('fondoEd').hidden = true;
  $('fondoBorrar').hidden = true;
  $('fondoFijo').hidden = true;
  $('fondoPresu').hidden = true;
}
// ── Auditoría ──

$('btnAuditar').addEventListener('click', function () {
  var b = this; b.textContent = '···';
  traer(cfg, '&accion=auditar&mes=' + encodeURIComponent(datos.mes))
    .then(function (r) {
      b.textContent = 'Revisar';
      if (!r.ok) return aviso($('avisos'), 'mal', esc(r.error));
      pintarAuditoria(r);
    })
    .catch(function (e) { b.textContent = 'Revisar'; aviso($('avisos'), 'mal', esc(e.message)); });
});

$('audCerrar').addEventListener('click', function () { $('fondoAud').hidden = true; });

// ── Arranque ──

cfg = leerConfig();
if (!cfg) mostrarConfig();
else { $('vistaApp').hidden = false; cargar(); }