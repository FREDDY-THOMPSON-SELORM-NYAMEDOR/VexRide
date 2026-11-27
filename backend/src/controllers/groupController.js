const { Group, GroupMember, User } = require('../models');
const { getDbReady, getMemoryStore } = require('../utils/helpers');

let io;

function setIO(socketIO) {
  io = socketIO;
}

function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function parseDeadline(value) {
  if (!value) return null;
  const deadline = new Date(value);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getGroupShareAmount(group) {
  const budget = Number(group?.budget || 0);
  const maxMembers = Number(group?.max_members || 1) || 1;
  return Math.max(1, Math.round(budget / maxMembers));
}

function isJoinClosed(group) {
  if (!group || !group.join_deadline) return false;
  const deadline = new Date(group.join_deadline);
  return Number.isNaN(deadline.getTime()) ? false : deadline.getTime() <= Date.now();
}

async function serializeGroup(group, userId) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  if (!group) return null;

  if (dbReady) {
    const memberships = await GroupMember.findAll({ where: { group_id: group.id } });
    const isMember = userId ? memberships.some((m) => m.user_id === Number(userId)) : false;
    const memberCount = memberships.length;
    let members = [];

    if (isMember && memberCount > 0) {
      const userIds = memberships.map((membership) => membership.user_id);
      const users = await User.findAll({ where: { id: userIds } });
      members = memberships.map((membership) => {
        const user = users.find((entry) => entry.id === membership.user_id) || { id: membership.user_id, name: 'Rider', email: null };
        return {
          id: user.id,
          userId: user.id,
          membershipId: membership.id,
          name: user.name,
          email: user.email,
          status: membership.status,
          payment_status: membership.payment_status
        };
      });
    }

    return {
      ...group.get({ plain: true }),
      memberCount,
      isMember,
      members,
      paymentAmount: getGroupShareAmount(group),
      remainingSlots: group.max_members ? Math.max(Number(group.max_members) - memberCount, 0) : null,
      canJoin: !isJoinClosed(group)
    };
  }

  const memberships = memoryStore.groupMembers.filter((m) => m.group_id === group.id);
  const isMember = userId ? memberships.some((m) => m.user_id === Number(userId)) : false;
  const memberCount = memberships.length;
  const members = isMember
    ? memberships.map((membership) => {
        const user = memoryStore.users.find((u) => u.id === membership.user_id) || { id: membership.user_id, name: 'Rider' };
        return {
          id: user.id,
          userId: user.id,
          membershipId: membership.id,
          name: user.name,
          email: user.email,
          status: membership.status || 'probation',
          payment_status: membership.payment_status || 'pending'
        };
      })
    : [];

  return {
    ...group,
    memberCount,
    isMember,
    members,
    paymentAmount: getGroupShareAmount(group),
    remainingSlots: group.max_members ? Math.max(Number(group.max_members) - memberCount, 0) : null,
    canJoin: !isJoinClosed(group)
  };
}

const groupController = {
  async createGroup(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const userId = req.body.userId || 1;
      const joinDeadline = parseDeadline(req.body.joinDeadline || req.body.join_deadline);
      const scheduleDate = req.body.scheduleDate || req.body.schedule_date;
      const scheduleDateValue = scheduleDate ? String(scheduleDate).trim() : '';

      if (!scheduleDateValue) {
        return res.status(400).json({ success: false, message: 'scheduleDate is required' });
      }

      if (!joinDeadline) {
        return res.status(400).json({ success: false, message: 'joinDeadline is required' });
      }

      const scheduleDateTime = new Date(`${scheduleDateValue}T23:59:59`);
      if (Number.isNaN(scheduleDateTime.getTime())) {
        return res.status(400).json({ success: false, message: 'scheduleDate must be a valid date' });
      }

      if (joinDeadline.getTime() > scheduleDateTime.getTime()) {
        return res.status(400).json({ success: false, message: 'joinDeadline must be on or before the schedule date' });
      }

      const groupPayload = {
        location: req.body.location,
        origin: req.body.origin,
        budget: req.body.budget,
        max_members: Number(req.body.maxMembers ?? req.body.max_members ?? 4),
        schedule_date: scheduleDateValue,
        time: req.body.time,
        join_deadline: joinDeadline,
        split_rules: req.body.split_rules
      };

      if (!Number.isInteger(groupPayload.max_members) || groupPayload.max_members < 1) {
        return res.status(400).json({ success: false, message: 'maxMembers must be a positive integer' });
      }

      const group = dbReady
        ? await Group.create(groupPayload)
        : { id: memoryStore.groups.length + 1, ...groupPayload, createdAt: new Date(), updatedAt: new Date() };

      if (!dbReady) memoryStore.groups.push(group);

      const membership = dbReady
        ? await GroupMember.create({ group_id: group.id, user_id: userId, status: 'verified', payment_status: 'success' })
        : { id: memoryStore.groupMembers.length + 1, group_id: group.id, user_id: userId, status: 'verified', payment_status: 'success', createdAt: new Date(), updatedAt: new Date() };

      if (!dbReady) memoryStore.groupMembers.push(membership);

      const groupForUser = await serializeGroup(group, userId);
      broadcast('groupCreated', { group: await serializeGroup(group) });
      res.json({ success: true, group: groupForUser, membership });
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async browseGroups(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const userId = req.query.userId ? Number(req.query.userId) : null;
      const groupsRaw = dbReady ? await Group.findAll() : memoryStore.groups;
      const groups = await Promise.all(groupsRaw.map((group) => serializeGroup(group, userId)));
      res.json({ success: true, groups });
    } catch (error) {
      console.error('Error joining group:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async joinGroup(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { groupId, userId } = req.body;
      const group = dbReady
        ? await Group.findByPk(groupId)
        : memoryStore.groups.find((entry) => entry.id === Number(groupId));

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }

      if (isJoinClosed(group)) {
        return res.status(403).json({ success: false, message: 'Join deadline has passed' });
      }

      const existingMembership = dbReady
        ? await GroupMember.findOne({ where: { group_id: groupId, user_id: userId } })
        : memoryStore.groupMembers.find((entry) => entry.group_id === Number(groupId) && entry.user_id === Number(userId));

      if (existingMembership) {
        const groupForUser = await serializeGroup(group, userId);
        return res.json({ success: true, membership: existingMembership, group: groupForUser, paymentAmount: getGroupShareAmount(group) });
      }

      const memberCount = dbReady
        ? await GroupMember.count({ where: { group_id: group.id } })
        : memoryStore.groupMembers.filter((entry) => entry.group_id === group.id).length;

      if (group.max_members && memberCount >= Number(group.max_members)) {
        return res.status(403).json({ success: false, message: 'Group is full' });
      }

      const membership = dbReady
        ? await GroupMember.create({ group_id: groupId, user_id: userId, status: 'probation', payment_status: 'pending' })
        : { id: memoryStore.groupMembers.length + 1, group_id: groupId, user_id: userId, status: 'probation', payment_status: 'pending', createdAt: new Date(), updatedAt: new Date() };

      if (!dbReady) memoryStore.groupMembers.push(membership);

      const groupForUser = await serializeGroup(group, userId);
      broadcast('groupJoined', { groupId, group: await serializeGroup(group) });
      res.json({ success: true, membership, group: groupForUser, paymentAmount: getGroupShareAmount(group) });
    } catch (error) {
      console.error('Error browsing groups:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async bookGroupRide(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { groupId } = req.body;
      const group = dbReady
        ? await Group.findByPk(groupId)
        : memoryStore.groups.find((entry) => entry.id === Number(groupId));

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }

      const rideDetails = {
        provider: 'Bolt mock',
        driver: 'Zara',
        car: 'Toyota Camry',
        eta: '6 mins',
        groupId
      };
      broadcast('groupRideBooked', { groupId, ride: rideDetails });
      res.json({ success: true, ride: rideDetails });
    } catch (error) {
      console.error('Error booking group ride:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = { groupController, setIO };
