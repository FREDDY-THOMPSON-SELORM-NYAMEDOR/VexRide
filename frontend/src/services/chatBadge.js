import { useEffect, useState } from 'react';

let unreadCount = 0;
let activeChatMatchId = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(unreadCount));
}

export function getUnreadCount() {
  return unreadCount;
}

export function incrementUnread() {
  unreadCount += 1;
  notify();
}

export function resetUnread() {
  if (unreadCount === 0) return;
  unreadCount = 0;
  notify();
}

export function setUnreadCount(count) {
  unreadCount = Math.max(0, Number(count) || 0);
  notify();
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
