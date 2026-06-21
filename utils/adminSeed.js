const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const User = require('../models/User');
const { DEFAULT_ADMINS, DEFAULT_ADMIN_USERNAMES } = require('./adminCredentials');

const LEGACY_ADMIN_TABLE = 'Admins';

const normalizeTableName = (table) => (
  typeof table === 'string'
    ? table
    : table?.tableName || table?.name || ''
);

const findExistingTableName = async (tableName) => {
  const tables = await sequelize.getQueryInterface().showAllTables();
  return tables
    .map(normalizeTableName)
    .find((table) => table.toLowerCase() === tableName.toLowerCase()) || null;
};

const upsertAdminUser = async ({ username, name, email, password, passwordHash, profileImage, forcePassword = false }) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername) return null;

  const fallbackEmail = `${normalizedUsername}@plusreview.local`;
  const resolvedEmail = String(email || fallbackEmail).trim().toLowerCase();
  const resolvedName = String(name || normalizedUsername).trim();
  const resolvedPassword = passwordHash || await bcrypt.hash(password, 12);

  const [admin, created] = await User.findOrCreate({
    where: { username: normalizedUsername },
    defaults: {
      username: normalizedUsername,
      name: resolvedName,
      email: resolvedEmail,
      password: resolvedPassword,
      profileImage: profileImage || null,
      emailVerified: true,
      tokenVersion: 0,
      role: 'admin',
    },
  });

  let changed = false;
  const wasAdmin = admin.role === 'admin';
  if (!wasAdmin) {
    admin.role = 'admin';
    if (password && !passwordHash) {
      admin.password = resolvedPassword;
    }
    changed = true;
  }
  if (!admin.name) {
    admin.name = resolvedName;
    changed = true;
  }
  if (!admin.email) {
    admin.email = resolvedEmail;
    changed = true;
  }
  if (!admin.password && resolvedPassword) {
    admin.password = resolvedPassword;
    changed = true;
  }
  if (admin.emailVerified !== true) {
    admin.emailVerified = true;
    changed = true;
  }
  if (forcePassword && password && admin.password) {
    const isPasswordSynced = await bcrypt.compare(password, admin.password);
    if (!isPasswordSynced) {
      admin.password = resolvedPassword;
      changed = true;
    }
  }
  if (!admin.profileImage && profileImage) {
    admin.profileImage = profileImage;
    changed = true;
  }

  if (!created && changed) {
    await admin.save();
  }

  return admin;
};

const migrateLegacyAdmins = async () => {
  const legacyTableName = await findExistingTableName(LEGACY_ADMIN_TABLE);
  if (!legacyTableName) return;

  const [legacyAdmins] = await sequelize.query(
    `SELECT username, name, password, profileImage, isActive FROM \`${legacyTableName}\``
  );

  for (const legacyAdmin of legacyAdmins) {
    if (legacyAdmin.isActive === false || legacyAdmin.isActive === 0) continue;

    await upsertAdminUser({
      username: legacyAdmin.username,
      name: legacyAdmin.name,
      passwordHash: legacyAdmin.password,
      profileImage: legacyAdmin.profileImage,
    });
  }
};

const dropLegacyAdminTable = async () => {
  const legacyTableName = await findExistingTableName(LEGACY_ADMIN_TABLE);
  if (legacyTableName) {
    await sequelize.getQueryInterface().dropTable(legacyTableName);
  }
};

const restrictAdminRoles = async () => {
  await User.update(
    { role: 'user' },
    {
      where: {
        role: 'admin',
        username: { [Op.notIn]: DEFAULT_ADMIN_USERNAMES },
      },
    }
  );
};

const ensureDefaultAdmins = async () => {
  await migrateLegacyAdmins();

  for (const seed of DEFAULT_ADMINS) {
    await upsertAdminUser({ ...seed, forcePassword: true });
  }

  await restrictAdminRoles();
  await dropLegacyAdminTable();
};

module.exports = {
  DEFAULT_ADMINS,
  ensureDefaultAdmins,
};
