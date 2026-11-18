const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { rideController } = require('../src/controllers/rideController');
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

function createRequest(id, userId, time, overrides = {}) {
  return {
    id,
    user_id: userId,
    user_name: `Rider ${userId}`,
    origin: 'Madina',
    origin_latitude: 5.67,
    origin_longitude: -0.17,
    destination: 'University of Ghana',
    destination_latitude: 5.65,
    destination_longitude: -0.19,
    time: new Date(time),
    status: 'pending',
    match_id: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
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
});

test('expires unmatched requests one hour after the requested ride time', async () => {
  const now = Date.now();
  const expiredRequest = createRequest(1, 1, now - 61 * 60 * 1000);
  const activeRequest = createRequest(2, 1, now + 30 * 60 * 1000);
  const matchedRequest = createRequest(3, 1, now - 61 * 60 * 1000, { status: 'matched', match_id: 7 });
  getMemoryStore().rideRequests.push(expiredRequest, activeRequest, matchedRequest);

  const response = createResponse();
  await rideController.listRequests({ query: { userId: '1', includeHistory: 'true' } }, response);

  assert.equal(expiredRequest.status, 'cancelled');
  assert.equal(activeRequest.status, 'pending');
  assert.equal(matchedRequest.status, 'matched');
  assert.equal(response.payload.requests.find((request) => request.id === 1).status, 'cancelled');
});

test('starting a new search cancels the user previous open search', async () => {
  const now = Date.now();
  getMemoryStore().users.push({ id: 1, name: 'Rider', email: 'rider@example.com' });
  const oldRequest = createRequest(1, 1, now + 30 * 60 * 1000);
  getMemoryStore().rideRequests.push(oldRequest);

  const response = createResponse();
  await rideController.findRide({
    body: {
      origin: 'Madina',
      destination: 'University of Ghana',
      time: new Date(now + 40 * 60 * 1000).toISOString(),
      userName: 'Rider',
      userEmail: 'rider@example.com'
    }
  }, response);

  assert.equal(oldRequest.status, 'cancelled');
  assert.equal(response.payload.request.status, 'pending');
});

test('marketplace excludes expired requests and keeps active requests available', async () => {
  const now = Date.now();
  const store = getMemoryStore();
  store.users.push(
    { id: 1, name: 'Owner', email: 'owner@example.com' },
    { id: 2, name: 'Expired rider', email: 'expired@example.com' },
    { id: 3, name: 'Active rider', email: 'active@example.com' }
  );
  store.rideRequests.push(
    createRequest(1, 1, now + 20 * 60 * 1000),
    createRequest(2, 2, now - 61 * 60 * 1000),
    createRequest(3, 3, now + 25 * 60 * 1000)
  );

  const response = createResponse();
  await rideController.marketplace({ query: { userId: '1', requestId: '1' } }, response);

  assert.equal(response.payload.success, true);
  assert.deepEqual(response.payload.requests.map((request) => request.id), [3]);
  assert.equal(store.rideRequests[1].status, 'cancelled');
});
