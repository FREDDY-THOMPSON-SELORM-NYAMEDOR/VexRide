import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { getJson, patchJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import { CheckIcon, ClockIcon, FlagIcon, PinIcon, SearchIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');
const activeStatuses = ['pending', 'connection_requested', 'partially_grouped', 'grouped'];

function statusColor(status) {
  if (['connection_requested', 'partially_grouped', 'grouped'].includes(status)) return '#00f2fe';
  if (status === 'completed') return '#7ee787';
  if (status === 'cancelled' || status === 'withdrawn') return '#ff5e36';
  return '#f5b700';
}

function statusLabel(status) {
  if (status === 'pending' || status === 'connection_requested') return 'Looking for riders';
  if (status === 'partially_grouped') return 'Some riders joined';
  if (status === 'grouped' || status === 'matched') return 'Group ready';
  if (status === 'withdrawn' || status === 'cancelled') return 'Cancelled';
  if (status === 'completed') return 'Completed';
  return 'Open';
}

function formatTime(value) {
  if (!value) return 'Time not set';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function originLabel(request) {
  if (request?.originLabel) return request.originLabel;
  if (typeof request?.origin === 'string') return request.origin;
  return [request?.origin?.city, request?.origin?.region, request?.origin?.country]
    .filter(Boolean)
    .join(', ') || 'Current area';
}

export default function MyRequestsScreen({ navigation, route }) {
  const [requests, setRequests] = useState([]);
  const [joinedRides, setJoinedRides] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [partners, setPartners] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const loadJoinedRides = useCallback(async (userId) => {
    if (!userId) return;
    const result = await getJson(`/api/connections?userId=${userId}`);
    setJoinedRides((result.connections || []).filter((connection) => Number(connection.requester_id) === Number(userId) && connection.status === 'accepted'));
  }, []);

  const loadRequests = useCallback(async () => {
    const user = await getStoredUser();
    if (!user?.id) return;
    setCurrentUser(user);
    const result = await getJson(`/api/requests?userId=${user.id}&includeHistory=true`);
    setRequests(result.requests || []);
    setSelectedId((current) => current || result.requests?.[0]?._id || null);
    await loadJoinedRides(user.id);
  }, [loadJoinedRides]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadRequests().catch((requestError) => {
      if (active) setError(friendlyError(requestError, 'Could not load your requests.'));
      logError('Load requests', requestError);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadRequests]);

  useEffect(() => {
    const cleanUpdated = onSocket('requestUpdated', (updated) => {
      setRequests((current) => current.map((request) =>
        Number(request._id || request.id) === Number(updated._id || updated.id) ? { ...request, ...updated } : request
      ));
      setJoinedRides((current) => current.map((connection) => Number(connection.ride_request_id) === Number(updated._id || updated.id)
        ? { ...connection, rideRequest: { ...connection.rideRequest, ...updated } }
        : connection));
    });
    const cleanCreated = onSocket('requestCreated', (created) => {
      setRequests((current) => current.some((request) => Number(request._id) === Number(created._id))
        ? current
        : [created, ...current]);
    });
    const cleanMatched = onSocket('matchFound', ({ requestId, matchId, partnerInfo, origin, destination }) => {
      if (!requestId) return;
      setPartners((current) => ({ ...current, [requestId]: partnerInfo }));
      setRequests((current) => current.map((request) => Number(request._id) === Number(requestId)
        ? { ...request, status: 'matched', matchId, origin: origin || request.origin, destination: destination || request.destination }
        : request));
    });
    const cleanGroupMatched = onSocket('groupMatchFound', ({ rideRequestId, request }) => {
      if (!rideRequestId) return;
      setJoinedRides((current) => current.map((connection) => Number(connection.ride_request_id) === Number(rideRequestId)
        ? { ...connection, rideRequest: { ...connection.rideRequest, ...request } }
        : connection));
    });
    return () => { cleanUpdated(); cleanCreated(); cleanMatched(); cleanGroupMatched(); };
  }, []);

  const visibleRequests = requests.filter((request) => request.status !== 'joined').filter((request) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return ['pending', 'connection_requested', 'partially_grouped'].includes(request.status);
    if (statusFilter === 'withdrawn') return ['withdrawn', 'cancelled'].includes(request.status);
    return request.status === statusFilter;
  });
  const selected = visibleRequests.find((request) => Number(request._id) === Number(selectedId)) || visibleRequests[0];
  const partner = selected ? partners[selected._id] : null;

  async function updateStatus(status) {
    if (!selected || !currentUser?.id) return;
    try {
      setUpdatingId(selected._id);
      const result = await patchJson(`/api/requests/${selected._id}`, { status, userId: currentUser.id });
      setRequests((current) => current.map((request) => Number(request._id) === Number(selected._id) ? result.request : request));
    } catch (requestError) {
      Alert.alert('Request update failed', friendlyError(requestError, 'Please try again.'));
      logError('Update request status', requestError);
    } finally {
      setUpdatingId(null);
    }
  }

  async function leaveJoinedRide(connection) {
    if (!connection?.id || !currentUser?.id) return;
    try {
      setUpdatingId(connection.id);
      await patchJson(`/api/connections/${connection.id}`, { userId: currentUser.id, status: 'cancelled' });
      setJoinedRides((current) => current.filter((entry) => Number(entry.id) !== Number(connection.id)));
      Alert.alert('Ride group left', 'You have been removed from this ride group and can join another one.');
    } catch (requestError) {
      Alert.alert('Leave group failed', friendlyError(requestError, 'Could not leave this group right now.'));
      logError('Leave joined ride', requestError);
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
            <Text className="text-2xl font-black text-white">My Requests</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">See who has joined and manage each request.</Text>
          </View>
        </View>

        <View className="flex-row flex-wrap bg-[#0b172a]/95 border border-white/[0.1] rounded-2xl p-1 mb-4">
          {[{ value: 'all', label: 'All' }, { value: 'pending', label: 'Looking' }, { value: 'grouped', label: 'Group ready' }, { value: 'completed', label: 'Completed' }, { value: 'withdrawn', label: 'Cancelled' }].map((tab) => (
            <TouchableOpacity key={tab.label} className={`flex-1 min-w-[19%] py-3 rounded-xl items-center ${statusFilter === tab.value ? 'bg-[#00f2fe]' : ''}`} onPress={() => setStatusFilter(tab.value)}>
              <Text className={`font-black text-[10px] uppercase tracking-widest ${statusFilter === tab.value ? 'text-[#061426]' : 'text-[#8eb4c6]'}`}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color="#00f2fe" size="large" /> : null}
        {error ? <Text className="text-[#ff8c73] text-sm mb-3">{error}</Text> : null}
        {!loading && visibleRequests.length === 0 ? (
          <View className="bg-[#0b172a]/95 border border-white/[0.1] rounded-3xl p-8 items-center">
            <Text className="text-white font-black text-base">No requests here yet</Text>
            <Text className="text-[#8eb4c6] text-xs text-center mt-2">Create a ride request whenever you are ready.</Text>
          </View>
        ) : null}

        {visibleRequests.map((request) => {
          const selectedRequest = Number(selected?._id) === Number(request._id);
          const color = statusColor(request.status);
          return (
            <TouchableOpacity key={request._id} onPress={() => setSelectedId(request._id)} className={`bg-[#0b172a]/95 rounded-2xl p-4 mb-3 border ${selectedRequest ? 'border-[#00f2fe]' : 'border-white/[0.1]'}`}>
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-white font-black text-sm" numberOfLines={1}>{originLabel(request)} to {request.destination}</Text>
                  <Text className="text-[#8eb4c6] text-xs mt-1">{formatTime(request.time)}</Text>
                </View>
                <View style={{ backgroundColor: `${color}25`, borderColor: `${color}80` }} className="px-3 py-1.5 rounded-full border">
                  <Text style={{ color }} className="font-black text-[10px]">{statusLabel(request.status)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {selected ? (
          <View className="bg-[#071426]/95 border border-[#00f2fe]/30 rounded-3xl p-5 mt-1">
            <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">Request details</Text>
            <View className="flex-row items-center gap-3 mb-3"><PinIcon size={17} color="#00f2fe" /><Text className="text-white font-extrabold flex-1">{originLabel(selected)}</Text></View>
            <View className="flex-row items-center gap-3 mb-3"><FlagIcon size={17} color="#ff5e36" /><Text className="text-white font-extrabold flex-1">{selected.destination}</Text></View>
            <View className="flex-row items-center gap-3"><ClockIcon size={17} color="#8eb4c6" /><Text className="text-[#c9e5f4] text-sm flex-1">{formatTime(selected.time)}</Text></View>
            {['connection_requested', 'partially_grouped', 'grouped', 'matched'].includes(selected.status) ? (
              <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-2xl p-3 mt-4">
                <Text className="text-[#00f2fe] font-black text-xs">{statusLabel(selected.status)}</Text>
                <Text className="text-white text-sm mt-1">{selected.status === 'grouped' ? 'You are no longer looking for riders.' : 'You can keep looking for more riders.'}</Text>
              </View>
            ) : null}
            {statusFilter !== 'completed' && statusFilter !== 'withdrawn' && ['pending', 'connection_requested', 'partially_grouped'].includes(selected.status) ? (
              <View className="flex-row gap-3 mt-5">
                <TouchableOpacity className="flex-1 bg-[#00f2fe] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('grouped')} disabled={Boolean(updatingId)}>
                  <Text className="text-[#061426] font-black">{updatingId ? 'Saving...' : 'Finish finding riders'}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-[#ff5e36] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('withdrawn')} disabled={Boolean(updatingId)}>
                  <Text className="text-white font-black">Cancel request</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {['partially_grouped', 'grouped', 'matched'].includes(selected.status) ? (
              <View className="mt-5 space-y-3">
                <TouchableOpacity
                  className="bg-[#00f2fe] rounded-2xl py-3.5 items-center"
                  onPress={() => navigation.navigate('Chat', { rideRequestId: selected._id, request: selected, counterParty: partner || null })}
                >
                  <Text className="text-[#061426] font-black">Open group chat</Text>
                </TouchableOpacity>
                {['grouped', 'matched'].includes(selected.status) ? (
                  <TouchableOpacity
                    className="bg-white/[0.08] border border-white/[0.15] rounded-2xl py-3.5 items-center"
                    onPress={() => navigation.navigate('MatchResult', { groupRequestId: selected._id, matchId: selected.matchId, request: selected })}
                  >
                    <Text className="text-white font-black">Coordinate group</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {statusFilter !== 'completed' && selected.status === 'matched' ? (
              <View className="mt-5">
                <TouchableOpacity className="bg-white/[0.08] border border-white/[0.15] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('completed')} disabled={Boolean(updatingId)}>
                  <CheckIcon size={15} color="#7ee787" />
                  <Text className="text-[#7ee787] font-black text-xs mt-1">Mark Complete</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {joinedRides.length ? (
          <View className="bg-[#071426]/95 border border-[#00f2fe]/30 rounded-3xl p-5 mt-4">
            <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">Joined rides</Text>
            {joinedRides.map((connection) => (
              <View key={connection.id} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3 mb-3">
                <Text className="text-white font-black text-sm">{connection.rideRequest?.destination || 'Ride request'}</Text>
                <Text className="text-[#8eb4c6] text-xs mt-1">{formatTime(connection.rideRequest?.time)}</Text>
                <View className="flex-row gap-3 mt-3">
                  <TouchableOpacity className="flex-1 bg-[#00f2fe] rounded-xl py-2.5 items-center" onPress={() => navigation.navigate('Chat', { rideRequestId: connection.ride_request_id, matchId: connection.match_id, request: connection.rideRequest, counterParty: connection.recipient })}>
                    <Text className="text-[#061426] font-black text-xs">Open chat</Text>
                  </TouchableOpacity>
                  {['grouped', 'matched'].includes(connection.rideRequest?.status) ? (
                    <TouchableOpacity
                      className="flex-1 bg-white/[0.08] border border-white/[0.15] rounded-xl py-2.5 items-center"
                      onPress={() => navigation.navigate('MatchResult', { groupRequestId: connection.ride_request_id, matchId: connection.match_id, request: connection.rideRequest })}
                    >
                      <Text className="text-white font-black text-xs">Coordinate</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity className="flex-1 bg-[#ff5e36]/15 border border-[#ff5e36]/50 rounded-xl py-2.5 items-center" onPress={() => leaveJoinedRide(connection)} disabled={Boolean(updatingId)}>
                    <Text className="text-[#ff9b83] font-black text-xs">{updatingId === connection.id ? 'Leaving...' : 'Leave group'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}
