import { execSync } from 'child_process';
console.log('--- COMPILATION DU DESKTOP ---');
execSync('npm run build', { stdio: 'inherit' });
execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit' });
console.log('Compilation terminée.');
