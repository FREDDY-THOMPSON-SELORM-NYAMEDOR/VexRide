const { Match, User, RideRequest, ConnectionRequest } = require('../models');
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

async function getMatchParticipantIds(match) {
  if (!match) return [];
  if (match.match_type !== 'group' || !match.group_request_id) {
    return [Number(match.user1_id), Number(match.user2_id)].filter(Boolean);
  }

  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const connections = dbReady
    ? await ConnectionRequest.findAll({ where: { ride_request_id: match.group_request_id, status: 'accepted' } })
    : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(match.group_request_id) && entry.status === 'accepted');
  const ownerId = dbReady
    ? (await RideRequest.findByPk(match.group_request_id))?.user_id
    : memoryStore.rideRequests.find((entry) => Number(entry.id) === Number(match.group_request_id))?.user_id;
  return [Number(ownerId), ...connections.map((entry) => Number(entry.requester_id))].filter(Boolean);
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
        const confirmedRides = await Match.findAll({ where: { status: ['confirmed', 'completed'] } });
        rides = [];
        for (const ride of confirmedRides) {
          const isPairParticipant = ride.user1_id === numUserId || ride.user2_id === numUserId;
          const isGroupParticipant = ride.match_type === 'group' && ride.group_request_id
            && (await RideRequest.findOne({ where: { id: ride.group_request_id, user_id: numUserId } })
              || await ConnectionRequest.findOne({ where: { ride_request_id: ride.group_request_id, requester_id: numUserId, status: 'accepted' } }));
          if (isPairParticipant || isGroupParticipant) rides.push(ride);
        }
        rides = await Promise.all(rides.map(async (ride) => {
          const groupConnection = ride.match_type === 'group' && ride.group_request_id
            ? await ConnectionRequest.findOne({
                where: { ride_request_id: ride.group_request_id, requester_id: numUserId, status: 'accepted' },
                attributes: ['id']
              })
            : null;
          return {
            ...(ride.get ? ride.get({ plain: true }) : ride),
            groupConnectionId: groupConnection?.id || null,
            liveLocationState: await getLiveMatchState(ride)
          };
        }));
      } else {
        rides = await Promise.all(memoryStore.matches
          .filter((m) => {
            if (!['confirmed', 'completed'].includes(m.status)) return false;
            if (m.user1_id === numUserId || m.user2_id === numUserId) return true;
            if (m.match_type !== 'group' || !m.group_request_id) return false;
            const request = memoryStore.rideRequests.find((entry) => Number(entry.id) === Number(m.group_request_id));
            return Number(request?.user_id) === numUserId || memoryStore.connectionRequests.some((entry) =>
              Number(entry.ride_request_id) === Number(m.group_request_id)
              && Number(entry.requester_id) === numUserId
              && entry.status === 'accepted'
            );
          })
          .map(async (ride) => ({
            ...ride,
            groupConnectionId: ride.match_type === 'group'
              ? memoryStore.connectionRequests.find((entry) =>
                  Number(entry.ride_request_id) === Number(ride.group_request_id)
                  && Number(entry.requester_id) === numUserId
                  && entry.status === 'accepted'
                )?.id || null
              : null,
            liveLocationState: await getLiveMatchState(ride)
          })));
      }

      res.json({
        success: true,
        rides: rides.filter((ride) => ride.status === 'confirmed'),
        completedRides: rides.filter((ride) => ride.status === 'completed')
      });
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

      const participantIds = await getMatchParticipantIds(match);
      if (!participantIds.includes(Number(userId))) {
        return res.status(400).json({ success: false, message: 'User is not part of this match' });
      }

      let rideCompleted = false;
      if (match.match_type === 'group') {
        const confirmations = Array.isArray(match.completion_confirmations) ? match.completion_confirmations.map(Number) : [];
        if (!confirmations.includes(Number(userId))) confirmations.push(Number(userId));
        match.completion_confirmations = confirmations;
        rideCompleted = match.status !== 'completed' && participantIds.every((participantId) => confirmations.includes(participantId));
      } else {
        if (Number(userId) === Number(match.user1_id)) match.user1_completed_confirmed = true;
        if (Number(userId) === Number(match.user2_id)) match.user2_completed_confirmed = true;
        rideCompleted = markRideCompletedIfConfirmed(match);
      }
      if (rideCompleted) match.status = 'completed';

      if (dbReady) {
        await match.save();
      }

      const completionPayload = {
        matchId,
        user1_completed_confirmed: match.user1_completed_confirmed,
        user2_completed_confirmed: match.user2_completed_confirmed,
        completionConfirmations: match.completion_confirmations || [],
        status: match.status
      };
      participantIds.forEach((participantId) => emitToUser(participantId, 'rideCompletionUpdate', completionPayload));

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
