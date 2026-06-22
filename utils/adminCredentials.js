const DEFAULT_ADMINS = Object.freeze([
  { username: 'fikrank', name: 'Fikrank', email: 'fikrank@plusreview.local', password: 'fikrank123' },
  { username: 'dum', name: 'Dum', email: 'dum@plusreview.local', password: 'dum123' },
  { username: 'gean', name: 'Gean', email: 'gean@plusreview.local', password: 'gean123' },
]);

const DEFAULT_ADMIN_USERNAMES = Object.freeze(DEFAULT_ADMINS.map((admin) => admin.username));
const DEFAULT_ADMIN_USERNAME_SET = new Set(DEFAULT_ADMIN_USERNAMES);

const normalizeAdminUsername = (username) => String(username || '').trim().toLowerCase();

const isDefaultAdminUsername = (username) => DEFAULT_ADMIN_USERNAME_SET.has(normalizeAdminUsername(username));

module.exports = {
  DEFAULT_ADMINS,
  DEFAULT_ADMIN_USERNAMES,
  isDefaultAdminUsername,
  normalizeAdminUsername,
};
