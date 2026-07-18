// app.js — el director: importa de los otros tres, guarda el estado, escucha
// los eventos y coordina el flujo. Es el único que puede tocar todo.

import { leerConfig, guardarConfig } from './config.js';
import { traer, mandar } from './api.js';
import {
  $, plata, esc, num, aviso, limpiarAvisos,
  pintar, pintarLista, pedirCategoria, pintarAuditoria
} from './ui.js';

// Versión del proyecto entero: esta y la del script tienen que coincidir.
const APP = '0.4';
const AUTOR = 'Patricio Taylor';

// Estado de la app. Lo que antes eran variables sueltas "en el aire".
var cfg = null, datos = null, medioElegido = '', usd = false, edUsd = false;
var enviando = false, editando = null, pendiente = null, ultimaCarga = 0;

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
      medioElegido = estado.medioElegido;   // pintar pudo reajustarlo
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

$('edCerrar').addEventListener('click', cerrarPaneles);

// ── Paso 3: la categoría ──

$('cats').addEventListener('click', function (ev) {
  var b = ev.target.closest('.ficha');
  if (b) conCategoria(b.dataset.c);
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

function cerrarPaneles() { $('fondoCat').hidden = true; $('fondoEd').hidden = true; }

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