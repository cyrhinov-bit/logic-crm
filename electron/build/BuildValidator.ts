export class BuildValidator {
  static validate() {
    // Vérifie que ./dist et ./dist-electron existent
    const fs = require('fs');
    if (!fs.existsSync('./dist')) throw new Error('Dossier dist/ manquant. React non compilé.');
    if (!fs.existsSync('./dist-electron')) throw new Error('Dossier dist-electron/ manquant. Electron non compilé.');
    return true;
  }
}
