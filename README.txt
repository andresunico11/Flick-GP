FLICK GP 0.7.5 — BASE TÉCNICA
JUEGO INDEPENDIENTE, SITIO ESTÁTICO PARA VERCEL

PARA PUBLICAR (VERCEL + GITHUB)
1. Entrá a https://vercel.com/new e importá el repositorio
   andresunico11/Flick-GP. No cambies nada: vercel.json ya indica
   que es un sitio estático sin build.
2. Vercel publica main como producción y cada rama/PR como
   vista previa (por ejemplo, la rama feat/0.7.5-base).
3. Abrí la dirección desde Safari en iPhone.
4. Las URLs de vista previa al compartir apuntan a
   https://flick-gp.vercel.app. Si Vercel te asigna otro dominio,
   cambialo en index.html (og:url, og:image y twitter:image).

Alternativa sin GitHub: https://vercel.com/drop subiendo un ZIP
con index.html en la raíz (sin las carpetas tools/ ni docs/).

NOVEDADES 0.7.5
- Rivales mucho más rápidos: en Experto cada ronda se calcula
  unas 11 veces más rápido. Mismos resultados, mismas carreras.
- Encabezado corregido en iPhone: "FLICK GP" y "CADA IMPULSO
  CUENTA" ya no se recortan, y se respeta la zona segura.
- En el Qualifying, antes del primer impulso, el ranking muestra
  "—" en lugar de posiciones empatadas.
- Las tarjetas de la grilla de largada ya no se desbordan.
- Guardado versionado: las partidas de 0.7.3 y 0.7.4 se conservan
  con créditos, mejoras, historial y campeonato en curso.
- Vista previa al compartir con imagen grande.

SE MANTIENE
- Siete rivales con personalidades distintas y tres niveles.
- Copa Clásica y Copa Extrema de tres Grandes Premios cada una.
- Ocho pilotos, Qualifying de tres impulsos y dos vueltas por carrera.
- Seis circuitos, garaje, créditos, mejoras y clasificación general.
- Zoom, cámara libre y toque/arrastre exclusivamente desde tu auto.
- Curvatura mediante el segundo dedo.
- Reserva de energía recargada al completar cada vuelta.

PARA DESARROLLAR
Ver CLAUDE.md. Con Node instalado: npm run golden, npm run perf,
npm run sim, npm test. No hace falta npm install.

PROGRESO
Los datos se guardan en el navegador del dominio actual. Si
publicás en otro subdominio de Vercel, Safari no comparte
automáticamente el progreso guardado en el subdominio anterior.

FLICK GP 0.7.5
Sin pagos, publicidad ni dependencia de servidor.
