const fs = require('fs');
const file = '.netlify/functions-internal/___netlify-server-handler/___netlify-server-handler.mjs';
if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    console.log('File content length:', content.length);
    console.log('Contains \\var\\task (literal):', content.includes('\\var\\task'));
    console.log('Contains \\v (vertical tab):', content.includes('\v'));
    console.log('First 200 chars:', content.substring(0, 200));
} else {
    console.log('File not found');
}
