import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('src/pages');
let updated = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;

  let regex = /<table[\s\S]*?<\/table>/g;
  content = content.replace(regex, (match, offset, str) => {
    let before = str.substring(Math.max(0, offset - 100), offset);
    if (before.includes('table-responsive')) {
      return match;
    }
    return `<div className="table-responsive">\n${match}\n</div>`;
  });

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    console.log('Updated ' + f);
    updated++;
  }
});

console.log('Finished, updated ' + updated + ' files');
