const { User, RideRequest, Payment, GroupMember } = require('../models');

let memoryStore = {
  users: [],
  rideRequests: [],
  matches: [],
  chatMessages: [],
  payments: [],
  groups: [],
  groupMembers: [],
  connectionRequests: []
};

let dbReady = false;

function setDbReady(status) {
  dbReady = status;
}

function getDbReady() {
  return dbReady;
}

function getMemoryStore() {
  return memoryStore;
}

function setMemoryStore(store) {
  memoryStore = store;
}

function parseRideTime(value) {
  if (!value) return new Date();
  const text = String(value).trim();
  const today = new Date();
  const timeMatch = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || '0');
    const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
    if (ampm) {
      if (hour === 12) {
        hour = ampm === 'AM' ? 0 : 12;
      } else if (ampm === 'PM') {
        hour += 12;
      }
    }
    const date = new Date(today);
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  const parsed = new Date(text);
  if (!isNaN(parsed)) {
    return parsed;
  }

  throw new Error(`Invalid time format: ${text}`);
}

async function ensureUser(userName, userEmail) {
  if (!dbReady) {
    const store = getMemoryStore();
    let user = store.users.find(u => u.email === userEmail);
    if (!user) {
      user = {
        id: store.users.length + 1,
        name: userName || 'Guest',
        email: userEmail || `user-${Date.now()}@example.com`,
        rating: 5.0
      };
      store.users.push(user);
    }
    return user;
  }

  let user = await User.findOne({ where: { email: userEmail } });
  if (!user) {
    user = await User.create({
      name: userName || 'Guest',
      email: userEmail || `user-${Date.now()}@example.com`,
      rating: 5.0
    });
  }
  return user;
}

async function findUserByEmail(userEmail) {
  if (!dbReady) {
    const store = getMemoryStore();
    return store.users.find(u => String(u.email).toLowerCase() === String(userEmail).toLowerCase()) || null;
  }
  return User.findOne({ where: { email: userEmail } });
}

async function findUserByPhone(phone) {
  if (!phone) return null;
  if (!dbReady) {
    const store = getMemoryStore();
    return store.users.find(u => String(u.phone) === String(phone)) || null;
  }
  return User.findOne({ where: { phone } });
}

async function findUserById(userId) {
  if (!dbReady) {
    const store = getMemoryStore();
    return store.users.find(u => Number(u.id) === Number(userId)) || null;
  }
  return User.findByPk(userId);
}

module.exports = {
  parseRideTime,
  ensureUser,
  findUserByEmail,
  findUserByPhone,
  findUserById,
  setDbReady,
  getDbReady,
  getMemoryStore,
  setMemoryStore
};
