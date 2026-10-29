import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';

export const socket = io(API_BASE_URL, { transports: ['websocket'], autoConnect: false });

let activeUserId = null;

socket.on('connect', () => {
  if (activeUserId) socket.emit('joinUser', activeUserId);
});

export function joinUser(userId) {
  const numericUserId = Number(userId);
  if (!numericUserId) return;
  activeUserId = numericUserId;
  if (socket.connected) socket.emit('joinUser', numericUserId);
  else socket.connect();
}

export function leaveUser(userId) {
  const numericUserId = Number(userId);
  if (!numericUserId || activeUserId !== numericUserId) return;
  if (socket.connected) socket.emit('leaveUser', numericUserId);
  activeUserId = null;
  socket.disconnect();
}

export function joinChatRoom(matchId, rideRequestId, acknowledge) {
  socket.emit('joinChat', { matchId, rideRequestId }, acknowledge);
}

export function sendChatMessage(payload) {
  socket.emit('sendChatMessage', payload);
}

export function markMessageSeen(payload) {
  socket.emit('messageSeen', payload);
}

export function sendTypingStart(matchId, rideRequestId) {
  socket.emit('typing:start', { matchId, rideRequestId });
}

export function sendTypingStop(matchId, rideRequestId) {
  socket.emit('typing:stop', { matchId, rideRequestId });
}

export function onSocket(event, handler) {
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

export function onSocketConnect(handler) {
  socket.on('connect', handler);
  return () => socket.off('connect', handler);
}
