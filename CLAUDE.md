# FLICK GP — guía para sesiones de desarrollo

Juego de carreras por impulsos para iPhone. Sitio **estático** publicado en Vercel:
`index.html` + `client.js` + `local.js` + `save.js` + `logic.js`. Sin build, sin bundler,
sin dependencias. Se abre tal cual en Safari.

## Arquitectura

- **`logic.js` es la autoridad.** Toda la física, la IA (`cpuShot`), el orden de turnos,
  puntajes, economía y validación de acciones viven acá. API pública:
  `setup`, `validateAction`, `applyAction`, `isGameOver`, `viewFor`, `meta`, `VERSION`.
  El export `__test` es solo para `tools/` (no lo use el juego).
- **`client.js` solo renderiza** lo que llega en `viewFor(...)` y manda acciones.
  Nunca calcula resultados de carrera ni decide reglas. Si la UI necesita un dato, se
  agrega a `viewFor` en `logic.js`.
- **`local.js`** simula un WebSocket en el navegador: recibe acciones, llama a
  `logic.js` y guarda el estado en `localStorage` (`flickgp:standalone:save`).
- **`save.js`**: formato del guardado (`saveVersion`) y `migrate(saved, who)` con pasos
  explícitos por versión. Una migración **nunca** puede perder créditos, mejoras,
  historial ni totales de campeonatos (todo eso está en `state.career`). Si cambia el
  formato: subí `SAVE_VERSION`, agregá un paso en `STEPS` y un fixture en `tools/fixtures/`.
- **Versión**: un único `VERSION` en `logic.js`; llega al cliente por `viewFor().version`
  y se usa en `<title>`, pie y modal de grilla. No escribas versiones a mano en el HTML.

## Herramientas (Node ≥ 18, sin `npm install`)

| Comando | Qué hace |
|---|---|
| `npm run golden` | Corre 22 carreras/campeonatos completos sin interfaz y compara bit a bit con `tools/golden.json`. Falla ante cualquier diferencia. |
| `npm run golden:update` | Regenera `tools/golden.json`. |
| `npm run sim -- --track desert --difficulty expert` | Una carrera headless con tabla de resultados (`--cup classic` para un campeonato). |
| `npm run perf` | ms por ronda (8 autos, IA incluida) en Experto. Meta: < 40 ms. `--difficulty pro`, `--tracks valley,city`, `--check` para fallar si se pasa. |
| `npm test` | `nearest-test` (grilla vs. algoritmo original) + `migrate-test` (saves 0.6/0.7.3/0.7.4) + golden. |

### Regla de oro

**Cambios de física o IA requieren `npm run golden:update` justificado en el PR**
(qué cambió, por qué, y cómo se movieron los resultados). Optimizaciones, refactors y
cambios de UI tienen que pasar `npm run golden` **sin diferencias**.

Detalles que rompen el golden aunque "parezcan iguales": reordenar operaciones de punto
flotante, cambiar `Math.hypot` por `Math.sqrt(dx*dx+dy*dy)`, cambiar el desempate de
`nearest()` o de los `sort`, sacar/agregar llamadas que dependan del orden de los autos.

`nearest()` usa una grilla espacial por pista cuya lista de candidatos se arma con cotas
de distancia (no con el último índice), así que es exacta incluso donde dos tramos pasan
cerca (Desierto Rojo, s≈383 y s≈1482). Si tocás `road()`, `K` o los puntos de control,
corré `node tools/nearest-test.mjs`.

## Convenciones

- **Textos de la UI en español rioplatense** (voseo): "Tocá tu auto", "Elegí el circuito",
  "Terminaste 7.º". Nada de "tú" ni inglés en la interfaz.
- **Mobile-first, iPhone primero**: probar a 390×844 (y 375×667). Respetar
  `env(safe-area-inset-*)`; nada de scroll del documento; el header no puede partirse en
  dos líneas.
- **Nada de dependencias ni build.** Sin frameworks, sin CDNs, sin transpilar. ES modules
  nativos. `package.json` existe solo para los scripts de `tools/`.
- Vista previa al compartir: las URLs de `og:url`, `og:image` y `twitter:image` en
  `index.html` tienen que ser absolutas al dominio de producción.

## Publicación

Vercel conectado al repo: `vercel.json` (sin install ni build, sale la raíz tal cual,
`Cache-Control: must-revalidate` en HTML/JS para que el iPhone no quede con un
`logic.js` viejo) y `.vercelignore` (no publica `tools/`, `docs/`, `package.json`).
`main` = producción, cada rama = vista previa. Dominio usado en las etiquetas OG:
`https://flick-gp.vercel.app`.

## Verificación visual

Chromium + Playwright están disponibles en las sesiones en la nube. Para revisar la UI:
servir la carpeta (`python3 -m http.server`) y abrir `index.html` a 390×844 con
`isMobile: true`, chequear consola sin errores, qualy → grilla → carrera → overlay final.
Capturas de referencia en `docs/screenshots/`.
