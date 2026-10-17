# Guide de Packaging Desktop

## Compilation
Pour compiler l'application de bout en bout :
`npx tsx scripts/build-desktop.ts`

## Génération Windows
Pour générer les installeurs NSIS, Portable et ZIP :
`npx tsx scripts/package-desktop.ts`

Les fichiers seront dans le dossier `release/`.
