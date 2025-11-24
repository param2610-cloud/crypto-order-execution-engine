const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'dist', 'websockets', 'websocket.manager.js');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/require\("\.\.\/ws"\)/g, 'require("ws")');
fs.writeFileSync(filePath, content);