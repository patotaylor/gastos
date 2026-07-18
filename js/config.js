// config.js — el cajón: leer y guardar la URL + token en localStorage.
// No dibuja ni llama al script. Cuida qué entra a su propio almacén.

const CLAVE = 'gastos.cfg';

// La regla de qué es una URL válida vive acá: si cambia la forma del /exec,
// este es el único lugar a tocar.
export function urlValida(url) {
  return /^https:\/\/script\.google\.com\/.*\/exec$/.test(url);
}

// Devuelve {url, token} o null si no hay nada guardado.
export function leerConfig() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE));
  } catch (e) {
    return null;
  }
}

// Guarda. Se niega si la URL no pasa: config cuida su cajón.
export function guardarConfig(url, token) {
  url = String(url || '').trim();
  token = String(token || '').trim();
  if (!urlValida(url)) throw new Error('La URL tiene que terminar en /exec. La de /dev no sirve.');
  if (!token) throw new Error('Falta el token.');
  const cfg = { url: url, token: token };
  localStorage.setItem(CLAVE, JSON.stringify(cfg));
  return cfg;
}