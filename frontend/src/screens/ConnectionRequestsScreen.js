import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import ScreenLayout from '../components/ScreenLayout';
import { getJson, patchJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import { friendlyError, logError } from '../services/errorHandling';
import { SearchIcon, PinIcon, FlagIcon, ClockIcon } from '../components/Icons';

const heroImage = require('../../assets/images/vex_home_bg_1784946351687.jpg');

function formatTime(value) {
  if (!value) return 'Time not set';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function originLabel(request) {
  return request?.originLabel || request?.origin?.city || request?.origin?.region || 'Current area';
}

function addOrReplaceRequest(current, incoming) {
  return [incoming, ...current.filter((entry) => Number(entry.id) !== Number(incoming.id))];
}

export default function ConnectionRequestsScreen({ navigation, route }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    const user = await getStoredUser();
    if (!user?.id) return;
    const result = await getJson(`/api/connections?userId=${user.id}`);
    setRequests((result.connections || []).filter((entry) => Number(entry.recipient_id) === Number(user.id) && entry.status === 'sent'));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadRequests().catch((loadError) => {
      if (active) setError(friendlyError(loadError, 'Could not load ride requests.'));
      logError('Load ride requests', loadError);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadRequests]);

  useEffect(() => {
    const cleanRequest = onSocket('connectionRequested', (incoming) => {
      setRequests((current) => addOrReplaceRequest(current, {
        id: incoming.connectionId,
        ride_request_id: incoming.requestId,
        requester_id: incoming.requesterId,
        recipient_id: incoming.rideRequest?.userId,
        status: 'sent',
        message: incoming.message,
        requester: incoming.requester,
        rideRequest: incoming.rideRequest
      }));
    });
    const removeHandledRequest = (connection) => {
      setRequests((current) => current.filter((entry) => Number(entry.id) !== Number(connection.id)));
    };
    const cleanAccepted = onSocket('connectionAccepted', removeHandledRequest);
    const cleanDeclined = onSocket('connectionDeclined', removeHandledRequest);
    return () => { cleanRequest(); cleanAccepted(); cleanDeclined(); };
  }, []);

  async function respondToRequest(connection, status) {
    try {
      setUpdatingId(connection.id);
      const user = await getStoredUser();
      await patchJson(`/api/connections/${connection.id}`, { userId: user.id, status });
      setRequests((current) => current.filter((entry) => Number(entry.id) !== Number(connection.id)));
    } catch (requestError) {
      Alert.alert('Ride request', friendlyError(requestError, 'Could not update this request.'));
      logError('Update rider request', requestError);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-2xl self-center py-2">
        <View className="flex-row items-center gap-3 mb-5">
          <View className="w-11 h-11 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center">
            <SearchIcon size={20} color="#00f2fe" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-black text-white">Requests to join your ride</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">Review each rider before you decide.</Text>
          </View>
        </View>

        {loading ? <ActivityIndicator color="#00f2fe" size="large" /> : null}
        {error ? <Text className="text-[#ff8c73] text-sm mb-3">{error}</Text> : null}
        {!loading && requests.length === 0 ? (
          <View className="bg-[#0b172a]/95 border border-white/[0.1] rounded-3xl p-8 items-center">
            <Text className="text-white font-black text-base">No one has asked to join yet</Text>
            <Text className="text-[#8eb4c6] text-xs text-center mt-2">New requests will show up here.</Text>
          </View>
        ) : null}

        {requests.map((connection) => {
          const requester = connection.requester || {};
          const rideRequest = connection.rideRequest || {};
          const initials = (requester.name || 'R').charAt(0).toUpperCase();
          const updating = updatingId === connection.id;
          return (
            <View key={connection.id} className="bg-[#0b172a]/95 border border-[#00f2fe]/25 rounded-3xl p-5 mb-3">
              <View className="flex-row items-center gap-3 mb-4">
                <View className="w-12 h-12 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 items-center justify-center">
                  <Text className="text-[#00f2fe] text-xl font-black">{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white text-base font-black">{requester.name || 'VEX rider'}</Text>
                  <Text className="text-[#8eb4c6] text-xs mt-1">{requester.verified ? 'Verified rider' : 'Rider'}{requester.rating ? `  |  ${requester.rating} rating` : ''}</Text>
                </View>
              </View>
              <Text className="text-white text-sm font-extrabold mb-3">Would you like to ride with {requester.name || 'this person'}?</Text>
              <View className="flex-row items-center gap-3 mb-2"><PinIcon size={16} color="#00f2fe" /><Text className="text-[#c9e5f4] text-sm flex-1">{originLabel(rideRequest)}</Text></View>
              <View className="flex-row items-center gap-3 mb-2"><FlagIcon size={16} color="#ff5e36" /><Text className="text-[#c9e5f4] text-sm flex-1">{rideRequest.destination || 'Destination not set'}</Text></View>
              <View className="flex-row items-center gap-3"><ClockIcon size={16} color="#8eb4c6" /><Text className="text-[#c9e5f4] text-sm flex-1">{formatTime(rideRequest.time)}</Text></View>
              {connection.message ? <Text className="text-[#8eb4c6] text-xs italic mt-3">“{connection.message}”</Text> : null}
              <View className="flex-row gap-3 mt-5">
                <TouchableOpacity className="flex-1 bg-white/[0.08] border border-white/[0.15] rounded-2xl py-3.5 items-center" onPress={() => respondToRequest(connection, 'declined')} disabled={updating}>
                  <Text className="text-[#ff8c73] font-black">{updating ? 'Saving...' : 'Decline'}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-[#00f2fe] rounded-2xl py-3.5 items-center" onPress={() => respondToRequest(connection, 'accepted')} disabled={updating}>
                  <Text className="text-[#061426] font-black">Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </ScreenLayout>
  );
}
