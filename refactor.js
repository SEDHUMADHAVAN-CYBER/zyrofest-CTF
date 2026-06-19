const fs = require('fs');
const path = require('path');
const viewsDir = path.join(__dirname, 'views');

fs.readdirSync(viewsDir).forEach(file => {
  if (file.endsWith('.ejs')) {
    const p = path.join(viewsDir, file);
    let content = fs.readFileSync(p, 'utf8');
    if (!content.includes('ajax.js')) {
      content = content.replace('</body>', '<script src="/static/ajax.js"></script>\n</body>');
      fs.writeFileSync(p, content);
      console.log('Updated', file);
    }
  }
});
