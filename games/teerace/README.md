# Tee Race

Carreras cooperativas al estilo **DDraceNetwork**: física portada del código de DDNet (salto, doble salto, hook, freeze, teles, speedups, stoppers), mapas oficiales que vienen con DDNet, sus 101 skins y los sonidos de Teeworlds. Online en las salas de Claude Arcade.

## Créditos y licencias
- Código de física portado de [DDNet](https://github.com/ddnet/ddnet) — licencia zlib (`LICENSE-DDNET.txt`).
- Mapas (Tutorial, LearnToPlay, Sunny Side Up, Gold Mine, Tsunami), tilesets, skins, sprites y sonidos — CC-BY-SA 3.0 (`LICENSE-MAPS.txt`, `LICENSE-SKINS.txt`). Los derivados (las imágenes convertidas a webp, los mapas convertidos) quedan bajo la misma licencia.

## Archivos
- `src/physics.js` física (port de gamecore/collision/character de DDNet), `src/render.js` mapa y tees en Canvas 2D, `src/main.js` juego, red y HUD.
- `tools/convert_map.py` convierte un `.map` de DDNet a `maps/<id>.json` + `maps/<id>.dat` (tiles comprimidos con gzip).
- `game.js` compilado: `npx esbuild src/main.js --bundle --minify --format=esm --outfile=game.js`.

Mapas extra (ddnet-maps): Axison, BackToBasics, Bouncy Kingdom, Aardvark, Aimbot, Catharsis — ver LICENSE-MAPS.txt.
