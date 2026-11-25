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
    body: { requestId: secondRide.request.id, userId: firstUserId }
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
    body: { requestId: joiningRide.request.id, userId: ownerId }
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
