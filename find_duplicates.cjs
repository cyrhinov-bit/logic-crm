const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/features/products/data/products.json', 'utf8'));

function parseCSVLine(line, delimiter = ';') {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

const map = {};
data.forEach(d => {
  const v = Object.values(d)[0];
  if (typeof v === 'string') {
    const parts = parseCSVLine(v);
    const ref = parts[1]?.trim();
    if (ref) {
      if (!map[ref]) map[ref] = [];
      map[ref].push(v);
    }
  }
});

const duplicates = Object.entries(map).filter(([_, arr]) => arr.length > 1);
console.log('Nombre total de doublons de texte :', duplicates.length);
duplicates.slice(0, 3).forEach(([ref, arr]) => {
  console.log('Doublon exact :', ref);
  arr.forEach(val => console.log('  -> Ligne complète :', val));
});
