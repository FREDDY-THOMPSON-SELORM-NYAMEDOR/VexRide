const { RideRequest, Match, User, ConnectionRequest } = require('../models');
const { ensureUser, parseRideTime, getDbReady, getMemoryStore } = require('../utils/helpers');
const { buildLiveMatchState } = require('../utils/liveLocation');
const { Op } = require('sequelize');

let io;
const LOCATION_MATCH_RADIUS_METERS = 2500;

function setIO(socketIO) {
  io = socketIO;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function normalizeRideParticipant(record) {
  if (!record) return null;

  const plainRecord = record.get ? record.get({ plain: true }) : { ...record };
  const name = plainRecord.name || plainRecord.user_name || plainRecord.userName || null;

  return {
    ...plainRecord,
    name,
    user_name: plainRecord.user_name || name
  };
}

function serializeRequest(record) {
  const request = normalizeRideParticipant(record) || {};
  const originData = request.origin_data || {
    lat: request.origin_latitude,
    lon: request.origin_longitude,
    city: null,
    region: null,
    country: null
  };
  return {
    _id: request.id,
    id: request.id,
    userId: request.user_id,
    userName: request.user_name || request.name,
    origin: originData,
    originLabel: request.origin,
    destination: request.destination,
    destinationLocation: Number.isFinite(Number(request.destination_latitude)) && Number.isFinite(Number(request.destination_longitude))
      ? { lat: Number(request.destination_latitude), lon: Number(request.destination_longitude) }
      : null,
    time: request.time,
    status: request.status,
    groupOwnerConfirmed: Boolean(request.group_owner_confirmed),
    matchId: request.match_id || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
}

async function findRequestById(requestId, userId) {
  const numericRequestId = Number(requestId);
  const numericUserId = userId === undefined ? null : Number(userId);
  if (getDbReady()) {
    return RideRequest.findOne({
      where: { id: numericRequestId, ...(numericUserId ? { user_id: numericUserId } : {}) }
    });
  }
  return getMemoryStore().rideRequests.find((entry) =>
    Number(entry.id) === numericRequestId && (numericUserId === null || Number(entry.user_id) === numericUserId)
  ) || null;
}

async function emitRequestUpdated(request) {
  const payload = serializeRequest(request);
  emitToUser(request.user_id, 'requestUpdated', payload);
  const connections = getDbReady()
    ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
    : getMemoryStore().connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
  connections.forEach((connection) => emitToUser(connection.requester_id, 'requestUpdated', payload));
  return payload;
}

async function emitGroupMatchFound(request) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const connections = dbReady
    ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
    : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
  const payload = { requestId: Number(request.id), rideRequestId: Number(request.id), request: serializeRequest(request) };
  emitToUser(request.user_id, 'groupMatchFound', { ...payload, matchId: request.match_id || null });
  connections.forEach((connection) => emitToUser(connection.requester_id, 'groupMatchFound', { ...payload, matchId: connection.match_id || request.match_id || null }));
}

async function getGroupLocationState(request) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const connections = dbReady
    ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
    : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
  const userIds = [Number(request.user_id), ...connections.map((entry) => Number(entry.requester_id))];
  const users = dbReady
    ? await User.findAll({ where: { id: userIds } })
    : memoryStore.users.filter((entry) => userIds.includes(Number(entry.id)));
  const riderRequests = dbReady
    ? await RideRequest.findAll({ where: { user_id: userIds }, order: [['createdAt', 'DESC']] })
    : memoryStore.rideRequests.filter((entry) => userIds.includes(Number(entry.user_id)))
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  const participants = userIds.map((userId) => {
    const user = users.find((entry) => Number(entry.id) === userId);
    const fallbackRequest = userId === Number(request.user_id)
      ? request
      : riderRequests.find((entry) => Number(entry.user_id) === userId);
    const hasLiveLocation = user?.current_latitude !== null && user?.current_latitude !== undefined &&
      user?.current_longitude !== null && user?.current_longitude !== undefined &&
      Number.isFinite(Number(user.current_latitude)) && Number.isFinite(Number(user.current_longitude));
    const hasPickupLocation = fallbackRequest?.origin_latitude !== null && fallbackRequest?.origin_latitude !== undefined &&
      fallbackRequest?.origin_longitude !== null && fallbackRequest?.origin_longitude !== undefined &&
      Number.isFinite(Number(fallbackRequest.origin_latitude)) && Number.isFinite(Number(fallbackRequest.origin_longitude));
    const latitude = hasLiveLocation ? Number(user.current_latitude) : hasPickupLocation ? Number(fallbackRequest.origin_latitude) : null;
    const longitude = hasLiveLocation ? Number(user.current_longitude) : hasPickupLocation ? Number(fallbackRequest.origin_longitude) : null;
    return {
      id: userId,
      userId,
      name: user?.name || fallbackRequest?.user_name || 'Rider',
      latitude,
      longitude,
      updatedAt: hasLiveLocation ? user.location_updated_at : null,
      locationType: hasLiveLocation ? 'live' : 'pickup'
    };
  }).filter((participant) => Number.isFinite(participant.latitude) && Number.isFinite(participant.longitude));
  const carLocation = participants.length
    ? {
        latitude: participants.reduce((total, entry) => total + entry.latitude, 0) / participants.length,
        longitude: participants.reduce((total, entry) => total + entry.longitude, 0) / participants.length
      }
    : null;
  const pickupSequence = carLocation
    ? participants.slice().sort((first, second) =>
        distanceMeters(first.latitude, first.longitude, carLocation.latitude, carLocation.longitude) -
        distanceMeters(second.latitude, second.longitude, carLocation.latitude, carLocation.longitude)
      )
    : [];
  return {
    rideRequestId: Number(request.id),
    participants,
    carLocation,
    pickupSequence,
    pickupSummary: pickupSequence.length
      ? `Pickup order: ${pickupSequence.map((entry) => entry.name).join(' -> ')}`
      : 'Waiting for rider locations'
  };
}

async function emitGroupLocationUpdate(request) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const connections = dbReady
    ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
    : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
  const liveLocationState = await getGroupLocationState(request);
  const payload = { rideRequestId: Number(request.id), liveLocationState };
  emitToUser(request.user_id, 'groupLocationUpdate', payload);
  connections.forEach((connection) => emitToUser(connection.requester_id, 'groupLocationUpdate', payload));
}

async function cancelOpenSearches(userId, exceptRequestId) {
  const requests = await getRequestsForUser(userId);
  const openSearches = requests.filter((request) =>
    Number(request.id) !== Number(exceptRequestId) && ['pending', 'connection_requested'].includes(request.status)
  );
  for (const request of openSearches) {
    if (getDbReady()) await request.update({ status: 'cancelled' });
    else { request.status = 'cancelled'; request.updatedAt = new Date(); }
    await emitRequestUpdated(request);
  }
}

async function markUserSearchesJoined(userId) {
  const requests = await getRequestsForUser(userId);
  const activeRequests = requests.filter((request) => ['pending', 'connection_requested'].includes(request.status));
  for (const request of activeRequests) {
    if (getDbReady()) await request.update({ status: 'joined' });
    else { request.status = 'joined'; request.updatedAt = new Date(); }
    await emitRequestUpdated(request);
  }
}

function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

function distanceMeters(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const values = [firstLatitude, firstLongitude, secondLatitude, secondLongitude].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return Number.POSITIVE_INFINITY;
  const [lat1, lon1, lat2, lon2] = values.map((value) => value * Math.PI / 180);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const arc = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function compatibilityScore(request, candidate, groupSize = 1) {
  const destinationMatches = request.destination?.trim().toLowerCase() === candidate.destination?.trim().toLowerCase();
  const destinationScore = destinationMatches ? 45 : (request.destination?.toLowerCase().includes(candidate.destination?.toLowerCase()) || candidate.destination?.toLowerCase().includes(request.destination?.toLowerCase()) ? 30 : 0);
  const timeDifference = Math.abs(new Date(request.time).getTime() - new Date(candidate.time).getTime()) / 60000;
  const timeScore = timeDifference <= 15 ? 30 : timeDifference <= 30 ? 20 : timeDifference <= 60 ? 10 : 0;
  const originDistance = distanceMeters(request.origin_latitude, request.origin_longitude, candidate.origin_latitude, candidate.origin_longitude);
  const originScore = originDistance <= 2500 ? 20 : originDistance <= 7500 ? 12 : request.origin?.trim().toLowerCase() === candidate.origin?.trim().toLowerCase() ? 18 : 0;
  const groupScore = groupSize <= 2 ? 5 : groupSize <= 4 ? 3 : 1;
  return Math.min(99, destinationScore + timeScore + originScore + groupScore);
}

async function getMarketplaceRequests(userId, requestId) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const ownRequest = dbReady
    ? await RideRequest.findOne({ where: { id: Number(requestId), user_id: Number(userId) } })
    : memoryStore.rideRequests.find((entry) => Number(entry.id) === Number(requestId) && Number(entry.user_id) === Number(userId));
  if (!ownRequest) return null;

  const candidates = dbReady
    ? await RideRequest.findAll({ where: { user_id: { [Op.ne]: Number(userId) }, status: { [Op.in]: ['pending', 'connection_requested', 'partially_grouped'] } }, order: [['time', 'ASC']] })
    : memoryStore.rideRequests.filter((entry) => Number(entry.user_id) !== Number(userId) && ['pending', 'connection_requested', 'partially_grouped'].includes(entry.status));
  const activeOutgoingRequesterIds = dbReady
    ? new Set((await ConnectionRequest.findAll({
        where: { status: { [Op.in]: ['sent', 'accepted'] } },
        attributes: ['requester_id'],
        group: ['requester_id']
      })).map((connection) => Number(connection.requester_id)))
    : new Set(memoryStore.connectionRequests
      .filter((connection) => ['sent', 'accepted'].includes(connection.status))
      .map((connection) => Number(connection.requester_id)));

  const results = [];
  for (const candidate of candidates) {
    if (activeOutgoingRequesterIds.has(Number(candidate.user_id))) continue;
    const existingConnection = dbReady
      ? await ConnectionRequest.findOne({ where: { ride_request_id: candidate.id, requester_id: Number(userId) } })
      : memoryStore.connectionRequests.find((entry) => Number(entry.ride_request_id) === Number(candidate.id) && Number(entry.requester_id) === Number(userId));
    const owner = dbReady
      ? await User.findByPk(candidate.user_id)
      : memoryStore.users.find((entry) => Number(entry.id) === Number(candidate.user_id));
    const groupSize = dbReady
      ? await ConnectionRequest.count({ where: { ride_request_id: candidate.id, status: 'accepted' } }) + 1
      : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(candidate.id) && entry.status === 'accepted').length + 1;
    const compatibility = compatibilityScore(ownRequest, candidate, groupSize);
    if (compatibility < 55) continue;
    results.push({
      ...serializeRequest(candidate),
      userName: owner?.name || candidate.user_name,
      profileImage: owner?.profile_image || null,
      rating: owner?.rating || null,
      verified: Boolean(owner?.email),
      compatibility,
      groupSize,
      connectionStatus: existingConnection?.status || null
    });
  }
  return results.sort((first, second) => second.compatibility - first.compatibility);
}

async function createConnectionRecord({ rideRequestId, requesterId, recipientId, message }) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  if (dbReady) return ConnectionRequest.create({ ride_request_id: rideRequestId, requester_id: requesterId, recipient_id: recipientId, message: message || null });
  const connection = { id: memoryStore.connectionRequests.length + 1, ride_request_id: rideRequestId, requester_id: requesterId, recipient_id: recipientId, status: 'sent', message: message || null, createdAt: new Date(), updatedAt: new Date() };
  memoryStore.connectionRequests.push(connection);
  return connection;
}

async function createGroupMatch(request, connections) {
  if (!request) return null;
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  let match = request.match_id
    ? (dbReady
      ? await Match.findByPk(request.match_id)
      : memoryStore.matches.find((entry) => Number(entry.id) === Number(request.match_id)))
    : null;

  if (!match || match.match_type !== 'group') {
    const matchPayload = {
      ride1_id: request.id,
      ride2_id: request.id,
      match_type: 'group',
      group_request_id: request.id,
      status: 'pending',
      user1_id: Number(request.user_id),
      user1_name: request.user_name,
      pickup_location: request.origin,
      dropoff_location: request.destination,
      ride_time: request.time
    };
    match = dbReady
      ? await Match.create(matchPayload)
      : (() => {
          const created = { id: memoryStore.matches.length + 1, ...matchPayload, createdAt: new Date(), updatedAt: new Date() };
          memoryStore.matches.push(created);
          return created;
        })();
  }

  if (dbReady) {
    await request.update({ match_id: match.id });
    for (const connection of connections) await connection.update({ match_id: match.id });
  } else {
    request.match_id = match.id;
    request.updatedAt = new Date();
    connections.forEach((connection) => { connection.match_id = match.id; connection.updatedAt = new Date(); });
  }
  return match;
}

function locationsMatch(request, candidate, prefix, label) {
  const requestLatitude = request[`${prefix}_latitude`];
  const requestLongitude = request[`${prefix}_longitude`];
  const candidateLatitude = candidate[`${prefix}_latitude`];
  const candidateLongitude = candidate[`${prefix}_longitude`];
  const coordinateDistance = distanceMeters(requestLatitude, requestLongitude, candidateLatitude, candidateLongitude);
  if (coordinateDistance <= LOCATION_MATCH_RADIUS_METERS) return true;
  return request[label]?.trim().toLowerCase() === candidate[label]?.trim().toLowerCase();
}

async function getUserRecord(userId) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  if (dbReady) {
    return User.findByPk(userId);
  }

  return memoryStore.users.find((entry) => entry.id === Number(userId)) || null;
}

async function getMatchRecord(matchId) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  if (dbReady) {
    return Match.findByPk(matchId);
  }

  return memoryStore.matches.find((entry) => entry.id === Number(matchId)) || null;
}

async function getActiveMatchesForUser(userId) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();
  const numericUserId = Number(userId);

  if (dbReady) {
    return Match.findAll({
      where: {
        status: { [Op.in]: ['pending', 'confirmed'] },
        [Op.or]: [
          { user1_id: numericUserId },
          { user2_id: numericUserId }
        ]
      }
    });
  }

  return memoryStore.matches.filter((entry) =>
    ['pending', 'confirmed'].includes(entry.status) &&
    (entry.user1_id === numericUserId || entry.user2_id === numericUserId)
  );
}

async function getLiveMatchState(match) {
  if (!match) return null;

  const user1 = await getUserRecord(match.user1_id);
  const user2 = await getUserRecord(match.user2_id);
  return buildLiveMatchState({
    match,
    user1,
    user2
  });
}

async function emitLiveMatchState(match, reason = 'locationUpdate') {
  if (!match) return null;

  const liveLocationState = await getLiveMatchState(match);
  if (!liveLocationState) return null;

  emitToUser(match.user1_id, 'matchLocationUpdate', { reason, ...liveLocationState });
  emitToUser(match.user2_id, 'matchLocationUpdate', { reason, ...liveLocationState });
  return liveLocationState;
}

async function createRideRequestRecord(payload) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  if (dbReady) {
    return RideRequest.create(payload);
  }

  const request = {
    id: memoryStore.rideRequests.length + 1,
    ...payload,
    createdAt: new Date(),
    updatedAt: new Date()
  }; 
  memoryStore.rideRequests.push(request);
  return request;
}

async function getRequestsForUser(userId) {
  const numericUserId = Number(userId);
  if (getDbReady()) {
    return RideRequest.findAll({ where: { user_id: numericUserId }, order: [['createdAt', 'DESC']] });
  }
  return getMemoryStore().rideRequests
    .filter((entry) => Number(entry.user_id) === numericUserId)
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
}

async function findMatchingRide(request) {
  const dbReady = getDbReady();
  const memoryStore = getMemoryStore();

  if (dbReady) {
    const windowStart = new Date(request.time.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(request.time.getTime() + 30 * 60 * 1000);

    const candidates = await RideRequest.findAll({
      where: {
        status: 'pending',
        time: { [Op.between]: [windowStart, windowEnd] }
      },
      order: [['createdAt', 'ASC']]
    });

    const match = candidates.find((candidate) => {
      return (
        candidate.user_id !== request.user_id &&
        locationsMatch(request, candidate, 'origin', 'origin') &&
        locationsMatch(request, candidate, 'destination', 'destination')
      );
    });
    if (!match) return null;

    const createdMatch = await Match.create({ 
      ride1_id: request.id, 
      ride2_id: match.id,
      user1_name: request.user_name,
      user2_name: match.user_name,
      user1_id: request.user_id,
      user2_id: match.user_id,
      status: 'pending',
      pickup_location: request.origin,
      dropoff_location: request.destination,
      ride_time: request.time
    });
    await request.update({ status: 'matched', match_id: createdMatch.id });
    await match.update({ status: 'matched', match_id: createdMatch.id });
    const liveLocationState = await getLiveMatchState(createdMatch);
    const requestPayload = normalizeRideParticipant(request);
    const counterPartyPayload = normalizeRideParticipant(match);
    const createdMatchPayload = normalizeRideParticipant(createdMatch);
 
    const matchPayload = {
      ...createdMatchPayload,
      matchId: createdMatch.id,
      request: requestPayload,
      counterParty: counterPartyPayload,
      matchedRide: counterPartyPayload,
      liveLocationState
    };

    //console.log(request.user_id, match.user_id, request, match, createdMatch.id);
    emitToUser(request.user_id, 'matchFound', {
      requestId: request.id,
      matchId: createdMatch.id,
      partnerInfo: counterPartyPayload,
      origin: serializeRequest(request).origin,
      destination: request.destination,
      request: requestPayload,
      counterParty: counterPartyPayload,
      liveLocationState
    });

    emitToUser(match.user_id, 'matchFound', {
      requestId: match.id,
      matchId: createdMatch.id,
      partnerInfo: requestPayload,
      origin: serializeRequest(match).origin,
      destination: match.destination,
      request: counterPartyPayload,
      counterParty: requestPayload,
      liveLocationState
    });
    broadcast('rideMatched', { matchId: createdMatch.id, origin: request.origin, destination: request.destination });
    await emitRequestUpdated(request);
    await emitRequestUpdated(match);
    return matchPayload;
  }

  const windowStart = new Date(request.time.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(request.time.getTime() + 30 * 60 * 1000);

  const candidates = memoryStore.rideRequests.filter((candidate) => {
    const candidateTime = candidate.time instanceof Date ? candidate.time : new Date(candidate.time);
    return (
      locationsMatch(request, candidate, 'origin', 'origin') &&
      locationsMatch(request, candidate, 'destination', 'destination') &&
      candidate.status === 'pending' &&
      candidate.user_id !== request.user_id &&
      candidateTime >= windowStart &&
      candidateTime <= windowEnd
    );
  });

  const match = candidates[0];
  if (!match) return null;

  const createdMatch = {
    id: memoryStore.matches.length + 1,
    ride1_id: request.id,
    ride2_id: match.id,
    user1_id: request.user_id,
    user2_id: match.user_id,
    status: 'pending',
    pickup_location: request.origin,
    dropoff_location: request.destination,
    ride_time: request.time,
    user1_confirmed: false,
    user2_confirmed: false,
    user1_completed_confirmed: false,
    user2_completed_confirmed: false,
    user1_payment_status: 'pending',
    user2_payment_status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  memoryStore.matches.push(createdMatch);
  request.status = 'matched';
  match.status = 'matched';
  request.match_id = createdMatch.id;
  match.match_id = createdMatch.id;

  const requestPayload = normalizeRideParticipant(request);
  const counterPartyPayload = normalizeRideParticipant(match);
  const createdMatchPayload = normalizeRideParticipant(createdMatch);
  const matchPayload = {
    ...createdMatchPayload,
    matchId: createdMatch.id,
    request: requestPayload,
    counterParty: counterPartyPayload,
    matchedRide: counterPartyPayload
  };

  emitToUser(request.user_id, 'matchFound', {
    requestId: request.id,
    matchId: createdMatch.id,
    partnerInfo: counterPartyPayload,
    origin: serializeRequest(request).origin,
    destination: request.destination,
    request: requestPayload,
    counterParty: counterPartyPayload,
    liveLocationState: await getLiveMatchState(createdMatch)
  });

  emitToUser(match.user_id, 'matchFound', {
    requestId: match.id,
    matchId: createdMatch.id,
    partnerInfo: requestPayload,
    origin: serializeRequest(match).origin,
    destination: match.destination,
    request: counterPartyPayload,
    counterParty: requestPayload,
    liveLocationState: await getLiveMatchState(createdMatch)
  });
  
  broadcast('rideMatched', { matchId: createdMatch.id, origin: request.origin, destination: request.destination });
  await emitRequestUpdated(request);
  await emitRequestUpdated(match);
  return createdMatch;
}

const rideController = {
  async findRide(req, res) {
    try {
      const {
        origin, destination, time, userName, userEmail,
        originLatitude, originLongitude, destinationLatitude, destinationLongitude,
        originData
      } = req.body;
      const user = await ensureUser(userName, userEmail);
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();

      const request = await createRideRequestRecord({
        origin,
        origin_data: originData ? {
          lat: Number(originData.lat),
          lon: Number(originData.lon),
          city: originData.city || null,
          region: originData.region || null,
          country: originData.country || null
        } : null,
        destination,
        origin_latitude: Number.isFinite(Number(originLatitude)) ? Number(originLatitude) : null,
        origin_longitude: Number.isFinite(Number(originLongitude)) ? Number(originLongitude) : null,
        destination_latitude: Number.isFinite(Number(destinationLatitude)) ? Number(destinationLatitude) : null,
        destination_longitude: Number.isFinite(Number(destinationLongitude)) ? Number(destinationLongitude) : null,
        time: parseRideTime(time),
        user_id: user.id,
        user_name: user.name,
        status: 'pending'
      });

      const requestPayload = normalizeRideParticipant(request);
      const serializedRequest = serializeRequest(request);
      emitToUser(user.id, 'requestCreated', serializedRequest);
      broadcast('requestCreated', serializedRequest);
      res.json({ success: true, request: { ...requestPayload, ...serializedRequest }, match: null });
    } catch (error) {
      console.error('Error finding ride:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async marketplace(req, res) {
    try {
      const userId = Number(req.query.userId);
      const requestId = Number(req.query.requestId);
      if (!userId || !requestId) return res.status(400).json({ success: false, message: 'userId and requestId are required' });
      const requests = await getMarketplaceRequests(userId, requestId);
      if (!requests) return res.status(404).json({ success: false, message: 'Ride request not found' });
      res.json({ success: true, requests });
    } catch (error) {
      console.error('Error loading ride marketplace:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async sendConnectionRequest(req, res) {
    try {
      const { requestId, userId, message } = req.body;
      const requesterId = Number(userId);
      const targetRequestId = Number(requestId);
      if (!requesterId || !targetRequestId) return res.status(400).json({ success: false, message: 'requestId and userId are required' });

      const targetRequest = await findRequestById(targetRequestId);
      if (!targetRequest || Number(targetRequest.user_id) === requesterId) return res.status(404).json({ success: false, message: 'Marketplace request not found' });
      if (!['pending', 'connection_requested', 'partially_grouped'].includes(targetRequest.status)) {
        return res.status(409).json({ success: false, message: 'This request is no longer accepting connections' });
      }

      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const reciprocalConnection = dbReady
        ? await ConnectionRequest.findOne({
            where: {
              requester_id: Number(targetRequest.user_id),
              recipient_id: requesterId,
              status: { [Op.in]: ['sent', 'accepted'] }
            }
          })
        : memoryStore.connectionRequests.find((entry) =>
            Number(entry.requester_id) === Number(targetRequest.user_id) &&
            Number(entry.recipient_id) === requesterId &&
            ['sent', 'accepted'].includes(entry.status)
          );
      if (reciprocalConnection) {
        return res.status(409).json({ success: false, message: 'A connection request is already pending between these riders' });
      }
      const existing = dbReady
        ? await ConnectionRequest.findOne({ where: { ride_request_id: targetRequestId, requester_id: requesterId } })
        : memoryStore.connectionRequests.find((entry) => Number(entry.ride_request_id) === targetRequestId && Number(entry.requester_id) === requesterId);
      if (existing && ['sent', 'accepted'].includes(existing.status)) return res.status(409).json({ success: false, message: 'Connection request already exists', connection: existing });
      const activeMembership = dbReady
        ? await ConnectionRequest.findOne({ where: { requester_id: requesterId, status: 'accepted' } })
        : memoryStore.connectionRequests.find((entry) => Number(entry.requester_id) === requesterId && entry.status === 'accepted');
      if (activeMembership) return res.status(409).json({ success: false, message: 'Leave your current ride group before joining another' });

      const connection = existing
        ? (dbReady
          ? await existing.update({ recipient_id: Number(targetRequest.user_id), message: message || null, status: 'sent', requester_confirmed: false })
          : Object.assign(existing, { recipient_id: Number(targetRequest.user_id), message: message || null, status: 'sent', requester_confirmed: false, updatedAt: new Date() }))
        : await createConnectionRecord({ rideRequestId: targetRequestId, requesterId, recipientId: Number(targetRequest.user_id), message });
      if (targetRequest.status === 'pending') {
        if (dbReady) await targetRequest.update({ status: 'connection_requested' });
        else { targetRequest.status = 'connection_requested'; targetRequest.updatedAt = new Date(); }
      }
      const requester = await getUserRecord(requesterId);
      const notification = {
        connectionId: connection.id,
        requestId: targetRequestId,
        requesterId,
        message: message || null,
        requester: requester ? { id: requester.id, name: requester.name, email: requester.email, rating: requester.rating, profileImage: requester.profile_image || null, verified: Boolean(requester.email) } : null,
        rideRequest: serializeRequest(targetRequest)
      };
      emitToUser(Number(targetRequest.user_id), 'connectionRequested', notification);
      const connectionPayload = connection.get ? connection.get({ plain: true }) : connection;
      res.status(201).json({ success: true, connection: { ...connectionPayload, ...notification } });
    } catch (error) {
      console.error('Error sending connection request:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async listConnectionRequests(req, res) {
    try {
      const userId = Number(req.query.userId);
      if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const connections = dbReady
        ? await ConnectionRequest.findAll({ where: { [Op.or]: [{ requester_id: userId }, { recipient_id: userId }] }, order: [['createdAt', 'DESC']] })
        : memoryStore.connectionRequests.filter((entry) => Number(entry.requester_id) === userId || Number(entry.recipient_id) === userId).sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
      const enrichedConnections = await Promise.all(connections.map(async (connection) => {
        const requester = await getUserRecord(connection.requester_id);
        const recipient = await getUserRecord(connection.recipient_id);
        const rideRequest = await findRequestById(connection.ride_request_id);
        return {
          ...(connection.get ? connection.get({ plain: true }) : connection),
          requester: requester ? { id: requester.id, name: requester.name, email: requester.email, rating: requester.rating, profileImage: requester.profile_image || null, verified: Boolean(requester.email) } : null,
          recipient: recipient ? { id: recipient.id, name: recipient.name } : null,
          rideRequest: serializeRequest(rideRequest)
        };
      }));
      res.json({ success: true, connections: enrichedConnections });
    } catch (error) {
      console.error('Error listing connection requests:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateConnectionRequest(req, res) {
    try {
      const connectionId = Number(req.params.id);
      const userId = Number(req.body.userId);
      const status = req.body.status;
      if (!connectionId || !userId || !['accepted', 'declined', 'cancelled'].includes(status)) return res.status(400).json({ success: false, message: 'Valid connection id, userId, and status are required' });
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const connection = dbReady
        ? await ConnectionRequest.findByPk(connectionId)
        : memoryStore.connectionRequests.find((entry) => Number(entry.id) === connectionId);
      if (!connection) return res.status(404).json({ success: false, message: 'Connection request not found' });
      if (status === 'accepted' && Number(connection.recipient_id) !== userId) return res.status(403).json({ success: false, message: 'Only the ride owner can accept a connection request' });
      if (status === 'declined' && Number(connection.recipient_id) !== userId) return res.status(403).json({ success: false, message: 'Only the ride owner can decline a connection request' });
      if (status === 'cancelled' && Number(connection.requester_id) !== userId) return res.status(403).json({ success: false, message: 'Only the joining rider can leave this group' });
      const rideRequest = await findRequestById(connection.ride_request_id);
      if (status === 'accepted' && (!rideRequest || !['pending', 'connection_requested', 'partially_grouped'].includes(rideRequest.status))) {
        return res.status(409).json({ success: false, message: 'This ride group is no longer accepting riders' });
      }
      if (status === 'accepted') {
        const requesterRequests = await getRequestsForUser(connection.requester_id);
        if (requesterRequests.some((entry) => ['partially_grouped', 'grouped', 'matched'].includes(entry.status))) {
          return res.status(409).json({ success: false, message: 'Leave your current ride group before joining another' });
        }
        const existingMembership = dbReady
          ? await ConnectionRequest.findOne({ where: { requester_id: connection.requester_id, status: 'accepted' } })
          : memoryStore.connectionRequests.find((entry) => Number(entry.requester_id) === Number(connection.requester_id) && entry.status === 'accepted');
        if (existingMembership && Number(existingMembership.id) !== Number(connection.id)) {
          return res.status(409).json({ success: false, message: 'This rider already belongs to another ride group' });
        }
      }
      if (status !== 'accepted' && status !== 'declined' && connection.status !== 'sent' && connection.status !== 'accepted') {
        return res.status(409).json({ success: false, message: 'This connection request is no longer active' });
      }
      const wasAccepted = connection.status === 'accepted';
      const changes = { status, ...(status === 'accepted' ? { requester_confirmed: false } : {}) };
      if (dbReady) await connection.update(changes);
      else { Object.assign(connection, changes, { updatedAt: new Date() }); }
      if (status === 'accepted') {
        if (rideRequest) {
          if (dbReady) await rideRequest.update({ status: 'partially_grouped' });
          else { rideRequest.status = 'partially_grouped'; rideRequest.updatedAt = new Date(); }
          await markUserSearchesJoined(connection.requester_id);
          await emitRequestUpdated(rideRequest);
        }
      }
      if (status === 'cancelled' && rideRequest && wasAccepted) {
        await emitRequestUpdated(rideRequest);
      }
      const plainConnection = connection.get ? connection.get({ plain: true }) : { ...connection };
      const recipient = await getUserRecord(connection.recipient_id);
      const requester = await getUserRecord(connection.requester_id);
      const eventPayload = {
        ...plainConnection,
        connectionId: plainConnection.id,
        requestId: Number(connection.ride_request_id),
        rideRequest: serializeRequest(rideRequest),
        recipient: recipient ? { id: recipient.id, name: recipient.name } : null,
        requester: requester ? { id: requester.id, name: requester.name } : null
      };
      eventPayload.matchId = connection.match_id || null;
      const eventName = `connection${status[0].toUpperCase()}${status.slice(1)}`;
      emitToUser(Number(connection.requester_id), eventName, eventPayload);
      emitToUser(Number(connection.recipient_id), eventName, eventPayload);
      res.json({ success: true, connection: eventPayload });
    } catch (error) {
      console.error('Error updating connection request:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async cancelRide(req, res) {
    try {
      const { requestId, userId } = req.body;
      if (!requestId || !userId) {
        return res.status(400).json({ success: false, message: 'requestId and userId are required' });
      }

      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      if (dbReady) {
        const request = await RideRequest.findOne({ where: { id: requestId, user_id: userId } });
        if (!request) return res.status(404).json({ success: false, message: 'Ride request not found' });
        await request.update({ status: 'cancelled' });
        await emitRequestUpdated(request);
      } else {
        const request = memoryStore.rideRequests.find((entry) => entry.id === Number(requestId) && entry.user_id === Number(userId));
        if (!request) return res.status(404).json({ success: false, message: 'Ride request not found' });
        request.status = 'cancelled';
        request.updatedAt = new Date();
        await emitRequestUpdated(request);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async listRequests(req, res) {
    try {
      const userId = Number(req.query.userId);
      if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
      const requests = await getRequestsForUser(userId);
      const visibleRequests = req.query.includeHistory === 'true'
        ? requests
        : requests.filter((request) => ['pending', 'connection_requested', 'partially_grouped', 'grouped'].includes(request.status));
      res.json({ success: true, requests: visibleRequests.map(serializeRequest) });
    } catch (error) {
      console.error('Error listing ride requests:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getRequest(req, res) {
    try {
      const request = await findRequestById(req.params.id);
      if (!request) return res.status(404).json({ success: false, message: 'Ride request not found' });
      res.json({ success: true, request: serializeRequest(request) });
    } catch (error) {
      console.error('Error loading ride request:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateRequestStatus(req, res) {
    try {
      const { status, userId } = req.body;
      if (!Number(userId)) return res.status(400).json({ success: false, message: 'userId is required' });
      if (!['grouped', 'withdrawn', 'cancelled', 'completed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Unsupported ride request status' });
      }
      const request = await findRequestById(req.params.id, userId);
      if (!request) return res.status(404).json({ success: false, message: 'Ride request not found' });
      if (request.status === 'matched') return res.status(409).json({ success: false, message: 'This ride group is already matched' });
      if (status === 'grouped' && !['pending', 'connection_requested', 'partially_grouped'].includes(request.status)) {
        return res.status(409).json({ success: false, message: 'This ride group cannot be closed in its current state' });
      }
      const nextStatus = status === 'grouped' ? 'grouped' : status;
      const changes = { status: nextStatus, ...(status === 'grouped' ? { group_owner_confirmed: false } : {}) };
      if (getDbReady()) await request.update(changes);
      else { Object.assign(request, changes, { updatedAt: new Date() }); }
      if (status === 'grouped') {
        const acceptedConnections = getDbReady()
          ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
          : getMemoryStore().connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
        await createGroupMatch(request, acceptedConnections);
        await emitGroupMatchFound(request);
      }
      const payload = await emitRequestUpdated(request);
      res.json({ success: true, request: payload });
    } catch (error) {
      console.error('Error updating ride request:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async confirmGroupMatch(req, res) {
    try {
      const requestId = Number(req.params.id);
      const userId = Number(req.body.userId);
      const request = await findRequestById(requestId);
      if (!request || !userId) return res.status(404).json({ success: false, message: 'Ride group not found' });
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      if (!['grouped', 'matched'].includes(request.status)) return res.status(409).json({ success: false, message: 'The ride owner must finish finding riders first' });

      const isOwner = Number(request.user_id) === userId;
      const connection = !isOwner
        ? (dbReady
          ? await ConnectionRequest.findOne({ where: { ride_request_id: request.id, requester_id: userId, status: 'accepted' } })
          : memoryStore.connectionRequests.find((entry) => Number(entry.ride_request_id) === Number(request.id) && Number(entry.requester_id) === userId && entry.status === 'accepted'))
        : null;
      if (!isOwner && !connection) return res.status(403).json({ success: false, message: 'Only riders in this group can confirm it' });

      if (isOwner) {
        if (dbReady) await request.update({ group_owner_confirmed: true });
        else { request.group_owner_confirmed = true; request.updatedAt = new Date(); }
      } else if (dbReady) {
        await connection.update({ requester_confirmed: true });
      } else {
        connection.requester_confirmed = true;
        connection.updatedAt = new Date();
      }

      const acceptedConnections = dbReady
        ? await ConnectionRequest.findAll({ where: { ride_request_id: request.id, status: 'accepted' } })
        : memoryStore.connectionRequests.filter((entry) => Number(entry.ride_request_id) === Number(request.id) && entry.status === 'accepted');
      const allConfirmed = Boolean(request.group_owner_confirmed) && acceptedConnections.every((entry) => Boolean(entry.requester_confirmed));
      if (allConfirmed) {
        if (dbReady) await request.update({ status: 'matched' });
        else { request.status = 'matched'; request.updatedAt = new Date(); }
        const groupMatch = dbReady
          ? await Match.findByPk(request.match_id)
          : memoryStore.matches.find((entry) => Number(entry.id) === Number(request.match_id));
        if (groupMatch) {
          if (dbReady) await groupMatch.update({ status: 'confirmed' });
          else { groupMatch.status = 'confirmed'; groupMatch.updatedAt = new Date(); }
        }
      }

      const payload = await emitRequestUpdated(request);
      res.json({ success: true, request: payload, matched: allConfirmed, confirmed: allConfirmed });
    } catch (error) {
      console.error('Error confirming group match:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateLocation(req, res) {
    try {
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const { userId, latitude, longitude } = req.body;

      if (!userId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, message: 'userId, latitude, and longitude are required' });
      }

      const numericLatitude = Number(latitude);
      const numericLongitude = Number(longitude);

      if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude)) {
        return res.status(400).json({ success: false, message: 'latitude and longitude must be valid numbers' });
      }

      if (dbReady) {
        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.current_latitude = numericLatitude;
        user.current_longitude = numericLongitude;
        user.location_updated_at = new Date();
        await user.save();
      } else {
        const user = memoryStore.users.find((entry) => entry.id === Number(userId));
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.current_latitude = numericLatitude;
        user.current_longitude = numericLongitude;
        user.location_updated_at = new Date();
      }

      const matches = await getActiveMatchesForUser(userId);
      for (const match of matches) {
        await emitLiveMatchState(match, 'locationUpdate');
      }

      const acceptedConnections = dbReady
        ? await ConnectionRequest.findAll({ where: { requester_id: Number(userId), status: 'accepted' } })
        : memoryStore.connectionRequests.filter((entry) => Number(entry.requester_id) === Number(userId) && entry.status === 'accepted');
      const groupRequestIds = new Set(acceptedConnections.map((entry) => Number(entry.ride_request_id)));
      const ownedMatchedRequests = dbReady
        ? await RideRequest.findAll({ where: { user_id: Number(userId), status: 'matched' } })
        : memoryStore.rideRequests.filter((entry) => Number(entry.user_id) === Number(userId) && entry.status === 'matched');
      ownedMatchedRequests.forEach((request) => groupRequestIds.add(Number(request.id)));
      for (const groupRequestId of groupRequestIds) {
        const groupRequest = await findRequestById(groupRequestId);
        if (groupRequest?.status === 'matched') await emitGroupLocationUpdate(groupRequest);
      }

      emitToUser(userId, 'userLocationUpdated', {
        userId: Number(userId),
        latitude: numericLatitude,
        longitude: numericLongitude,
        updatedAt: new Date()
      });

      res.json({ success: true, location: { latitude: numericLatitude, longitude: numericLongitude } });
    } catch (error) {
      console.error('Error updating location:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getGroupLiveLocation(req, res) {
    try {
      const request = await findRequestById(req.params.id);
      const userId = Number(req.query.userId);
      if (!request || !userId) return res.status(404).json({ success: false, message: 'Ride group not found' });
      const dbReady = getDbReady();
      const memoryStore = getMemoryStore();
      const membership = dbReady
        ? await ConnectionRequest.findOne({ where: { ride_request_id: request.id, requester_id: userId, status: 'accepted' } })
        : memoryStore.connectionRequests.find((entry) => Number(entry.ride_request_id) === Number(request.id) && Number(entry.requester_id) === userId && entry.status === 'accepted');
      if (Number(request.user_id) !== userId && !membership) {
        return res.status(403).json({ success: false, message: 'You are not an active rider in this group' });
      }
      if (request.status !== 'matched') return res.status(409).json({ success: false, message: 'The ride group is still searching for riders' });
      res.json({ success: true, liveLocationState: await getGroupLocationState(request) });
    } catch (error) {
      console.error('Error loading group live locations:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getMatchLiveState(req, res) {
    try {
      const { matchId } = req.params;
      const match = await getMatchRecord(matchId);
      if (!match) {
        return res.status(404).json({ success: false, message: 'Match not found' });
      }

      const liveLocationState = await getLiveMatchState(match);
      res.json({ success: true, liveLocationState });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = { rideController, setIO };
