const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Electron Builder Config
write('electron-builder.json',
  "{\n" +
  "  \"appId\": \"com.erp.pos\",\n" +
  "  \"productName\": \"ERP POS Desktop\",\n" +
  "  \"copyright\": \"Copyright © 2026 ERP POS\",\n" +
  "  \"directories\": {\n" +
  "    \"output\": \"release/\",\n" +
  "    \"buildResources\": \"build\"\n" +
  "  },\n" +
  "  \"files\": [\n" +
  "    \"dist/**/*\",\n" +
  "    \"dist-electron/**/*\"\n" +
  "  ],\n" +
  "  \"win\": {\n" +
  "    \"target\": [\"nsis\", \"portable\", \"zip\"],\n" +
  "    \"icon\": \"build/icons/icon.ico\"\n" +
  "  },\n" +
  "  \"nsis\": {\n" +
  "    \"oneClick\": false,\n" +
  "    \"allowToChangeInstallationDirectory\": true,\n" +
  "    \"createDesktopShortcut\": true,\n" +
  "    \"createStartMenuShortcut\": true,\n" +
  "    \"shortcutName\": \"ERP POS\",\n" +
  "    \"uninstallDisplayName\": \"ERP POS\",\n" +
  "    \"deleteAppDataOnUninstall\": false\n" +
  "  },\n" +
  "  \"mac\": {\n" +
  "    \"target\": [\"dmg\", \"pkg\"],\n" +
  "    \"icon\": \"build/icons/icon.icns\"\n" +
  "  },\n" +
  "  \"linux\": {\n" +
  "    \"target\": [\"AppImage\", \"deb\"],\n" +
  "    \"icon\": \"build/icons\"\n" +
  "  }\n" +
  "}\n"
);

// 2. Electron Build Modules
write('electron/build/BuilderManager.ts', "export class BuilderManager {}");
write('electron/build/BuildConfiguration.ts', "export class BuildConfiguration {}");
write('electron/build/InstallerManager.ts', "export class InstallerManager {}");
write('electron/build/ArtifactManager.ts', "export class ArtifactManager {}");
write('electron/build/SigningManager.ts', "export class SigningManager {}");
write('electron/build/VersionManager.ts', "export class VersionManager {}");
write('electron/build/DistributionManager.ts', "export class DistributionManager {}");
write('electron/build/ReleaseChannelManager.ts', "export class ReleaseChannelManager {}");
write('electron/build/BuildValidator.ts', 
  "export class BuildValidator {\n" +
  "  static validate() {\n" +
  "    // Vérifie que ./dist et ./dist-electron existent\n" +
  "    const fs = require('fs');\n" +
  "    if (!fs.existsSync('./dist')) throw new Error('Dossier dist/ manquant. React non compilé.');\n" +
  "    if (!fs.existsSync('./dist-electron')) throw new Error('Dossier dist-electron/ manquant. Electron non compilé.');\n" +
  "    return true;\n" +
  "  }\n" +
  "}\n"
);
write('electron/build/index.ts',
  "export * from './BuilderManager.js';\n" +
  "export * from './BuildValidator.js';\n"
);

// 3. Scripts
write('scripts/build-desktop.ts',
  "import { execSync } from 'child_process';\n" +
  "console.log('--- COMPILATION DU DESKTOP ---');\n" +
  "execSync('npm run build', { stdio: 'inherit' });\n" +
  "execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit' });\n" +
  "console.log('Compilation terminée.');\n"
);
write('scripts/package-desktop.ts',
  "import { execSync } from 'child_process';\n" +
  "import fs from 'fs';\n" +
  "console.log('--- PACKAGING ELECTRON BUILDER ---');\n" +
  "// Validation naïve intégrée dans le script (ou via BuildValidator)\n" +
  "if (!fs.existsSync('./dist')) { console.error('Erreur: dist/ introuvable'); process.exit(1); }\n" +
  "execSync('npx electron-builder --win', { stdio: 'inherit' });\n" +
  "console.log('Packaging Windows terminé.');\n"
);
write('scripts/release.ts',
  "console.log('Préparation de la release...');\n"
);

// 4. Ressources factices pour que electron-builder ne plante pas
write('build/icons/icon.ico', 'dummy_ico_content_for_test');
write('build/icons/icon.icns', 'dummy_icns_content_for_test');
write('build/installer/setup.bmp', 'dummy_bmp');
write('build/licenses/license.txt', 'MIT License...');

// 5. Documentation
write('PACKAGING.md',
  "# Guide de Packaging Desktop\n\n" +
  "## Compilation\n" +
  "Pour compiler l'application de bout en bout :\n" +
  "`npx tsx scripts/build-desktop.ts`\n\n" +
  "## Génération Windows\n" +
  "Pour générer les installeurs NSIS, Portable et ZIP :\n" +
  "`npx tsx scripts/package-desktop.ts`\n\n" +
  "Les fichiers seront dans le dossier `release/`.\n"
);

console.log('Fichiers Phase 16 générés.');
