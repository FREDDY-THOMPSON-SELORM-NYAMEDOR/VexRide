require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const sequelize = require('./config/database');
const { User, RideRequest, Match, ChatMessage, Payment, Group, GroupMember } = require('./models');
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

// Socket.io connection handler
io.on('connection', (socket) => {
  socket.on('joinUser', (userId) => {
    socket.data.userId = Number(userId);
    socket.join(`user:${userId}`);
  });

  socket.on('joinChat', ({ matchId }) => {
    if (!matchId) return;
    socket.join(`chat:${matchId}`);
  });

  socket.on('sendChatMessage', async ({ matchId, message, userId }) => {
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (!matchId || !trimmedMessage) return;

    const numericMatchId = Number(matchId);
    const senderId = Number(userId || socket.data.userId);
    if (!senderId) return;

    // Keep socket identity in sync for this connection after first valid send.
    socket.data.userId = senderId;

    const match = getDbReady()
      ? await Match.findByPk(numericMatchId)
      : getMemoryStore().matches.find((entry) => Number(entry.id) === numericMatchId);
    if (!match) return;

    const senderIsUser1 = Number(match.user1_id) === Number(senderId);
    const senderIsUser2 = Number(match.user2_id) === Number(senderId);
    if (!senderIsUser1 && !senderIsUser2) return;

    const receiverId = senderIsUser1 ? Number(match.user2_id) : Number(match.user1_id);
    const timestamp = new Date().toISOString();
    const payload = {
      matchId: numericMatchId,
      userId: senderId,
      receiverId,
      message: trimmedMessage,
      seen: false,
      timestamp
    };

    const dbReady = getDbReady();
    if (dbReady) {
      try {
        const savedMessage = await ChatMessage.create({
          match_id: numericMatchId,
          user_id: payload.userId,
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
        match_id: Number(matchId),
        user_id: payload.userId,
        receiver_id: payload.receiverId,
        message: trimmedMessage,
        seen: false,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    io.to(`chat:${matchId}`).emit('chatMessage', payload);
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

  socket.on('typing:start', ({ matchId }) => {
    if (!matchId) return;
    socket.to(`chat:${matchId}`).emit('onTypingStart', { matchId: Number(matchId), userId: socket.data.userId || null });
  });

  socket.on('typing:stop', ({ matchId }) => {
    if (!matchId) return;
    socket.to(`chat:${matchId}`).emit('onTypingStop', { matchId: Number(matchId), userId: socket.data.userId || null });
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
      if (!updatedCount) return res.status(404).json({ success: false, message: 'Message not found' });
    } else {
      const message = getMemoryStore().chatMessages.find((entry) => Number(entry.id) === messageId && Number(entry.receiver_id) === userId);
      if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
      message.seen = true;
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

    const unreadCount = getDbReady()
      ? await ChatMessage.count({ where: { receiver_id: userId, seen: false } })
      : getMemoryStore().chatMessages.filter((message) => Number(message.receiver_id) === userId && !message.seen).length;

    res.json({ success: true, unreadCount });
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
    res.json({ success: true, location: { label, subtitle: response.data.display_name, latitude, longitude } });
  } catch (error) {
    console.error('Reverse location search failed:', error.message);
    res.status(502).json({ success: false, message: 'Could not identify the selected location.' });
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
app.post('/cancelRide', rideController.cancelRide);
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
      await sequelize.query('TRUNCATE TABLE chat_messages, payments, matches, ride_requests, group_members, groups, users RESTART IDENTITY CASCADE;');
    } else {
      memoryStore.users = [];
      memoryStore.rideRequests = [];
      memoryStore.matches = [];
      memoryStore.chatMessages = [];
      memoryStore.payments = [];
      memoryStore.groups = [];
      memoryStore.groupMembers = [];
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
      groupMembers: []
    });
  }

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`VEX backend listening on ${port}`));
}

init();
module.exports = { app, server, io };


