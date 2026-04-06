const { input, send } = require('./lp.js');

const greeting = input.greeting || '';
send({ result: greeting.toUpperCase() });
