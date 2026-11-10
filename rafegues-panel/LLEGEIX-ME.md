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

## Crear una ràfega

1. Munta-la una vegada a la timeline: el vídeo i el so on toquen, retallats com vols.
2. Selecciona els dos clips (si el vídeo porta àudio de càmera, no passa res).
3. Prem **+ Desa la selecció com a ràfega**, posa-li nom i prem **Enter**.
4. Fes clic al requadre de la tecla (—) i prem la tecla o combinació que vulgues.

Es desa: quin fitxer, quin tram (in/out), la pista i el desfasament entre vídeo i so.

## Usar-la

- Posa el cursor on vols la ràfega i prem la seua tecla (o fes clic al nom).
- El vídeo comença al cursor; el so es col·loca amb el mateix desfasament que tenia.
- **Vídeo / Àudio** (dalt): pistes de destí. "Com al preset" usa les pistes on la vas crear.
  Premiere encara no deixa que un plugin llija les pistes *targeted*, per això es tria ací.
- **Mou el cursor al final**: útil per encadenar-ne diverses.
- Si el fitxer no és al projecte (projecte nou de la setmana), l'importa sol.
- **Exporta / Importa**: per guardar-les o passar-les a un altre ordinador.

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
