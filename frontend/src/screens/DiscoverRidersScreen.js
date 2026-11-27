import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import ScreenLayout from '../components/ScreenLayout';
import { getJson, postJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import { clearSearchSession } from '../services/searchSession';
import { FlagIcon, PinIcon, SearchIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

function formatTime(value) {
  if (!value) return 'Time not set';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function originLabel(request) {
  return request?.originLabel || request?.origin?.city || request?.origin?.region || 'Current area';
}

export default function DiscoverRidersScreen({ navigation, route }) {
  const [request, setRequest] = useState(route?.params?.request || null);
  const [riders, setRiders] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState(null);
  const [error, setError] = useState('');

  const loadMarketplace = useCallback(async () => {
    const storedUser = await getStoredUser();
    if (!storedUser?.id) return;
    setUser(storedUser);
    let activeRequest = request;
    if (!activeRequest?._id && !activeRequest?.id) {
      const requestResult = await getJson(`/api/requests?userId=${storedUser.id}`);
      activeRequest = (requestResult.requests || []).find((entry) =>
        ['pending', 'connection_requested', 'partially_grouped'].includes(entry.status)
      );
      if (activeRequest) setRequest(activeRequest);
    }
    const requestId = activeRequest?._id || activeRequest?.id;
    if (!requestId) {
      setRiders([]);
      return;
    }
    const result = await getJson(`/api/marketplace?userId=${storedUser.id}&requestId=${requestId}`);
    setRiders(result.requests || []);
  }, [request?._id, request?.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadMarketplace().catch((loadError) => {
      if (active) setError(friendlyError(loadError, 'Could not load nearby ride requests.'));
      logError('Load marketplace', loadError);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadMarketplace]);

  useEffect(() => onSocket('marketplaceUpdated', () => {
    loadMarketplace().catch((loadError) => {
      setError(friendlyError(loadError, 'Could not refresh nearby ride requests.'));
      logError('Refresh marketplace', loadError);
    });
  }), [loadMarketplace]);

  useEffect(() => {
    const applyResponse = (status) => (connection) => {
      if (Number(connection.requester_id) !== Number(user?.id)) return;
      setRiders((current) => current.map((rider) => Number(rider.id) === Number(connection.ride_request_id)
        ? { ...rider, connectionStatus: status }
        : rider));
    };
    const cleanAccepted = onSocket('connectionAccepted', async (connection) => {
      if (Number(connection.requester_id) !== Number(user?.id)) return;
      await clearSearchSession();
      applyResponse('accepted')(connection);
      navigation.navigate('MyRequests');
    });
    const cleanDeclined = onSocket('connectionDeclined', applyResponse('declined'));
    return () => { cleanAccepted(); cleanDeclined(); };
  }, [navigation, user?.id]);

  function refreshMarketplace() {
    loadMarketplace().catch((loadError) => {
      setError(friendlyError(loadError, 'Could not refresh nearby ride requests.'));
      logError('Refresh marketplace', loadError);
    });
  }

  async function submitConnectionRequest(targetRequestId, rider, joiningWith, visitedRequestIds) {
    const sourceRequestId = request?._id || request?.id;
    if (!user?.id || !targetRequestId || !rider?.id || !sourceRequestId) return;
    try {
      setConnectingId(rider.id);
      await postJson('/api/connections', {
        requestId: targetRequestId,
        sourceRequestId,
        userId: user.id,
        ...(joiningWith ? { message: `I would like to join this ride with ${joiningWith}.` } : {})
      });
      setRiders((current) => current.map((entry) => Number(entry.id) === Number(targetRequestId)
        ? { ...entry, connectionStatus: 'sent' }
        : entry));
      if (joiningWith) refreshMarketplace();
    } catch (connectError) {
      if (connectError.code === 'OWNER_HAS_ACTIVE_RIDE' && connectError.activeRide) {
        const activeRide = connectError.activeRide;
        const nextRequestId = Number(activeRide.requestId);
        const loopsToPreviousRide = visitedRequestIds.has(nextRequestId);
        const canJoin = activeRide.canJoin && !loopsToPreviousRide;
        const rideStatus = activeRide.connectionStatus === 'accepted'
          ? 'is riding with'
          : 'has requested to join';
        const message = loopsToPreviousRide
          ? 'These riders have overlapping requests that cannot be joined together right now. Choose another available request.'
          : canJoin
            ? `${activeRide.joiningUserName} ${rideStatus} ${activeRide.rideOwnerName} on a ride to ${activeRide.destination} at ${formatTime(activeRide.time)}. You can ask that ride owner to approve your request separately.`
            : `${activeRide.joiningUserName} is requesting to join another ride, but that ride is not available for your departure time. Choose another available request.`;
        const buttons = [{
          text: 'Choose another request',
          style: 'cancel',
          onPress: refreshMarketplace
        }];
        if (canJoin) {
          buttons.push({
            text: 'Request to join with them',
            onPress: () => {
              const nextVisitedRequestIds = new Set(visitedRequestIds);
              nextVisitedRequestIds.add(Number(targetRequestId));
              void submitConnectionRequest(nextRequestId, rider, activeRide.joiningUserName, nextVisitedRequestIds);
            }
          });
        }
        Alert.alert('This rider is joining another ride', message, buttons);
        return;
      }
      Alert.alert('Connection request', friendlyError(connectError, 'Could not send the invitation.'));
      logError('Send connection request', connectError);
    } finally {
      setConnectingId(null);
    }
  }

  async function connect(rider) {
    if (!user?.id || !rider?.id) return;
    await submitConnectionRequest(Number(rider.id), rider, null, new Set([Number(rider.id)]));
  }

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-2xl self-center py-2">
        <View className="flex-row items-center gap-3 mb-5">
          <View className="w-11 h-11 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center">
            <SearchIcon size={20} color="#00f2fe" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-black text-white">Your ride match</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">See who’s heading your way and ask to ride together.</Text>
          </View>
        </View>

        <View className="bg-[#0b172a]/95 border border-[#00f2fe]/30 rounded-3xl p-5 mb-5">
          <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">My Request</Text>
          <View className="flex-row items-center gap-3 mb-3"><PinIcon size={17} color="#00f2fe" /><Text className="text-white font-extrabold flex-1">{originLabel(request)}</Text></View>
          <View className="flex-row items-center gap-3 mb-3"><FlagIcon size={17} color="#ff5e36" /><Text className="text-white font-extrabold flex-1">{request?.destination || 'Destination not set'}</Text></View>
          <Text className="text-[#c9e5f4] text-sm ml-7">{formatTime(request?.time)}</Text>
        </View>

          <Text className="text-white text-lg font-black mb-3">Nearby ride requests</Text>
        {loading ? <ActivityIndicator color="#00f2fe" size="large" /> : null}
        {error ? <Text className="text-[#ff8c73] text-sm mb-3">{error}</Text> : null}
        {!loading && riders.length === 0 ? <Text className="text-[#8eb4c6] text-sm">No similar rides yet. Check back soon.</Text> : null}
        {riders.map((rider) => (
          <View key={rider.id} className="bg-[#0b172a]/95 border border-white/[0.1] rounded-3xl p-5 mb-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-white text-base font-black">{rider.userName || 'VEX rider'}</Text>
                <Text className="text-[#c9e5f4] text-sm mt-2">{originLabel(rider)} to {rider.destination}</Text>
                <Text className="text-[#8eb4c6] text-xs mt-1">{formatTime(rider.time)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[#7ee787] text-lg font-black">{rider.compatibility}%</Text>
                <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Route fit</Text>
              </View>
            </View>
            <View className="flex-row items-center justify-between mt-4 pt-3 border-t border-white/[0.08]">
              <Text className="text-[#c9e5f4] text-xs">{rider.groupSize || 1} rider{rider.groupSize === 1 ? '' : 's'}{rider.verified ? ' · Verified' : ''}</Text>
              <TouchableOpacity className={`px-5 py-2.5 rounded-xl ${rider.connectionStatus === 'accepted' ? 'bg-[#7ee787]/20' : rider.connectionStatus === 'sent' ? 'bg-white/[0.08]' : 'bg-[#ff5e36]'}`} onPress={() => connect(rider)} disabled={Boolean(connectingId) || ['sent', 'accepted'].includes(rider.connectionStatus)}>
                <Text className="text-white font-black text-xs">{connectingId === rider.id ? 'Sending...' : rider.connectionStatus === 'sent' ? 'Request sent' : rider.connectionStatus === 'accepted' ? 'Accepted' : rider.connectionStatus === 'declined' ? 'Try again' : 'Ask to join'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScreenLayout>
  );
}
