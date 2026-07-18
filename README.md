# Gastos Variables

PWA para cargar gastos variables en la planilla `Presupuesto` (Google Sheets),
vía un Apps Script standalone. Uso personal.

## Estructura

```
├── index.html          estructura
├── manifest.json       PWA
├── css/style.css       estilos
├── js/
│   ├── config.js       localStorage: URL + token (leer/guardar/validar)
│   ├── api.js          fetch al /exec (traer / mandar)
│   ├── ui.js           pintar el DOM (no decide, no llama al script)
│   └── app.js          estado, eventos y orquestación
├── assets/icons/       íconos PWA
└── apps-script/
    └── Codigo.gs        copia versionada del backend
```

Los módulos van de menos a más dependencias: `config` y `api` no dependen de
nadie; `ui` solo pinta; `app` importa a los tres y coordina.

## Probar en local

Los módulos ES (`<script type="module">`) no corren con doble clic (`file://`).
Hay que servir por HTTP:

```
python -m http.server 8000
```

Y abrir `http://localhost:8000`.

## Deploy

- **Front:** commit → merge a `main` → GitHub Pages actualiza en ~1 min.
- **Script:** pegar `apps-script/Codigo.gs` en el editor → Guardar →
  *Administrar implementaciones → ✏️ → Nueva versión*.
- **Las dos versiones (front y script) tienen que coincidir.** Si no, la app avisa.

## Config (en el teléfono, no en el repo)

La URL `/exec` y el token viven en el `localStorage` del dispositivo. No están
versionados: el repo es público y no guarda secretos.

Script Properties del proyecto de Apps Script: `SPREADSHEET_ID`, `ANIO_LIBRO`, `TOKEN`.

© 2026 Patricio Taylor. Todos los derechos reservados.
