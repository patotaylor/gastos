// api.js — habla con el /exec y nada más. No sabe qué es un mes ni de dónde
// sale el token: recibe la config por parámetro (inyección de dependencias) y
// hace el fetch. Pieza suelta, testeable, sin dependencias de otros módulos.

// GET → doGet. 'extra' se pega a la query (ej: '&fecha=2026-07-18').
export function traer(cfg, extra) {
    const url = cfg.url + '?token=' + encodeURIComponent(cfg.token) + (extra || '');
    return fetch(url).then(function (r) { return r.json(); });
  }
  
  // POST → doPost. El token viaja en el cuerpo, junto al resto del payload.
  // text/plain a propósito: application/json dispara un preflight CORS que
  // Apps Script no soporta. No lo cambies a json.
  export function mandar(cfg, payload) {
    payload.token = cfg.token;
    return fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }