import { useEffect, useState } from 'react';

let unreadCount = 0;
const unreadByRoom = {};
let activeChatMatchId = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(unreadCount));
}

export function getUnreadCount() {
  return unreadCount;
}

export function getChatRoomId(matchId, rideRequestId) {
  return rideRequestId ? `request:${rideRequestId}` : matchId ? `match:${matchId}` : null;
}

export function incrementUnread(roomId) {
  unreadCount += 1;
  if (roomId) unreadByRoom[roomId] = (unreadByRoom[roomId] || 0) + 1;
  notify();
}

export function resetUnread(roomId) {
  if (roomId) {
    unreadCount = Math.max(0, unreadCount - (unreadByRoom[roomId] || 0));
    delete unreadByRoom[roomId];
  } else {
    unreadCount = 0;
    Object.keys(unreadByRoom).forEach((key) => delete unreadByRoom[key]);
  }
  notify();
}

export function setUnreadCount(count) {
  unreadCount = Math.max(0, Number(count) || 0);
  Object.keys(unreadByRoom).forEach((key) => delete unreadByRoom[key]);
  notify();
}

export function setUnreadState(count, byRoom = {}) {
  unreadCount = Math.max(0, Number(count) || 0);
  Object.keys(unreadByRoom).forEach((key) => delete unreadByRoom[key]);
  Object.entries(byRoom || {}).forEach(([roomId, roomCount]) => {
    if (Number(roomCount) > 0) unreadByRoom[roomId] = Number(roomCount);
  });
  notify();
}

export function getRoomUnreadCount(roomId) {
  return roomId ? unreadByRoom[roomId] || 0 : 0;
}

export function setActiveChatMatchId(matchId) {
  activeChatMatchId = matchId == null ? null : String(matchId);
}

export function isActiveChatMatch(matchId) {
  return activeChatMatchId !== null && activeChatMatchId === String(matchId);
}

export function useUnreadCount() {
  const [count, setCount] = useState(unreadCount);

  useEffect(() => {
    listeners.add(setCount);
    return () => listeners.delete(setCount);
  }, []);

  return count;
}

export function useRoomUnreadCount(roomId) {
  const [count, setCount] = useState(getRoomUnreadCount(roomId));

  useEffect(() => {
    const update = () => setCount(getRoomUnreadCount(roomId));
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }, [roomId]);

  return count;
}
