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

async function ensureBootstrapAdmin() {
  const existingAdmins = await User.find({ role: 'Admin' }).sort({ createdAt: 1 });

  if (existingAdmins.length > 0) {
    let rotated = 0;
    for (const admin of existingAdmins) {
      if (admin.bootstrapAdminInitializedAt) continue;
      const password = createTemporaryPassword();
      admin.password = password;
      admin.mustChangePassword = true;
      admin.bootstrapAdminInitializedAt = new Date();
      await admin.save();
      printCredentials(admin.email, password, 'ADMIN PASSWORD ROTATED');
      rotated += 1;
    }

    if (rotated === 0) {
      console.log(`Bootstrap administrator(s) already configured: ${existingAdmins.map((admin) => admin.email).join(', ')}`);
    }
    return { created: false, rotated, count: existingAdmins.length };
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
