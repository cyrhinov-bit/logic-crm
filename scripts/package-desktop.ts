import { execSync } from 'child_process';
import fs from 'fs';
console.log('--- PACKAGING ELECTRON BUILDER ---');
// Validation naïve intégrée dans le script (ou via BuildValidator)
if (!fs.existsSync('./dist')) { console.error('Erreur: dist/ introuvable'); process.exit(1); }
execSync('npx electron-builder --win', { stdio: 'inherit' });
console.log('Packaging Windows terminé.');
