const { verify } = require('../utils/jwt');
const User = require('../models/User');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
    const decoded = verify(header.split(' ')[1]);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ error: 'User not found.' });
    next();
  } catch (e) {
    return res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.' });
  }
}
module.exports = { protect };
