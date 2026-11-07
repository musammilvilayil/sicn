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

async function rotateLegacyAccount(user, label) {
  const password = createTemporaryPassword();
  user.password = password;
  user.mustChangePassword = true;
  user.credentialsRotatedAt = new Date();
  if (user.role === 'Admin') user.bootstrapAdminInitializedAt = new Date();
  await user.save();
  printCredentials(user.email, password, label);
}

/**
 * Creates the first Admin and invalidates known demo credentials left by
 * older seed scripts. Rotation markers ensure this happens only once.
 */
async function ensureBootstrapAdmin() {
  const existingAdmins = await User.find({ role: 'Admin' }).sort({ createdAt: 1 });

  for (const admin of existingAdmins) {
    if (!admin.bootstrapAdminInitializedAt) {
      await rotateLegacyAccount(admin, 'LEGACY ADMIN PASSWORD ROTATED');
    }
  }

  const legacyDemoEmails = [
    'priya.nair@bji.ac.in',
    'student@bji.ac.in',
    'visitor@bji.ac.in',
  ];
  const legacyAccounts = await User.find({
    email: { $in: legacyDemoEmails },
    role: { $ne: 'Admin' },
  });

  for (const account of legacyAccounts) {
    if (!account.credentialsRotatedAt) {
      await rotateLegacyAccount(account, `LEGACY ${account.role.toUpperCase()} PASSWORD ROTATED`);
    }
  }

  if (existingAdmins.length > 0) {
    console.log(`Bootstrap administrator(s) configured: ${existingAdmins.map((admin) => admin.email).join(', ')}`);
    return { created: false, count: existingAdmins.length };
  }

  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bji.ac.in')
    .trim()
    .toLowerCase();
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Campus Administrator').trim();
  const password = createTemporaryPassword();
  const now = new Date();

  const account = await User.create({
    name,
    email,
    password,
    role: 'Admin',
    department: 'Administration',
    avatarColor: '#1d4ed8',
    mustChangePassword: true,
    bootstrapAdminInitializedAt: now,
    credentialsRotatedAt: now,
  });

  printCredentials(account.email, password, 'FIRST ADMINISTRATOR CREATED');
  return { created: true, email: account.email };
}

module.exports = ensureBootstrapAdmin;
