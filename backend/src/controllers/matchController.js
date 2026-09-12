const { Match, User, RideRequest } = require('../models');
const { getDbReady, getMemoryStore } = require('../utils/helpers');
const { buildLiveMatchState } = require('../utils/liveLocation');

let io;

function setIO(socketIO) {
  io = socketIO;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

async function getLiveMatchState(match) {
  if (!match) return null;

  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  const user1 = dbReady
    ? await User.findByPk(match.user1_id)
    : memoryStore.users.find((entry) => entry.id === match.user1_id);
  const user2 = dbReady
    ? await User.findByPk(match.user2_id)
    : memoryStore.users.find((entry) => entry.id === match.user2_id);

  return buildLiveMatchState({ match, user1, user2 });
}

function markMatchConfirmedIfPaid(match) {
  if (
    match &&
    match.status !== 'confirmed' &&
    match.user1_payment_status === 'success' &&
    match.user2_payment_status === 'success'
  ) {
    match.status = 'confirmed';
    return true;
  }

  return false;
}

function markRideCompletedIfConfirmed(match) {
  if (
    match &&
    match.status !== 'completed' &&
    match.user1_completed_confirmed &&
    match.user2_completed_confirmed
  ) {
    match.status = 'completed';
    return true;
  }

  return false;
}

const matchController = {
  async confirmMatch(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { matchId, userId } = req.body;
      let match;

      if (dbReady) {
        match = await Match.findByPk(matchId);
        if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
      } else {
        match = memoryStore.matches.find((entry) => entry.id === Number(matchId));
        if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
      }

      // Mark user as confirmed
      if (userId === match.user1_id) {
        match.user1_confirmed = true;
      } else if (userId === match.user2_id) {
        match.user2_confirmed = true;
      }

      // If both confirmed, mark match as confirmed
      if (match.user1_confirmed && match.user2_confirmed) {
        match.status = 'confirmed';
        emitToUser(match.user1_id, 'rideConfirmed', { matchId, status: 'confirmed', match });
        emitToUser(match.user2_id, 'rideConfirmed', { matchId, status: 'confirmed', match });
      }

      if (dbReady) {
        await match.save();
      }

      res.json({ success: true, match, message: match.status === 'confirmed' ? 'Ride confirmed!' : 'Confirmation received, waiting for the other rider' });
    } catch (error) {
      console.error('Error confirming match:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getActiveRides(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { userId } = req.params;
      const numUserId = Number(userId);

      let rides;
      if (dbReady) {
        const { Op } = require('sequelize');
        rides = await Match.findAll({
          where: {
            status: 'confirmed', 
            [Op.or]: [
              { user1_id: numUserId },
              { user2_id: numUserId }
            ]
          }
        });
        rides = await Promise.all(rides.map(async (ride) => ({
          ...(ride.get ? ride.get({ plain: true }) : ride),
          liveLocationState: await getLiveMatchState(ride)
        })));
      } else {
        rides = await Promise.all(memoryStore.matches
          .filter((m) => m.status === 'confirmed' && (m.user1_id === numUserId || m.user2_id === numUserId))
          .map(async (ride) => ({
            ...ride,
            liveLocationState: await getLiveMatchState(ride)
          })));
      }

      res.json({ success: true, rides });
    } catch (error) {
      console.error('Error fetching active rides:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async confirmRideCompleted(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { matchId, userId } = req.body;

      let match;
      if (dbReady) {
        match = await Match.findByPk(matchId);
      } else {
        match = memoryStore.matches.find((entry) => entry.id === Number(matchId));
      }

      if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

      if (userId === match.user1_id) {
        match.user1_completed_confirmed = true;
      } else if (userId === match.user2_id) {
        match.user2_completed_confirmed = true;
      } else {
        return res.status(400).json({ success: false, message: 'User is not part of this match' });
      }

      const rideCompleted = markRideCompletedIfConfirmed(match);

      if (dbReady) {
        await match.save();
      }

      emitToUser(match.user1_id, 'rideCompletionUpdate', {
        matchId,
        user1_completed_confirmed: match.user1_completed_confirmed,
        user2_completed_confirmed: match.user2_completed_confirmed,
        status: match.status
      });
      emitToUser(match.user2_id, 'rideCompletionUpdate', {
        matchId,
        user1_completed_confirmed: match.user1_completed_confirmed,
        user2_completed_confirmed: match.user2_completed_confirmed,
        status: match.status
      });

      if (rideCompleted) {
        if (dbReady) {
          await RideRequest.update(
            { status: 'completed' },
            { where: { id: [match.ride1_id, match.ride2_id] } }
          );
          const completedRequests = await RideRequest.findAll({ where: { id: [match.ride1_id, match.ride2_id] } });
          completedRequests.forEach((request) => {
            emitToUser(request.user_id, 'requestUpdated', {
              _id: request.id,
              id: request.id,
              userId: request.user_id,
              origin: request.origin,
              destination: request.destination,
              time: request.time,
              status: request.status,
              matchId: request.match_id || match.id,
              createdAt: request.createdAt,
              updatedAt: request.updatedAt
            });
          });
        } else {
          memoryStore.rideRequests
            .filter((request) => request.id === match.ride1_id || request.id === match.ride2_id)
            .forEach((request) => {
              request.status = 'completed';
              request.updatedAt = new Date();
              emitToUser(request.user_id, 'requestUpdated', {
                _id: request.id,
                id: request.id,
                userId: request.user_id,
                origin: request.origin,
                destination: request.destination,
                time: request.time,
                status: request.status,
                matchId: request.match_id || match.id,
                createdAt: request.createdAt,
                updatedAt: request.updatedAt
              });
            });
        }
        emitToUser(match.user1_id, 'rideCompleted', { matchId, status: 'completed', match });
        emitToUser(match.user2_id, 'rideCompleted', { matchId, status: 'completed', match });
      }

      res.json({
        success: true,
        match,
        message: rideCompleted ? 'Ride marked as completed!' : 'Completion recorded, waiting for the other rider'
      });
    } catch (error) {
      console.error('Error confirming ride completion:', error);
      console.error('Error confirming match:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updatePaymentStatus(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { matchId, userId, status } = req.body;

      let match;
      if (dbReady) {
        match = await Match.findByPk(matchId);
      } else {
        match = memoryStore.matches.find((entry) => entry.id === Number(matchId));
      }

      if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

      if (userId === match.user1_id) {
        match.user1_payment_status = status;
      } else if (userId === match.user2_id) {
        match.user2_payment_status = status;
      }

      const matchConfirmed = markMatchConfirmedIfPaid(match);

      if (dbReady) {
        await match.save();
      }

      emitToUser(match.user1_id, 'paymentStatusUpdate', { matchId, user1_status: match.user1_payment_status, user2_status: match.user2_payment_status });
      emitToUser(match.user2_id, 'paymentStatusUpdate', { matchId, user1_status: match.user1_payment_status, user2_status: match.user2_payment_status });

      if (matchConfirmed) {
        emitToUser(match.user1_id, 'rideConfirmed', { matchId, status: 'confirmed', match });
        emitToUser(match.user2_id, 'rideConfirmed', { matchId, status: 'confirmed', match });
      }

      res.json({ success: true, match });
    } catch (error) {
      console.error('Error confirming match:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = { matchController, setIO };
