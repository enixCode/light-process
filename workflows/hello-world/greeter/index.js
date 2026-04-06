const { input, send } = require('./lp.js');

const name = input.name || 'World';
send({ greeting: `Hello, ${name}!` });
