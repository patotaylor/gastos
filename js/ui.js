// ui.js — el mozo: agarra datos ya listos y los pinta en el DOM.
// No llama al script, no escucha clicks, no decide el flujo. Recibe todo lo
// que toca por parámetro; no agarra nada del aire.

export const $ = function (id) { return document.getElementById(id); };
export const plata = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

// Prepara texto para meterlo en HTML sin romper nada ni permitir inyección.
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Limpia un '1.234,50' a '1234.50'. Lógica pura, sin DOM — vive acá porque la
// usan las funciones de dibujo del monto, y no vale un archivo propio (todavía).
export function num(v) {
  return String(v || '').trim().replace(/\./g, '').replace(',', '.');
}

export function aviso(donde, tipo, html) {
  donde.innerHTML = '<div class="aviso ' + tipo + '">' + html + '</div>';
}
export function limpiarAvisos() { $('avisos').innerHTML = ''; }

// Dibuja el header, el contador AF, los dropdowns de medios y la lista.
// Devuelve true si el mes está sano (se puede cargar), false si AF está roto.
// 'estado' lleva { medioElegido, usd, APP, AUTOR }. Puede AJUSTAR medioElegido
// si el guardado ya no existe entre los medios del mes (por eso es un objeto:
// para devolver ese cambio a quien la llamó).
export function pintar(datos, estado) {
  $('mes').textContent = datos.mes; $('mes').classList.remove('cargando');
  $('firma').textContent = '© 2026 ' + estado.AUTOR.split(' ')[0] + ' · v' + estado.APP;

  if (datos.version !== estado.APP) {
    aviso($('avisos'), 'ojo', 'La app está en <b>v' + estado.APP + '</b> y el script responde <b>v' +
      esc(datos.version) + '</b>. Falta <b>Administrar implementaciones → Nueva versión</b>.');
  }

  var c = $('cuenta');
  c.hidden = false;
  $('cuUsadas').textContent = datos.indice.usados;
  $('cuBarra').style.width = Math.round(datos.indice.usados / datos.indice.total * 100) + '%';
  c.classList.toggle('alerta', datos.indice.libres <= 4 || datos.indice.roto);

  if (datos.indice.roto) {
    aviso($('avisos'), 'mal', '<b>AF16</b> de ' + datos.mes + ' está en #REF!: la fórmula ' +
      '<b>=UNIQUE</b> no se puede expandir porque hay algo escrito en su camino. El mes está ' +
      'sumando cero. Hay que destrabarla en la planilla antes de cargar.');
    $('guardar').disabled = true;
    return false;
  }
  $('guardar').disabled = false;

  if (datos.indice.lleno) {
    aviso($('avisos'), 'ojo', datos.mes + ' llegó a <b>32/32</b> descripciones. Podés cargar ' +
      'gastos con descripciones que ya existan; una nueva no entra hasta liberar una.');
  } else if (datos.indice.libres <= 4) {
    aviso($('avisos'), 'ojo', 'Quedan <b>' + datos.indice.libres + '</b> descripciones nuevas antes del tope de 32.');
  }

  $('descs').innerHTML = datos.indice.items.map(function (i) {
    return '<option value="' + esc(i.desc) + '">' + esc(i.categoria) + '</option>';
  }).join('');

  if (!estado.medioElegido || datos.medios.indexOf(estado.medioElegido) === -1) {
    estado.medioElegido = datos.medios[0];
  }
  $('medios').innerHTML = datos.medios.map(function (m) {
    return '<button type="button" class="ficha" aria-pressed="' + (m === estado.medioElegido) +
           '" data-m="' + esc(m) + '">' + esc(m) + '</button>';
  }).join('');
  $('edMedio').innerHTML = datos.medios.map(function (m) {
    return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
  }).join('');

  if (estado.usd && !$('cambio').value && datos.cambio) $('cambio').value = datos.cambio;

  pintarLista(datos, estado.marcar);
  return true;
}

export function pintarLista(datos, marcar) {
  var g = datos.gastos.slice().reverse();
  $('tituloLista').textContent = 'Gastos de ' + datos.mes + ' (' + datos.gastos.length + ')';

  if (!g.length) {
    $('lista').innerHTML = '<div class="g" style="cursor:default"><span class="d" style="color:var(--tenue)">' +
      'Todavía no hay gastos en ' + esc(datos.mes) + '. Este es el primero.</span></div>';
    return;
  }

  $('lista').innerHTML = g.map(function (x) {
    var extra = [x.fecha ? x.fecha.slice(8) + '/' + x.fecha.slice(5, 7) : 'sin fecha', x.medio];
    if (x.notas) extra.push(x.notas);
    if (x.montoUSD) extra.push('US$ ' + plata.format(x.montoUSD));
    return '<button class="g' + (x.check ? '' : ' off') + (x.fila === marcar ? ' nuevo' : '') +
           '" data-fila="' + x.fila + '">' +
             '<span class="f">' + x.fila + '</span>' +
             '<span class="d">' + esc(x.desc) + '<small>' + esc(extra.join(' · ')) + '</small></span>' +
             '<span class="m">' + (typeof x.monto === 'number' ? plata.format(x.monto) : '—') + '</span>' +
           '</button>';
  }).join('');
}

// Llena el panel del paso 3. onElegir(cat) se dispara al tocar una categoría.
export function pedirCategoria(datos, r, onElegir) {
  $('catDesc').textContent = r.desc;
  $('catPre').textContent = (r.nueva === false) ? 'Falta la categoría de ' : 'Primera vez que cargás ';
  $('catTexto').textContent = r.sugerencia
    ? 'Ya la usaste antes. Confirmá o elegí otra.'
    : 'Elegí en qué categoría suma.';
  $('catSugerida').innerHTML = '';

  if (r.sugerencia) {
    var b = document.createElement('button');
    b.className = 'sugerida';
    b.innerHTML = esc(r.sugerencia.categoria) + '<small>Así estaba en ' + esc(r.sugerencia.mes) + '</small>';
    b.addEventListener('click', function () { onElegir(r.sugerencia.categoria); });
    $('catSugerida').appendChild(b);
  }

  $('cats').innerHTML = datos.categorias.map(function (c) {
    return '<button type="button" class="ficha" data-c="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('');
  $('fondoCat').hidden = false;
}

// Pinta el resultado de la auditoría en su panel.
export function pintarAuditoria(r) {
  $('audMes').textContent = r.mes;
  $('audCuerpo').innerHTML = r.hallazgos.length
    ? r.hallazgos.map(function (h) {
        return '<div class="hallazgo"><b>AI' + h.fila + ' · ' + esc(h.tipo) + '</b><br>' + esc(h.detalle) + '</div>';
      }).join('')
    : '<div class="aviso bien">Sin hallazgos. Cada descripción tiene la misma categoría que en el resto del año.</div>';
  $('fondoAud').hidden = false;
}

// Dibuja presupuesto vs real, en dos secciones: variables y fijos. Solo lectura.
export function pintarPresupuesto(datos) {
  // Helper: una fila (categoría/servicio + barra). Evita repetir la lógica.
  function fila(nombre, real, presu) {
    var pct = presu > 0 ? (real / presu) : (real > 0 ? 2 : 0);
    var ancho = Math.min(100, Math.round(pct * 100));
    var estado = pct > 1 ? 'pasado' : (pct >= 0.85 ? 'medio' : '');
    return '<div class="presu-fila">' +
             '<div class="top">' +
               '<span class="cat">' + esc(nombre) + '</span>' +
               '<span class="cifras"><b>' + plata.format(real) + '</b> / ' +
                 plata.format(presu) + '</span>' +
             '</div>' +
             '<div class="presu-barra ' + estado + '"><i style="width:' + ancho + '%"></i></div>' +
           '</div>';
  }

  function total(real, presu) {
    var pct = presu > 0 ? (real / presu) : 0;
    var ancho = Math.min(100, Math.round(pct * 100));
    var estado = pct > 1 ? 'pasado' : (pct >= 0.85 ? 'medio' : '');
    return '<div class="presu-total">' +
             '<div class="top">' +
               '<span class="cat"><b>TOTAL</b></span>' +
               '<span class="cifras"><b>' + plata.format(real) + '</b> / ' +
                 plata.format(presu) + '</span>' +
             '</div>' +
             '<div class="presu-barra ' + estado + '"><i style="width:' + ancho + '%"></i></div>' +
           '</div>';
  }

  var p = datos.presupuesto;   // variables
  var f = datos.fijos;         // fijos

  var htmlVar =
    p.items.map(function (x) { return fila(x.categoria, x.real, x.presupuesto); }).join('') +
    total(p.totalReal, p.totalPresupuesto);

  var htmlFijos =
    f.items.map(function (x) { return fila(x.servicio, x.real, x.presupuesto); }).join('') +
    total(f.totalReal, f.totalPresupuesto);

  // Cuál se muestra depende del sub-toggle. Por defecto, Variables.
  var verFijos = $('subFijos').getAttribute('aria-pressed') === 'true';
  $('presuContenido').innerHTML = verFijos ? htmlFijos : htmlVar;
}

// Lista de fijos: una fila por servicio con lo pagado y el vencimiento.
// Los que no tienen monto se ven como "sin pagar" (checklist del mes).
export function pintarFijos(datos) {
  var f = datos.fijos;

  // Desplegable de carga (los 17 servicios)
  $('fijoServicio').innerHTML = f.servicios.map(function (s) {
    return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
  }).join('');

  // Lista: pagado + vencimiento por servicio
  $('listaFijos').innerHTML = f.items.map(function (x) {
    var pagado = x.real > 0;
    var venc  = x.vence  ? (x.vence.slice(8)  + '/' + x.vence.slice(5, 7))  : '—';
    var fpago = x.pagado ? (x.pagado.slice(8) + '/' + x.pagado.slice(5, 7)) : '—';
    var monto = pagado ? plata.format(x.real) : 'sin pagar';

    return '<button class="fijo-fila' + (pagado ? '' : ' off') + '" ' +
             'data-servicio="' + esc(x.servicio) + '" data-vence="' + esc(x.vence || '') + '">' +
             '<span class="fj-serv">' + esc(x.servicio) + '</span>' +
             '<span class="fj-monto">' + monto + '</span>' +
             '<span class="fj-pago">' + fpago + '</span>' +
             '<span class="fj-venc">' + venc + '</span>' +
           '</button>';
  }).join('');
}