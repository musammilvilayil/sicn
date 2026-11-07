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
  const now = new Date();
  const password = createTemporaryPassword();
  user.password = password;
  user.mustChangePassword = true;
  user.credentialsRotatedAt = now;
  if (user.role === 'Admin') {
    user.bootstrapAdminInitializedAt = now;
  }
  await user.save();
  printCredentials(user.email, password, label);
}

/**
 * Creates the first Admin if none exists and rotates known legacy demo
 * credentials (Admin, Teacher, Student, Normal_User) once so older default
 * passwords cannot remain active after upgrading. Rotation timestamps ensure
 * valid credentials are never reset on subsequent restarts.
 */
async function ensureBootstrapAdmin() {
  const existingAdmins = await User.find({ role: 'Admin' }).sort({ createdAt: 1 });

  let rotated = 0;
  for (const admin of existingAdmins) {
    if (!admin.bootstrapAdminInitializedAt) {
      await rotateLegacyAccount(admin, 'LEGACY ADMIN PASSWORD ROTATED');
      rotated += 1;
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

  let rotatedLegacyUsers = 0;
  for (const account of legacyAccounts) {
    if (!account.credentialsRotatedAt) {
      await rotateLegacyAccount(account, `LEGACY ${account.role.toUpperCase()} PASSWORD ROTATED`);
      rotatedLegacyUsers += 1;
    }
  }

  if (existingAdmins.length > 0) {
    if (rotated === 0) {
      console.log(
        `Bootstrap administrator(s) already configured: ${existingAdmins.map((admin) => admin.email).join(', ')}`
      );
    } else {
      console.log(
        `Bootstrap administrator(s) configured: ${existingAdmins.map((admin) => admin.email).join(', ')}`
      );
    }
    return {
      created: false,
      rotated,
      rotatedLegacyUsers,
      count: existingAdmins.length,
    };
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
  return {
    created: true,
    rotated: 0,
    rotatedLegacyUsers,
    count: 1,
    email: account.email,
  };
}

module.exports = ensureBootstrapAdmin;
