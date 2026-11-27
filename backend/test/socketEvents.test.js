const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { rideController, setIO: setRideIO } = require('../src/controllers/rideController');
const { groupController, setIO: setGroupIO } = require('../src/controllers/groupController');
const { setDbReady, setMemoryStore } = require('../src/utils/helpers');

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

function createStore() {
  return {
    users: [],
    rideRequests: [],
    matches: [],
    chatMessages: [],
    payments: [],
    groups: [],
    groupMembers: [],
    connectionRequests: []
  };
}

beforeEach(() => {
  setDbReady(false);
  setMemoryStore(createStore());
  setRideIO(null);
  setGroupIO(null);
});

test('new ride searches notify the owner and only compatible marketplace users', async () => {
  const roomEvents = [];
  const globalEvents = [];
  const now = Date.now();
  const store = createStore();
  store.users.push(
    { id: 1, name: 'Compatible rider', email: 'compatible@example.com' },
    { id: 2, name: 'Unrelated rider', email: 'unrelated@example.com' }
  );
  store.rideRequests.push(
    {
      id: 1,
      user_id: 1,
      user_name: 'Compatible rider',
      origin: 'Madina',
      origin_latitude: 5.67,
      origin_longitude: -0.17,
      destination: 'University of Ghana',
      time: new Date(now + 20 * 60 * 1000),
      status: 'pending',
      match_id: null
    },
    {
      id: 2,
      user_id: 2,
      user_name: 'Unrelated rider',
      origin: 'Madina',
      origin_latitude: 5.67,
      origin_longitude: -0.17,
      destination: 'University of Ghana',
      time: new Date(now + 3 * 60 * 60 * 1000),
      status: 'pending',
      match_id: null
    }
  );
  setMemoryStore(store);

  setRideIO({
    to(room) {
      return { emit: (event, payload) => roomEvents.push({ room, event, payload }) };
    },
    emit: (event, payload) => globalEvents.push({ event, payload })
  });

  const response = createResponse();
  await rideController.findRide({
    body: {
      origin: 'Madina',
      destination: 'University of Ghana',
      time: new Date(now + 25 * 60 * 1000).toISOString(),
      userName: 'Searcher',
      userEmail: 'searcher@example.com'
    }
  }, response);

  assert.equal(response.payload.success, true);
  assert.deepEqual(
    roomEvents.map(({ room, event }) => ({ room, event })).sort((first, second) => first.room.localeCompare(second.room)),
    [
      { room: 'user:1', event: 'marketplaceUpdated' },
      { room: 'user:3', event: 'requestCreated' }
    ]
  );
  assert.deepEqual(roomEvents.find(({ event }) => event === 'marketplaceUpdated').payload, { requestId: 3 });
  assert.deepEqual(globalEvents, []);
});

test('public group events do not include member-specific data', async () => {
  const globalEvents = [];
  setGroupIO({ emit: (event, payload) => globalEvents.push({ event, payload }) });
  const store = createStore();
  store.users.push(
    { id: 1, name: 'Creator', email: 'creator@example.com' },
    { id: 2, name: 'Joiner', email: 'joiner@example.com' }
  );
  setMemoryStore(store);

  const scheduleDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groupCreationResponse = createResponse();
  await groupController.createGroup({
    body: {
      userId: 1,
      location: 'University of Ghana',
      origin: 'Madina',
      budget: 100,
      maxMembers: 4,
      scheduleDate,
      time: '10:00 AM',
      joinDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      split_rules: 'equal'
    }
  }, groupCreationResponse);

  const publicCreatedGroup = globalEvents[0].payload.group;
  assert.equal(globalEvents[0].event, 'groupCreated');
  assert.equal(publicCreatedGroup.isMember, false);
  assert.deepEqual(publicCreatedGroup.members, []);
  assert.equal('userId' in globalEvents[0].payload, false);

  const joinResponse = createResponse();
  await groupController.joinGroup({ body: { groupId: 1, userId: 2 } }, joinResponse);

  const publicJoinedEvent = globalEvents[1];
  assert.equal(publicJoinedEvent.event, 'groupJoined');
  assert.equal('userId' in publicJoinedEvent.payload, false);
  assert.equal('membership' in publicJoinedEvent.payload, false);
  assert.equal(publicJoinedEvent.payload.group.isMember, false);
  assert.deepEqual(publicJoinedEvent.payload.group.members, []);
  assert.equal(joinResponse.payload.success, true);
});
