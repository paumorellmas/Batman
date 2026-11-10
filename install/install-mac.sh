#!/bin/bash
# Instal·la el panell "Full de música TV3" a Premiere Pro (macOS).
set -e
SRC="$(cd "$(dirname "$0")/../panel" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.batman.musicsheet"

# Permet carregar panells sense signar (cal per a panells propis).
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/" "$DEST/"

echo "Panell instal·lat a $DEST"
echo "Reinicia Premiere Pro i obre'l a Finestra > Extensions > Full de música TV3."
