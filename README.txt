FLICK GP 0.7.5 — BASE TÉCNICA
JUEGO INDEPENDIENTE PARA VERCEL DROP

PARA PUBLICAR
1. Abrí https://vercel.com/drop
2. Subí el ZIP, con index.html en la raíz.
3. Publicá y abrí la dirección desde Safari en iPhone.
4. En index.html reemplazá DOMINIO por tu dominio de Vercel
   (og:url, og:image y twitter:image) para que la vista previa
   al compartir muestre la imagen.

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
