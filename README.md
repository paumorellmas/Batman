# Full de música TV3 — panell per a Premiere Pro

Panell que llegeix la seqüència activa i en treu el full de música: quina música sona, a quin TC entra i surt, i quant dura.

## Instal·lació

1. Descarrega aquest repositori (Code > Download ZIP) i descomprimeix-lo.
2. Tanca Premiere Pro.
3. Windows: doble clic a `install\install-windows.bat`. Mac: executa `install/install-mac.sh` des del Terminal.
4. Obre Premiere i ves a **Finestra > Extensions > Full de música TV3**.

L'instal·lador copia la carpeta `panel` a la carpeta d'extensions d'Adobe i activa la càrrega de panells sense signar (`PlayerDebugMode`), que és necessària per a panells propis.

## Ús

1. Amb la seqüència oberta a la línia de temps, prem **Llegir seqüència activa**.
2. Marca les pistes d'àudio que contenen la música.
3. **Copiar taula** per enganxar-la a un full de càlcul, o **Exportar CSV**.

Si canvies el muntatge, torna a prémer **Llegir seqüència activa**.

## Com compta la música

- "La mateixa música" és el mateix arxiu al disc.
- Trossos del mateix arxiu enganxats l'un rere l'altre (un tall, o la música escurçada) compten com un sol ús.
- El mateix arxiu amb un forat pel mig compta com dos usos, cadascun amb el seu TC i la seva durada.
- El mateix arxiu duplicat en dues pistes alhora no compta doble.
- Els clips desactivats no compten. Les pistes silenciades es marquen com a tals i les tries tu.
- El camp "Separació màxima" decideix quants frames de forat s'accepten encara com a música seguida (1 per defecte).
- La durada surt en mm:ss arrodonida al segon; els TC en hh:mm:ss, amb el TC d'inici de la seqüència.

## D'on surten les dades

Títol, autors, intèrpret, disc, editorial i ISRC es llegeixen de les metadades de l'arxiu (ID3 en MP3, i WAV/AIFF amb bloc ID3 o INFO). El codi de disc i la pista surten del nom de l'arxiu (`HPE458_01_1_TITOL.mp3` → `HPE458`, pista `01`). Si l'arxiu no porta metadades, el títol també surt del nom.

## Desenvolupament

- `panel/jsx/host.jsx`: lectura de la seqüència (ExtendScript).
- `panel/js/core.js`: agrupació, formats de temps i exportació.
- `panel/js/tags.js`: lectura de metadades.
- `panel/js/main.js`: interfície.

`npm test` passa les proves. Obrint `panel/index.html` en un navegador es veu el panell amb una seqüència d'exemple.
