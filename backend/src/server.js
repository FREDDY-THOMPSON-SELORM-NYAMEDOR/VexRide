require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const sequelize = require('./config/database');
const { User, RideRequest, Match, ChatMessage, Payment, Group, GroupMember, ConnectionRequest } = require('./models');
const { setDbReady, setMemoryStore, getMemoryStore, getDbReady } = require('./utils/helpers');

// Controllers
const userController = require('./controllers/userController');
const { rideController, setIO: setRideIO } = require('./controllers/rideController');
const { matchController, setIO: setMatchIO } = require('./controllers/matchController');
const { paymentController, setIO: setPaymentIO } = require('./controllers/paymentController');
const { groupController, setIO: setGroupIO } = require('./controllers/groupController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Initialize Socket.io for all controllers
setRideIO(io);
setMatchIO(io);
setPaymentIO(io);
setGroupIO(io);

async function canAccessGroupChat(rideRequestId, userId) {
  const numericRequestId = Number(rideRequestId);
  const numericUserId = Number(userId);
  if (!numericRequestId || !numericUserId) return false;
  if (getDbReady()) {
    const rideRequest = await RideRequest.findByPk(numericRequestId);
    if (!rideRequest) return false;
    if (Number(rideRequest.user_id) === numericUserId) return true;
    return Boolean(await ConnectionRequest.findOne({
      where: { ride_request_id: numericRequestId, requester_id: numericUserId, status: 'accepted' }
    }));
  }
  const store = getMemoryStore();
  const rideRequest = store.rideRequests.find((entry) => Number(entry.id) === numericRequestId);
  return Boolean(rideRequest && (
    Number(rideRequest.user_id) === numericUserId ||
    store.connectionRequests.some((entry) => Number(entry.ride_request_id) === numericRequestId && Number(entry.requester_id) === numericUserId && entry.status === 'accepted')
  ));
}

async function getGroupChatParticipants(rideRequestId) {
  const numericRequestId = Number(rideRequestId);
  if (getDbReady()) {
    const rideRequest = await RideRequest.findByPk(numericRequestId);
    const connections = await ConnectionRequest.findAll({ where: { ride_request_id: numericRequestId, status: 'accepted' } });
    const participants = [{ id: rideRequest?.user_id, confirmed: Boolean(rideRequest?.group_owner_confirmed) }, ...connections.map((entry) => ({ id: entry.requester_id, confirmed: Boolean(entry.requester_confirmed) }))].filter((entry) => entry.id);
    const users = await User.findAll({ where: { id: participants.map((entry) => entry.id) } });
    return participants.map((participant) => ({
      ...participant,
      name: users.find((user) => Number(user.id) === Number(participant.id))?.name || 'Rider'
    }));
  }
  const store = getMemoryStore();
  const rideRequest = store.rideRequests.find((entry) => Number(entry.id) === numericRequestId);
  const participants = [{ id: rideRequest?.user_id, confirmed: Boolean(rideRequest?.group_owner_confirmed) }, ...store.connectionRequests
    .filter((entry) => Number(entry.ride_request_id) === numericRequestId && entry.status === 'accepted')
    .map((entry) => ({ id: entry.requester_id, confirmed: Boolean(entry.requester_confirmed) }))].filter((entry) => entry.id);
  return participants.map((participant) => ({
    ...participant,
    name: store.users.find((user) => Number(user.id) === Number(participant.id))?.name || 'Rider'
  }));
}

// Socket.io connection handler
io.on('connection', (socket) => {
  socket.on('joinUser', (userId, acknowledge) => {
    const numericUserId = Number(userId);
    if (!numericUserId) {
      acknowledge?.({ success: false });
      return;
    }
    if (socket.data.userId && socket.data.userId !== numericUserId) socket.leave(`user:${socket.data.userId}`);
    socket.data.userId = numericUserId;
    socket.join(`user:${numericUserId}`);
    acknowledge?.({ success: true, userId: numericUserId });
  });

  socket.on('leaveUser', (userId) => {
    const numericUserId = Number(userId);
    if (!numericUserId || socket.data.userId !== numericUserId) return;
    socket.leave(`user:${numericUserId}`);
    socket.data.userId = null;
  });

  socket.on('joinChat', async ({ matchId, rideRequestId }, acknowledge) => {
    const userId = Number(socket.data.userId);
    if (rideRequestId) {
      const canJoin = await canAccessGroupChat(rideRequestId, userId);
      if (canJoin) socket.join(`chat:request:${Number(rideRequestId)}`);
      acknowledge?.({ success: canJoin });
      return;
    }
    if (!matchId || !userId) {
      acknowledge?.({ success: false });
      return;
    }
    const match = getDbReady()
      ? await Match.findByPk(Number(matchId))
      : getMemoryStore().matches.find((entry) => Number(entry.id) === Number(matchId));
    const canJoin = Boolean(match && [match.user1_id, match.user2_id].some((participantId) => Number(participantId) === userId));
    if (canJoin) {
      socket.join(`chat:${Number(matchId)}`);
    }
    acknowledge?.({ success: canJoin });
  });

  socket.on('sendChatMessage', async ({ matchId, rideRequestId, message, userId }) => {
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if ((!matchId && !rideRequestId) || !trimmedMessage) return;
    const senderId = Number(socket.data.userId || userId);
    if (!senderId) return;
    if (socket.data.userId && userId && Number(socket.data.userId) !== Number(userId)) return;
    const timestamp = new Date().toISOString();
    const dbReady = getDbReady();
    let numericMatchId = null;
    let numericRequestId = null;
    let receiverId = null;
    let roomName;
    let chatParticipantIds = [];
    if (rideRequestId) {
      numericRequestId = Number(rideRequestId);
      if (!await canAccessGroupChat(numericRequestId, senderId)) return;
      roomName = `chat:request:${numericRequestId}`;
      chatParticipantIds = (await getGroupChatParticipants(numericRequestId)).map((participant) => Number(participant.id)).filter(Boolean);
    } else {
      numericMatchId = Number(matchId);
      const match = dbReady
        ? await Match.findByPk(numericMatchId)
        : getMemoryStore().matches.find((entry) => Number(entry.id) === numericMatchId);
      if (!match) return;
      const senderIsUser1 = Number(match.user1_id) === senderId;
      const senderIsUser2 = Number(match.user2_id) === senderId;
      if (!senderIsUser1 && !senderIsUser2) return;
      receiverId = senderIsUser1 ? Number(match.user2_id) : Number(match.user1_id);
      chatParticipantIds = [Number(match.user1_id), Number(match.user2_id)].filter(Boolean);
      roomName = `chat:${numericMatchId}`;
    }
    const sender = dbReady
      ? await User.findByPk(senderId)
      : getMemoryStore().users.find((entry) => Number(entry.id) === senderId);
    const payload = {
      matchId: numericMatchId,
      rideRequestId: numericRequestId,
      roomId: numericRequestId ? `request:${numericRequestId}` : `match:${numericMatchId}`,
      userId: senderId,
      senderName: sender?.name || 'Rider',
      receiverId,
      message: trimmedMessage,
      seen: false,
      timestamp
    };

    if (dbReady) {
      try {
        const savedMessage = await ChatMessage.create({
          match_id: numericMatchId,
          ride_request_id: numericRequestId,
          user_id: payload.userId,
          sender_name: payload.senderName,
          receiver_id: payload.receiverId,
          message: trimmedMessage,
          seen: false
        });
        payload.id = savedMessage.id;
      } catch (error) {
        console.warn('Failed to persist chat message:', error.message);
      }
    } else {
      const memoryStore = getMemoryStore();
      payload.id = memoryStore.chatMessages.length + 1;
      memoryStore.chatMessages.push({
        id: payload.id,
        match_id: numericMatchId,
        ride_request_id: numericRequestId,
        user_id: payload.userId,
        sender_name: payload.senderName,
        receiver_id: payload.receiverId,
        message: trimmedMessage,
        seen: false,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    chatParticipantIds.forEach((participantId) => io.to(`user:${participantId}`).emit('chatMessage', payload));
  });

  socket.on('messageSeen', async ({ matchId, messageId, userId }) => {
    if (!matchId || !messageId) return;

    const numericMatchId = Number(matchId);
    const numericMessageId = Number(messageId);
    const dbReady = getDbReady();
    const memoryStore = getMemoryStore();

    if (dbReady) {
      await ChatMessage.update(
        { seen: true },
        { where: { id: numericMessageId, match_id: numericMatchId, receiver_id: Number(userId) } }
      );
    } else {
      const message = memoryStore.chatMessages.find(
        (entry) => Number(entry.id) === numericMessageId && Number(entry.match_id) === numericMatchId
      );
      if (message && Number(message.receiver_id) === Number(userId)) message.seen = true;
    }

    io.to(`chat:${matchId}`).emit('onMessageSeen', { matchId: numericMatchId, messageId: numericMessageId, userId: Number(userId) });
  });

  socket.on('typing:start', ({ matchId, rideRequestId }) => {
    const roomName = rideRequestId ? `chat:request:${Number(rideRequestId)}` : `chat:${Number(matchId)}`;
    if (!matchId && !rideRequestId) return;
    socket.to(roomName).emit('onTypingStart', { matchId: matchId ? Number(matchId) : null, rideRequestId: rideRequestId ? Number(rideRequestId) : null, userId: socket.data.userId || null });
  });

  socket.on('typing:stop', ({ matchId, rideRequestId }) => {
    const roomName = rideRequestId ? `chat:request:${Number(rideRequestId)}` : `chat:${Number(matchId)}`;
    if (!matchId && !rideRequestId) return;
    socket.to(roomName).emit('onTypingStop', { matchId: matchId ? Number(matchId) : null, rideRequestId: rideRequestId ? Number(rideRequestId) : null, userId: socket.data.userId || null });
  });
});

app.get('/match/:matchId/chat', async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!matchId) {
      return res.status(400).json({ success: false, message: 'matchId is required' });
    }

    const dbReady = getDbReady();
    const memoryStore = getMemoryStore();

    const messages = dbReady
      ? await ChatMessage.findAll({ where: { match_id: matchId }, order: [['createdAt', 'ASC']] })
      : memoryStore.chatMessages.filter((message) => Number(message.match_id) === matchId).sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));

    res.json({
      success: true,
      messages: messages.map((message) => ({
        id: message.id,
        matchId: message.match_id,
        userId: message.user_id,
        receiverId: message.receiver_id,
        message: message.message,
        seen: Boolean(message.seen),
        timestamp: message.createdAt
      }))
    });
  } catch (error) {
    console.error('Error loading chat messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/requests/:id/chat', async (req, res) => {
  try {
    const rideRequestId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!rideRequestId || !userId) return res.status(400).json({ success: false, message: 'rideRequestId and userId are required' });
    if (!await canAccessGroupChat(rideRequestId, userId)) return res.status(403).json({ success: false, message: 'You are not an active rider in this group' });

    const relatedMatchIds = getDbReady()
      ? (await Match.findAll({ where: { [require('sequelize').Op.or]: [{ ride1_id: rideRequestId }, { ride2_id: rideRequestId }] }, attributes: ['id'] })).map((match) => match.id)
      : getMemoryStore().matches.filter((match) => Number(match.ride1_id) === rideRequestId || Number(match.ride2_id) === rideRequestId).map((match) => match.id);
    const messages = getDbReady()
      ? await ChatMessage.findAll({
          where: {
            [require('sequelize').Op.or]: [
              { ride_request_id: rideRequestId },
              ...(relatedMatchIds.length ? [{ match_id: { [require('sequelize').Op.in]: relatedMatchIds } }] : [])
            ]
          },
          order: [['createdAt', 'ASC']]
        })
      : getMemoryStore().chatMessages.filter((entry) => Number(entry.ride_request_id) === rideRequestId || relatedMatchIds.includes(Number(entry.match_id))).sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));
    const groupParticipants = await getGroupChatParticipants(rideRequestId);
    const messagePayloads = await Promise.all(messages.map(async (entry) => {
      const sender = getDbReady()
        ? await User.findByPk(entry.user_id)
        : getMemoryStore().users.find((user) => Number(user.id) === Number(entry.user_id));
      return {
        id: entry.id,
        matchId: entry.match_id || null,
        rideRequestId,
        roomId: `request:${rideRequestId}`,
        userId: entry.user_id,
        senderName: entry.sender_name || sender?.name || 'Rider',
        receiverId: null,
        message: entry.message,
        seen: Boolean(entry.seen),
        timestamp: entry.createdAt
      };
    }));
    const rideRequest = getDbReady()
      ? await RideRequest.findByPk(rideRequestId)
      : getMemoryStore().rideRequests.find((entry) => Number(entry.id) === rideRequestId);
    res.json({
      success: true,
      messages: messagePayloads,
      participants: groupParticipants,
      status: rideRequest?.status,
      groupOwnerConfirmed: Boolean(rideRequest?.group_owner_confirmed)
    });
  } catch (error) {
    console.error('Error loading group chat messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/messages/:messageId/seen', async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const userId = Number(req.body.userId);
    if (!messageId || !userId) return res.status(400).json({ success: false, message: 'messageId and userId are required' });

    if (getDbReady()) {
      const [updatedCount] = await ChatMessage.update(
        { seen: true },
        { where: { id: messageId, receiver_id: userId } }
      );
      if (!updatedCount) {
        const groupMessage = await ChatMessage.findOne({ where: { id: messageId } });
        if (!groupMessage?.ride_request_id || !await canAccessGroupChat(groupMessage.ride_request_id, userId)) {
          return res.status(404).json({ success: false, message: 'Message not found' });
        }
        await groupMessage.update({ seen: true });
      }
    } else {
      const message = getMemoryStore().chatMessages.find((entry) => Number(entry.id) === messageId && Number(entry.receiver_id) === userId);
      if (message) {
        message.seen = true;
      } else {
        const groupMessage = getMemoryStore().chatMessages.find((entry) => Number(entry.id) === messageId);
        if (!groupMessage?.ride_request_id || !await canAccessGroupChat(groupMessage.ride_request_id, userId)) {
          return res.status(404).json({ success: false, message: 'Message not found' });
        }
        groupMessage.seen = true;
      }
    }

    res.json({ success: true, messageId, seen: true });
  } catch (error) {
    console.error('Error marking message seen:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/messages/unread/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const unreadByRoom = {};
    const unreadMessages = getDbReady()
      ? await ChatMessage.findAll({ where: { seen: false } })
      : getMemoryStore().chatMessages.filter((message) => !message.seen);
    for (const message of unreadMessages) {
      const isDirectMessage = Number(message.receiver_id) === userId;
      const isGroupMessage = message.ride_request_id
        && Number(message.user_id) !== userId
        && await canAccessGroupChat(message.ride_request_id, userId);
      if (!isDirectMessage && !isGroupMessage) continue;
      const roomId = message.ride_request_id
        ? `request:${message.ride_request_id}`
        : `match:${message.match_id}`;
      unreadByRoom[roomId] = (unreadByRoom[roomId] || 0) + 1;
    }
    const unreadCount = Object.values(unreadByRoom).reduce((total, count) => total + count, 0);

    res.json({ success: true, unreadCount, unreadByRoom });
  } catch (error) {
    console.error('Error loading unread messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/places/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) return res.json({ success: true, locations: [] });

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: `${query}, Ghana`, format: 'jsonv2', addressdetails: 1, countrycodes: 'gh', limit: 6
      },
      headers: { 'User-Agent': 'VexRide/1.0 location search' },
      timeout: 5000
    });
    const locations = response.data.map((place) => ({
      id: place.place_id,
      label: place.display_name,
      subtitle: [place.address?.city, place.address?.town, place.address?.state]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', '),
      latitude: Number(place.lat),
      longitude: Number(place.lon)
    }));
    res.json({ success: true, locations });
  } catch (error) {
    console.error('Location search failed:', error.message);
    res.status(502).json({ success: false, message: 'Location search is temporarily unavailable.' });
  }
});

app.get('/places/reverse', async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required.' });
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat: latitude, lon: longitude, format: 'jsonv2', addressdetails: 1 },
      headers: { 'User-Agent': 'VexRide/1.0 location search' },
      timeout: 5000
    });
    const address = response.data.address || {};
    const area = address.neighbourhood || address.suburb || address.quarter || address.village;
    const city = address.city || address.town || address.municipality || address.county;
    const label = [area, city, address.state].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(', ') || response.data.display_name;
    res.json({ success: true, location: {
      label,
      subtitle: response.data.display_name,
      latitude,
      longitude,
      lat: latitude,
      lon: longitude,
      city: city || null,
      region: address.state || address.region || null,
      country: address.country || null
    } });
  } catch (error) {
    console.error('Reverse location search failed:', error.message);
    res.status(502).json({ success: false, message: 'Could not identify the selected location.' });
  }
});

app.get('/places/ip', async (req, res) => {
  try {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = forwardedFor || req.socket.remoteAddress;
    const isLocalIp = !clientIp || clientIp.includes('127.0.0.1') || clientIp.includes('::1');
    const lookupUrl = !isLocalIp
      ? `https://ipapi.co/${clientIp}/json/`
      : 'https://ipapi.co/json/';
    const response = await axios.get(lookupUrl, { timeout: 5000 });
    const location = response.data || {};
    if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
      return res.status(404).json({ success: false, message: 'Could not determine approximate location.' });
    }
    res.json({ success: true, location: {
      lat: Number(location.latitude),
      lon: Number(location.longitude),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      city: location.city || null,
      region: location.region || null,
      country: location.country_name || null,
      label: [location.city, location.region, location.country_name].filter(Boolean).join(', ')
    } });
  } catch (error) {
    console.error('GeoIP lookup failed:', error.message);
    res.status(502).json({ success: false, message: 'Approximate location is unavailable.' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'VEX backend is running' });
});

// User routes 
app.post('/auth/signup', userController.signup);
app.post('/auth/login', userController.login);
app.post('/auth/logout', userController.logout);
app.post('/user/getOrCreate', userController.getOrCreateUser);
app.get('/user/:userId', userController.getUserById);

// Ride routes
app.post('/findRide', rideController.findRide);
app.get('/api/marketplace', rideController.marketplace);
app.post('/api/connections', rideController.sendConnectionRequest);
app.get('/api/connections', rideController.listConnectionRequests);
app.patch('/api/connections/:id', rideController.updateConnectionRequest);
app.post('/cancelRide', rideController.cancelRide);
app.get('/api/requests', rideController.listRequests);
app.get('/api/requests/:id', rideController.getRequest);
app.get('/api/requests/:id/live', rideController.getGroupLiveLocation);
app.patch('/api/requests/:id', rideController.updateRequestStatus);
app.post('/api/requests/:id/confirm', rideController.confirmGroupMatch);
app.post('/location/update', rideController.updateLocation);
app.get('/match/:matchId/live', rideController.getMatchLiveState);

// Match routes
app.post('/confirmMatch', matchController.confirmMatch);
app.post('/confirmRideCompleted', matchController.confirmRideCompleted);
app.post('/updatePaymentStatus', matchController.updatePaymentStatus);
app.get('/activeRides/:userId', matchController.getActiveRides);

// Payment routes
app.post('/processPayment', paymentController.processPayment);
app.post('/transaction/initialize', paymentController.processPayment);
app.get('/verifyPayment/:reference', paymentController.verifyPayment);
app.get('/transaction/verify/:reference', paymentController.verifyPayment);
app.get('/paystack/callback', paymentController.paystackCallback);

// Group routes
app.post('/createGroup', groupController.createGroup);
app.get('/browseGroups', groupController.browseGroups);
app.post('/joinGroup', groupController.joinGroup);
app.post('/bookGroupRide', groupController.bookGroupRide);

app.post('/reset-app-data', async (_req, res) => {
  try {
    const dbReady = getDbReady();
    const memoryStore = getMemoryStore();

    if (dbReady) {
      await sequelize.query('TRUNCATE TABLE chat_messages, payments, connection_requests, matches, ride_requests, group_members, groups RESTART IDENTITY CASCADE;');
    } else {
      memoryStore.rideRequests = [];
      memoryStore.matches = [];
      memoryStore.chatMessages = [];
      memoryStore.payments = [];
      memoryStore.groups = [];
      memoryStore.groupMembers = [];
      memoryStore.connectionRequests = [];
    }

    res.json({ success: true, message: 'App data cleared' });
  } catch (error) {
    console.error('Error resetting app data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Database initialization and seeding
async function seedData() {
  const userCount = await User.count();
  if (userCount === 0) {
    await User.bulkCreate([
      { name: 'Mia', email: 'mia@vex.app', rating: 4.9 },
      { name: 'Tunde', email: 'tunde@vex.app', rating: 4.7 },
      { name: 'Demo Rider', email: 'demo@vex.app', rating: 5.0 }
    ]);
  }
}

async function init() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await sequelize.query('ALTER TABLE "chat_messages" ALTER COLUMN "match_id" DROP NOT NULL');
    setDbReady(true);
    console.log('Database connected');
    await seedData();
  } catch (error) {
    console.log('Database unavailable, using in-memory fallback:', error.message);
    // Initialize memory store for fallback
    setMemoryStore({
      users: [],
      rideRequests: [],
      matches: [],
      chatMessages: [],
      payments: [],
      groups: [],
      groupMembers: [],
      connectionRequests: []
    });
  }

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`VEX backend listening on ${port}`));
}

init();
module.exports = { app, server, io };


