# Ràfegues — panell per a Premiere Pro 26

Desa combinacions de **vídeo de ràfega + so d'un altre clip** i les col·loca
(sobreescrivint) al cursor de reproducció amb un clic o una tecla.

## Instal·lació (una sola vegada)

1. A Premiere: **Preferències > Plugins > Enable developer mode** i reinicia Premiere.
2. Instal·la **UXP Developer Tool** des de l'app de Creative Cloud.
3. A UDT: **Add Plugin** → tria el `manifest.json` d'aquesta carpeta → **Load**.
4. A Premiere: **Finestra > UXP Plugins > Ràfegues** i acobla el panell on vulgues.

Quan funcione bé, a UDT pots fer **Package** per crear un `.ccx` que s'instal·la
amb doble clic i ja no necessita UDT.

## Dues llistes

- **Tots els projectes**: les ràfegues de sempre. Apareixen obris el projecte que obris.
- **Aquest projecte**: només es veuen (i només responen a la tecla) dins del projecte on les has desat.

El projecte es reconeix pel fitxer `.prproj`. Si el canvies de nom o de carpeta, les seues ràfegues
ixen davall de «Mostra les ràfegues d'altres projectes», i des d'allí les pots portar al projecte actual.

## Crear una ràfega

1. Munta-la una vegada a la timeline: el vídeo i el so on toquen, retallats com vols.
2. Selecciona els dos clips (si el vídeo porta àudio de càmera, no passa res).
3. Prem **+ Desa la selecció** a la llista on la vols (tots els projectes o aquest projecte),
   posa-li nom i prem **Enter**.
4. Fes clic al requadre **tecla** i prem la tecla o combinació que vulgues.

Es desa: quin fitxer, quin tram (in/out), la pista i el desfasament entre vídeo i so.

## Usar-la

- Posa el cursor on vols la ràfega i prem la seua tecla (o fes clic al nom).
- El vídeo comença al cursor; el so es col·loca amb el mateix desfasament que tenia.
- **Destí** (dalt): pistes de vídeo i d'àudio. "Com al preset" usa les pistes on la vas crear.
  Premiere encara no deixa que un plugin llija les pistes *targeted*, per això es tria ací.
- **···** obri les opcions de la ràfega: canviar el nom, pujar-la o baixar-la, passar-la
  d'una llista a l'altra i esborrar-la.
- Una mateixa tecla pot servir per a ràfegues de projectes diferents, perquè mai estan actives alhora.
- **Mou el cursor al final**: útil per encadenar-ne diverses.
- Si el fitxer no és al projecte (projecte nou de la setmana), l'importa sol.
- **Exporta / Importa**: per guardar-les o passar-les a un altre ordinador. S'exporten les de tots
  els projectes i les del projecte actual; en importar, les de projecte passen al projecte obert.

## Coses a saber

- **Les tecles només funcionen amb el panell enfocat.** Fes clic al fons del panell
  (no a un camp de text). Les tecles que ja usa Premiere van a Premiere, no al panell:
  tria tecles lliures (p. ex. el teclat numèric o Ctrl+Alt+número).
  Premiere 26 encara no permet dreceres globals per a plugins UXP.
- Desfer una ràfega pot necessitar 3–6 **Ctrl+Z** (Premiere obliga a fer-ho en passos).
- El panell canvia un moment els In/Out del clip original al projecte i després els neteja.
  Si tenies un In/Out marcat al màster de la ràfega, es perdrà.
- Hi ha un error conegut de Premiere 26.3.x que pot fer petar el programa si el clip
  està obert al **Source Monitor** mentre el panell li canvia l'In/Out. Evita tindre
  la ràfega carregada al Source Monitor quan l'apliques.
- La velocitat/efectes dels clips no es copien: només el tram i la posició.
- La primera vegada pot corregir sol una diferència d'un fotograma en la durada.
- Si el fitxer de so té imatge i no hi ha cap pista de vídeo lliure en eixe tram, el panell
  avisa i no col·loca res: afig una pista de vídeo buida i torna-ho a provar.
- Si la pista triada dalt (Vídeo / Àudio) no existeix a la seqüència activa, s'usa la del preset.
