import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { getJson, patchJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import { ClockIcon, FlagIcon, PinIcon, SearchIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');
const activeStatuses = ['pending', 'connection_requested', 'partially_grouped', 'grouped'];
const previousStatuses = ['completed', 'cancelled', 'withdrawn'];

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
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [previousVisible, setPreviousVisible] = useState(false);
  const [partners, setPartners] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
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

  const visibleRequests = requests.filter((request) => activeStatuses.includes(request.status));
  const previousRequests = requests.filter((request) => previousStatuses.includes(request.status));
  const visibleJoinedRides = joinedRides.filter((connection) => activeStatuses.includes(connection.rideRequest?.status));

  async function updateStatus(status) {
    if (!selectedRequest || !currentUser?.id) return;
    try {
      setUpdatingId(selectedRequest._id);
      const result = await patchJson(`/api/requests/${selectedRequest._id}`, { status, userId: currentUser.id });
      setRequests((current) => current.map((request) => Number(request._id) === Number(selectedRequest._id) ? result.request : request));
      setSelectedRequest(null);
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
            <Text className="text-[#8eb4c6] text-xs mt-1">Only requests still looking for riders appear here.</Text>
          </View>
          <TouchableOpacity className="border border-white/[0.15] bg-white/[0.06] rounded-xl px-3 py-2" onPress={() => setPreviousVisible(true)}>
            <Text className="text-[#c9e5f4] font-black text-[10px] uppercase">Previous</Text>
          </TouchableOpacity>
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
          const color = statusColor(request.status);
          return (
            <TouchableOpacity key={request._id} onPress={() => setSelectedRequest(request)} className="bg-[#0b172a]/95 rounded-2xl p-4 mb-3 border border-white/[0.1]">
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

        {selectedRequest ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedRequest(null)}>
            <View className="flex-1 bg-[#050c1a]/80 items-center justify-center px-5">
              <View className="w-full max-w-md bg-[#071426] border border-[#00f2fe]/30 rounded-3xl p-5">
                <View className="flex-row items-center justify-between mb-4">
            <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">Request details</Text>
                  <TouchableOpacity onPress={() => setSelectedRequest(null)}><Text className="text-[#8eb4c6] font-black">Close</Text></TouchableOpacity>
                </View>
            <View className="flex-row items-center gap-3 mb-3"><PinIcon size={17} color="#00f2fe" /><Text className="text-white font-extrabold flex-1">{originLabel(selectedRequest)}</Text></View>
            <View className="flex-row items-center gap-3 mb-3"><FlagIcon size={17} color="#ff5e36" /><Text className="text-white font-extrabold flex-1">{selectedRequest.destination}</Text></View>
            <View className="flex-row items-center gap-3"><ClockIcon size={17} color="#8eb4c6" /><Text className="text-[#c9e5f4] text-sm flex-1">{formatTime(selectedRequest.time)}</Text></View>
            {['connection_requested', 'partially_grouped', 'grouped'].includes(selectedRequest.status) ? (
              <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-2xl p-3 mt-4">
                <Text className="text-[#00f2fe] font-black text-xs">{statusLabel(selectedRequest.status)}</Text>
                <Text className="text-white text-sm mt-1">{selectedRequest.status === 'grouped' ? 'You are no longer looking for riders.' : 'You can keep looking for more riders.'}</Text>
              </View>
            ) : null}
            {['pending', 'connection_requested', 'partially_grouped'].includes(selectedRequest.status) ? (
              <View className="flex-row gap-3 mt-5">
                <TouchableOpacity className="flex-1 bg-[#00f2fe] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('grouped')} disabled={Boolean(updatingId)}>
                  <Text className="text-[#061426] font-black">{updatingId ? 'Saving...' : 'Finish finding riders'}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-[#ff5e36] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('withdrawn')} disabled={Boolean(updatingId)}>
                  <Text className="text-white font-black">Cancel request</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {['partially_grouped', 'grouped'].includes(selectedRequest.status) ? (
              <View className="mt-5 space-y-3">
                <TouchableOpacity
                  className="bg-[#00f2fe] rounded-2xl py-3.5 items-center"
                  onPress={() => { setSelectedRequest(null); navigation.navigate('Chat', { rideRequestId: selectedRequest._id, request: selectedRequest, counterParty: partners[selectedRequest._id] || null }); }}
                >
                  <Text className="text-[#061426] font-black">Open group chat</Text>
                </TouchableOpacity>
                {selectedRequest.status === 'grouped' ? (
                  <TouchableOpacity
                    className="bg-white/[0.08] border border-white/[0.15] rounded-2xl py-3.5 items-center"
                    onPress={() => { setSelectedRequest(null); navigation.navigate('MatchResult', { groupRequestId: selectedRequest._id, matchId: selectedRequest.matchId, request: selectedRequest }); }}
                  >
                    <Text className="text-white font-black">Coordinate group</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
                <TouchableOpacity className="mt-4 border border-white/[0.15] rounded-2xl py-3 items-center" onPress={() => setSelectedRequest(null)}><Text className="text-[#8eb4c6] font-black">Done</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : null}

        <Modal visible={previousVisible} transparent animationType="fade" onRequestClose={() => setPreviousVisible(false)}>
          <View className="flex-1 bg-[#050c1a]/80 items-center justify-center px-5">
            <View className="w-full max-w-sm bg-[#071426] border border-white/[0.15] rounded-2xl p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-white font-black text-base">Previous records</Text>
                <TouchableOpacity onPress={() => setPreviousVisible(false)}><Text className="text-[#8eb4c6] font-black">Close</Text></TouchableOpacity>
              </View>
              {previousRequests.length ? previousRequests.map((request) => (
                <TouchableOpacity key={request._id} className="border-t border-white/[0.08] py-3" onPress={() => { setPreviousVisible(false); setSelectedRequest(request); }}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-white font-bold flex-1" numberOfLines={1}>{originLabel(request)} to {request.destination}</Text>
                    <Text className="text-[#8eb4c6] text-[10px]">{statusLabel(request.status)}</Text>
                  </View>
                  <Text className="text-[#8eb4c6] text-[10px] mt-1">{formatTime(request.time)}</Text>
                </TouchableOpacity>
              )) : <Text className="text-[#8eb4c6] text-sm py-3">No previous requests.</Text>}
            </View>
          </View>
        </Modal>

        {visibleJoinedRides.length ? (
          <View className="bg-[#071426]/95 border border-[#00f2fe]/30 rounded-3xl p-5 mt-4">
            <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">Joined rides</Text>
            {visibleJoinedRides.map((connection) => (
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
