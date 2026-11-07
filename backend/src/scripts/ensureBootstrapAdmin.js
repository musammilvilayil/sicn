const crypto = require('crypto');
const User = require('../models/User');

/**
 * Creates the first administrator exactly once.
 * The password is generated at runtime and printed only when a new account
 * is created. Existing administrator credentials are never displayed.
 */
async function ensureBootstrapAdmin() {
  const existingAdmin = await User.findOne({ role: 'Admin' }).select('_id email').lean();
  if (existingAdmin) {
    console.log(`Bootstrap admin already configured: ${existingAdmin.email}`);
    return { created: false, email: existingAdmin.email };
  }

  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bji.ac.in')
    .trim()
    .toLowerCase();
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Campus Administrator').trim();
  const password = crypto.randomBytes(24).toString('base64url');

  const account = await User.create({
    name,
    email,
    password,
    role: 'Admin',
    department: 'Administration',
    avatarColor: '#1d4ed8',
  });

  console.log('\n======================================================');
  console.log(' FIRST ADMINISTRATOR CREATED — SAVE THESE CREDENTIALS');
  console.log('======================================================');
  console.log(`Username / Email : ${account.email}`);
  console.log(`Temporary password: ${password}`);
  console.log('Sign in and change this password immediately.');
  console.log('This password will not be displayed again.');
  console.log('======================================================\n');

  return { created: true, email: account.email };
}

module.exports = ensureBootstrapAdmin;
