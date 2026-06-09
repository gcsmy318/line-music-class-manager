const bcrypt = require('bcryptjs');
async function hashPassword(password){ return bcrypt.hash(password, 12); }
async function comparePassword(password, hash){ return bcrypt.compare(password, hash); }
function generatePassword(prefix='USR'){
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}
module.exports = { hashPassword, comparePassword, generatePassword };
