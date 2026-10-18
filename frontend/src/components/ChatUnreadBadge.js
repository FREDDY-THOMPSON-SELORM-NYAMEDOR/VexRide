import React from 'react';
import { View, Text } from 'react-native';
import { useRoomUnreadCount, useUnreadCount } from '../services/chatBadge';

export default function ChatUnreadBadge({ roomId }) {
  const globalUnreadCount = useUnreadCount();
  const roomUnreadCount = useRoomUnreadCount(roomId);
  const unreadCount = roomId ? roomUnreadCount : globalUnreadCount;
  if (!unreadCount) return null;

  return (
    <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#00f2fe] border border-[#8fffff] items-center justify-center shadow-lg shadow-[#00f2fe]/80">
      <Text className="text-[#061426] text-[10px] font-black">{unreadCount > 99 ? '99+' : unreadCount}</Text>
    </View>
  );
}
