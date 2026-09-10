const path = require('node:path');
const target = process.env.LEAFWISE_TARGET || 'chrome';
if (!['chrome', 'firefox'].includes(target)) throw new Error('Invalid LEAFWISE_TARGET');
module.exports = path.join(__dirname, '../build', target);
