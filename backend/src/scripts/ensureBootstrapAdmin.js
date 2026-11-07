const crypto = require('crypto');
const User = require('../models/User');

function createTemporaryPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function printCredentials(email, password, action) {
  console.log('\n======================================================');
  console.log(` ${action} — SAVE THESE CREDENTIALS`);
  console.log('======================================================');
  console.log(`Username / Email : ${email}`);
  console.log(`Temporary password: ${password}`);
  console.log('Sign in and change this password immediately.');
  console.log('This password will not be displayed again.');
  console.log('======================================================\n');
}

/**
 * Provision one administrator on first startup. If a legacy seeded Admin
 * exists without a bootstrap marker, rotate its potentially-known demo
 * password once instead of leaving public demo credentials active.
 */
async function ensureBootstrapAdmin() {
  const existingAdmin = await User.findOne({ role: 'Admin' }).sort({ createdAt: 1 });

  if (existingAdmin) {
    if (existingAdmin.bootstrapAdminInitializedAt) {
      console.log(`Bootstrap admin already configured: ${existingAdmin.email}`);
      return { created: false, email: existingAdmin.email };
    }

    const password = createTemporaryPassword();
    existingAdmin.password = password;
    existingAdmin.mustChangePassword = true;
    existingAdmin.bootstrapAdminInitializedAt = new Date();
    await existingAdmin.save();
    printCredentials(existingAdmin.email, password, 'EXISTING ADMIN PASSWORD ROTATED');
    return { created: false, rotated: true, email: existingAdmin.email };
  }

  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bji.ac.in')
    .trim()
    .toLowerCase();
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Campus Administrator').trim();
  const password = createTemporaryPassword();

  const account = await User.create({
    name,
    email,
    password,
    role: 'Admin',
    department: 'Administration',
    avatarColor: '#1d4ed8',
    mustChangePassword: true,
    bootstrapAdminInitializedAt: new Date(),
  });

  printCredentials(account.email, password, 'FIRST ADMINISTRATOR CREATED');
  return { created: true, email: account.email };
}

module.exports = ensureBootstrapAdmin;
