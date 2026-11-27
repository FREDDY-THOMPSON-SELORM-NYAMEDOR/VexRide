const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { rideController, setIO } = require('../src/controllers/rideController');
const { setDbReady, setMemoryStore, getMemoryStore } = require('../src/utils/helpers');

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function rideBody(name, email, origin, latitude, longitude, time) {
  return {
    origin,
    destination: 'University of Ghana',
    time: time.toISOString(),
    originLatitude: latitude,
    originLongitude: longitude,
    destinationLatitude: 5.65,
    destinationLongitude: -0.19,
    userName: name,
    userEmail: email
  };
}

async function findRide(body) {
  const response = createResponse();
  await rideController.findRide({ body }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.success, true);
  return response.payload;
}

beforeEach(() => {
  setDbReady(false);
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
  setIO(null);
});

test('riders must explicitly request and accept a connection before joining', async () => {
  const notifications = [];
  setIO({
    to(room) {
      return { emit: (event, payload) => notifications.push({ room, event, payload }) };
    },
    emit() {}
  });
  const departure = new Date(Date.now() + 20 * 60 * 1000);
  const firstRide = await findRide(rideBody('Ari', 'ari@example.com', 'Madina', 5.67, -0.17, departure));
  assert.equal(firstRide.match, null);

  const secondRide = await findRide(rideBody('Kojo', 'kojo@example.com', 'Madina', 5.671, -0.171, departure));
  const store = getMemoryStore();
  const firstUserId = firstRide.request.userId;
  const secondUserId = secondRide.request.userId;
  assert.equal(secondRide.match, null);
  assert.equal(firstRide.request.status, 'pending');
  assert.equal(secondRide.request.status, 'pending');
  assert.equal(store.matches.length, 0);
  assert.equal(notifications.some((event) => event.event === 'matchFound'), false);

  const marketplace = createResponse();
  await rideController.marketplace({
    query: { userId: String(firstUserId), requestId: String(firstRide.request.id) }
  }, marketplace);
  assert.deepEqual(marketplace.payload.requests.map((request) => request.id), [secondRide.request.id]);

  const invitation = createResponse();
  await rideController.sendConnectionRequest({
    body: { requestId: secondRide.request.id, sourceRequestId: firstRide.request.id, userId: firstUserId }
  }, invitation);
  assert.equal(invitation.statusCode, 201);
  assert.equal(store.rideRequests[1].status, 'connection_requested');

  const accepted = createResponse();
  await rideController.updateConnectionRequest({
    params: { id: invitation.payload.connection.id },
    body: { userId: secondUserId, status: 'accepted' }
  }, accepted);
  assert.equal(accepted.payload.success, true);
  assert.equal(store.rideRequests[1].status, 'partially_grouped');
  assert.equal(Boolean(store.rideRequests[1].match_id), false);
  assert.equal(store.matches.length, 0);
  assert.equal(notifications.some((event) => event.event === 'matchFound'), false);
});

test('riders with an active ride can send connection requests', async () => {
  const departure = new Date(Date.now() + 20 * 60 * 1000);
  const ownerRide = await findRide(rideBody('Owner', 'owner@example.com', 'Madina', 5.67, -0.17, departure));
  const requesterRide = await findRide(rideBody('Requester', 'requester@example.com', 'Adenta', 5.72, -0.17, departure));
  const store = getMemoryStore();
  store.matches.push({
    id: 1,
    status: 'confirmed',
    user1_id: requesterRide.request.userId,
    user2_id: 999
  });

  const response = createResponse();
  await rideController.sendConnectionRequest({
    body: { requestId: ownerRide.request.id, sourceRequestId: requesterRide.request.id, userId: requesterRide.request.userId }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.success, true);
  assert.equal(response.payload.connection.status, 'sent');
});

test('riders with an active ride can have their connection requests accepted', async () => {
  const departure = new Date(Date.now() + 20 * 60 * 1000);
  const ownerRide = await findRide(rideBody('Owner', 'owner@example.com', 'Madina', 5.67, -0.17, departure));
  const requesterRide = await findRide(rideBody('Requester', 'requester@example.com', 'Adenta', 5.72, -0.17, departure));
  const invitation = createResponse();
  await rideController.sendConnectionRequest({
    body: { requestId: ownerRide.request.id, sourceRequestId: requesterRide.request.id, userId: requesterRide.request.userId }
  }, invitation);
  assert.equal(invitation.statusCode, 201);

  getMemoryStore().matches.push({
    id: 1,
    status: 'confirmed',
    user1_id: requesterRide.request.userId,
    user2_id: 999
  });
  const accepted = createResponse();
  await rideController.updateConnectionRequest({
    params: { id: invitation.payload.connection.id },
    body: { userId: ownerRide.request.userId, status: 'accepted' }
  }, accepted);

  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.payload.success, true);
  assert.equal(accepted.payload.connection.status, 'accepted');
});

test('riders can request the original owner to join another rider and receive independent approval', async () => {
  const departure = new Date(Date.now() + 20 * 60 * 1000);
  const originalRide = await findRide(rideBody('Original owner', 'original@example.com', 'Madina', 5.67, -0.17, departure));
  const activeRiderRide = await findRide(rideBody('Active rider', 'active@example.com', 'Madina', 5.67, -0.17, departure));
  const joiningRiderRide = await findRide(rideBody('Joining rider', 'joining@example.com', 'Madina', 5.67, -0.17, departure));
  const store = getMemoryStore();

  const activeRiderInvite = createResponse();
  await rideController.sendConnectionRequest({
    body: {
      requestId: originalRide.request.id,
      sourceRequestId: activeRiderRide.request.id,
      userId: activeRiderRide.request.userId
    }
  }, activeRiderInvite);
  assert.equal(activeRiderInvite.statusCode, 201);

  const initialInvite = createResponse();
  await rideController.sendConnectionRequest({
    body: {
      requestId: activeRiderRide.request.id,
      sourceRequestId: joiningRiderRide.request.id,
      userId: joiningRiderRide.request.userId
    }
  }, initialInvite);
  assert.equal(initialInvite.statusCode, 409);
  assert.equal(initialInvite.payload.code, 'OWNER_HAS_ACTIVE_RIDE');
  assert.equal(initialInvite.payload.activeRide.requestId, originalRide.request.id);
  assert.equal(initialInvite.payload.activeRide.rideOwnerId, originalRide.request.userId);
  assert.equal(initialInvite.payload.activeRide.joiningUserName, 'Active rider');
  assert.equal(store.connectionRequests.length, 1);

  store.connectionRequests.push({
    id: 2,
    ride_request_id: activeRiderRide.request.id,
    requester_id: joiningRiderRide.request.userId,
    recipient_id: activeRiderRide.request.userId,
    status: 'sent',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const staleInviteAcceptance = createResponse();
  await rideController.updateConnectionRequest({
    params: { id: 2 },
    body: { userId: activeRiderRide.request.userId, status: 'accepted' }
  }, staleInviteAcceptance);
  assert.equal(staleInviteAcceptance.statusCode, 409);
  assert.equal(staleInviteAcceptance.payload.code, 'OWNER_HAS_ACTIVE_RIDE');

  const reroutedInvite = createResponse();
  await rideController.sendConnectionRequest({
    body: {
      requestId: originalRide.request.id,
      sourceRequestId: joiningRiderRide.request.id,
      userId: joiningRiderRide.request.userId,
      message: 'I would like to join this ride with Active rider.'
    }
  }, reroutedInvite);
  assert.equal(reroutedInvite.statusCode, 201);
  assert.equal(reroutedInvite.payload.connection.recipient_id, originalRide.request.userId);
  assert.match(reroutedInvite.payload.connection.message, /with Active rider/);

  const acceptedIndependently = createResponse();
  await rideController.updateConnectionRequest({
    params: { id: reroutedInvite.payload.connection.id },
    body: { userId: originalRide.request.userId, status: 'accepted' }
  }, acceptedIndependently);
  assert.equal(acceptedIndependently.payload.success, true);
  assert.equal(store.connectionRequests[0].status, 'sent');
  assert.equal(acceptedIndependently.payload.connection.status, 'accepted');
});

test('marketplace invitations can be accepted and finalized by every group rider', async () => {
  const departure = new Date(Date.now() + 20 * 60 * 1000);
  const ownerRide = await findRide(rideBody('Rider One', 'one@example.com', 'Madina', 5.67, -0.17, departure));
  const joiningRide = await findRide(rideBody('Rider Two', 'two@example.com', 'Adenta', 5.72, -0.17, departure));
  const store = getMemoryStore();
  const ownerId = ownerRide.request.userId;
  const joiningRiderId = joiningRide.request.userId;

  assert.equal(joiningRide.match, null);
  const marketplace = createResponse();
  await rideController.marketplace({
    query: { userId: String(ownerId), requestId: String(ownerRide.request.id) }
  }, marketplace);
  assert.deepEqual(marketplace.payload.requests.map((request) => request.id), [joiningRide.request.id]);

  const invitation = createResponse();
  await rideController.sendConnectionRequest({
    body: { requestId: joiningRide.request.id, sourceRequestId: ownerRide.request.id, userId: ownerId }
  }, invitation);
  assert.equal(invitation.statusCode, 201);
  assert.equal(store.rideRequests[1].status, 'connection_requested');

  const accepted = createResponse();
  await rideController.updateConnectionRequest({
    params: { id: invitation.payload.connection.id },
    body: { userId: joiningRiderId, status: 'accepted' }
  }, accepted);
  assert.equal(accepted.payload.success, true);
  assert.equal(store.rideRequests[0].status, 'cancelled');
  assert.equal(store.rideRequests[1].status, 'partially_grouped');

  const finalized = createResponse();
  await rideController.updateRequestStatus({
    params: { id: joiningRide.request.id },
    body: { userId: joiningRiderId, status: 'grouped' }
  }, finalized);
  assert.equal(finalized.payload.success, true);
  assert.equal(store.matches.length, 1);

  const ownerConfirmation = createResponse();
  await rideController.confirmGroupMatch({
    params: { id: joiningRide.request.id },
    body: { userId: joiningRiderId }
  }, ownerConfirmation);
  assert.equal(ownerConfirmation.payload.confirmed, false);

  const riderConfirmation = createResponse();
  await rideController.confirmGroupMatch({
    params: { id: joiningRide.request.id },
    body: { userId: ownerId }
  }, riderConfirmation);
  assert.equal(riderConfirmation.payload.confirmed, true);
  assert.equal(store.rideRequests[1].status, 'matched');
  assert.equal(store.matches[0].status, 'confirmed');
});

test('marketplace only lists rides with departure times within one hour', async () => {
  const now = Date.now();
  const store = getMemoryStore();
  store.users.push(
    { id: 1, name: 'Owner', email: 'owner@example.com' },
    { id: 2, name: 'Nearby rider', email: 'nearby@example.com' },
    { id: 3, name: 'Boundary rider', email: 'boundary@example.com' },
    { id: 4, name: 'Distant rider', email: 'distant@example.com' }
  );
  store.rideRequests.push(
    {
      id: 1, user_id: 1, user_name: 'Owner', origin: 'Madina', origin_latitude: 5.67, origin_longitude: -0.17,
      destination: 'University of Ghana', time: new Date(now + 20 * 60 * 1000), status: 'pending', match_id: null
    },
    {
      id: 2, user_id: 2, user_name: 'Nearby rider', origin: 'Madina', origin_latitude: 5.67, origin_longitude: -0.17,
      destination: 'University of Ghana', time: new Date(now + 25 * 60 * 1000), status: 'pending', match_id: null
    },
    {
      id: 3, user_id: 3, user_name: 'Boundary rider', origin: 'Madina', origin_latitude: 5.67, origin_longitude: -0.17,
      destination: 'University of Ghana', time: new Date(now + 80 * 60 * 1000), status: 'pending', match_id: null
    },
    {
      id: 4, user_id: 4, user_name: 'Distant rider', origin: 'Madina', origin_latitude: 5.67, origin_longitude: -0.17,
      destination: 'University of Ghana', time: new Date(now + 121 * 60 * 1000), status: 'pending', match_id: null
    }
  );

  const response = createResponse();
  await rideController.marketplace({ query: { userId: '1', requestId: '1' } }, response);

  assert.deepEqual(response.payload.requests.map((request) => request.id), [2, 3]);
});

test('connection requests enforce the one-hour departure limit inclusively', async () => {
  const departure = new Date(Date.now() + 30 * 60 * 1000);
  const requesterRide = await findRide(rideBody('Requester', 'requester@example.com', 'Madina', 5.67, -0.17, departure));
  const boundaryRide = await findRide(rideBody(
    'Boundary rider',
    'boundary@example.com',
    'Madina',
    5.67,
    -0.17,
    new Date(departure.getTime() + 60 * 60 * 1000)
  ));
  const distantRide = await findRide(rideBody(
    'Distant rider',
    'distant@example.com',
    'Madina',
    5.67,
    -0.17,
    new Date(departure.getTime() + 61 * 60 * 1000)
  ));

  const boundaryResponse = createResponse();
  await rideController.sendConnectionRequest({
    body: {
      requestId: boundaryRide.request.id,
      sourceRequestId: requesterRide.request.id,
      userId: requesterRide.request.userId
    }
  }, boundaryResponse);
  assert.equal(boundaryResponse.statusCode, 201);

  const distantResponse = createResponse();
  await rideController.sendConnectionRequest({
    body: {
      requestId: distantRide.request.id,
      sourceRequestId: requesterRide.request.id,
      userId: requesterRide.request.userId
    }
  }, distantResponse);
  assert.equal(distantResponse.statusCode, 409);
  assert.match(distantResponse.payload.message, /within one hour/);
  assert.equal(getMemoryStore().connectionRequests.length, 1);
});
