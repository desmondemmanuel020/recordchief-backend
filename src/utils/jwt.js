const jwt = require('jsonwebtoken');
const sign   = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);
module.exports = { sign, verify };
