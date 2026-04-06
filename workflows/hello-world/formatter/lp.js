const input = JSON.parse(require('fs').readFileSync(0, 'utf-8') || '{}');
const send = (output) => { require('fs').writeFileSync('.lp-output.json', JSON.stringify(output)); };
module.exports = { input, send };
