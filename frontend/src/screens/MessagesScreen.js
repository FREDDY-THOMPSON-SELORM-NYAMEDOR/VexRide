import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import ScreenLayout from '../components/ScreenLayout';
import ChatUnreadBadge from '../components/ChatUnreadBadge';
import { ChatIcon } from '../components/Icons';
import { getJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

export default function MessagesScreen({ navigation, route }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadThreads = useCallback(async () => {
    const user = await getStoredUser();
    if (!user?.id) {
      setThreads([]);
      return;
    }

    const [requestResult, connectionResult] = await Promise.all([
      getJson(`/api/requests?userId=${user.id}&includeHistory=true`),
      getJson(`/api/connections?userId=${user.id}`)
    ]);
    const conversationById = new Map();
    const groupRequestIds = new Set();

    (connectionResult.connections || [])
      .filter((connection) => connection.status === 'accepted')
      .forEach((connection) => {
        const requestId = Number(connection.ride_request_id);
        if (!requestId) return;
        groupRequestIds.add(requestId);
        conversationById.set(`request:${requestId}`, {
          id: requestId,
          roomId: `request:${requestId}`,
          rideRequestId: requestId,
          matchId: connection.match_id || connection.rideRequest?.matchId,
          title: connection.rideRequest?.destination || 'Shared ride',
          subtitle: 'Group conversation',
          request: connection.rideRequest
        });
      });

    (requestResult.requests || []).forEach((request) => {
      const requestId = Number(request.id || request._id);
      if (!requestId || !request.matchId || request.status !== 'matched') return;
      if (groupRequestIds.has(requestId)) return;
      conversationById.set(`match:${request.matchId}`, {
        id: request.matchId,
        roomId: `match:${request.matchId}`,
        matchId: request.matchId,
        title: request.destination || 'Ride match',
        subtitle: 'Ride conversation',
        request
      });
    });

    setThreads(Array.from(conversationById.values()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadThreads()
      .catch((loadError) => {
        if (active) setError(friendlyError(loadError, 'Could not load your conversations.'));
        logError('Load message inbox', loadError);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadThreads]);

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-2xl self-center py-2">
        <View className="flex-row items-center gap-3 mb-5">
          <View className="w-11 h-11 rounded-2xl bg-[#ff5e36]/15 border border-[#ff5e36]/40 items-center justify-center">
            <ChatIcon size={20} color="#ff5e36" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-black text-white">Messages</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">Pick up where your ride conversations left off.</Text>
          </View>
        </View>

        {loading ? <ActivityIndicator color="#00f2fe" size="large" /> : null}
        {error ? <Text className="text-[#ff8c73] text-sm mb-3">{error}</Text> : null}
        {!loading && !error && threads.length === 0 ? (
          <View className="bg-[#0b172a]/95 border border-white/[0.1] rounded-3xl p-8 items-center">
            <Text className="text-white font-black text-base">No ride conversations yet</Text>
            <Text className="text-[#8eb4c6] text-xs text-center mt-2">Your chats will show up here when you connect with other riders.</Text>
          </View>
        ) : null}

        {threads.map((thread) => (
          <TouchableOpacity
            key={thread.roomId}
            accessibilityRole="button"
            className="min-h-[72px] bg-[#0b172a]/95 border border-white/[0.1] rounded-2xl p-4 mb-3 flex-row items-center gap-3"
            onPress={() => navigation.navigate('Chat', {
              matchId: thread.matchId,
              rideRequestId: thread.rideRequestId,
              request: thread.request
            })}
          >
            <View className="w-11 h-11 rounded-2xl bg-[#00f2fe]/10 border border-[#00f2fe]/25 items-center justify-center">
              <ChatIcon size={19} color="#00f2fe" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-black text-sm" numberOfLines={1}>{thread.title}</Text>
              <Text className="text-[#8eb4c6] text-xs mt-1">{thread.subtitle}</Text>
            </View>
            <ChatUnreadBadge roomId={thread.roomId} />
            <Text className="text-[#00f2fe] text-2xl font-black">›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScreenLayout>
  );
}
