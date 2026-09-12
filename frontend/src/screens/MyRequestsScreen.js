import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { getJson, patchJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import { CheckIcon, ClockIcon, FlagIcon, PinIcon, SearchIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';
import RequestMapView from '../components/RequestMapView';
import { getCurrentLocation } from '../services/currentLocation';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');
const activeStatuses = ['pending', 'matched'];

function statusColor(status) {
  if (status === 'matched') return '#00f2fe';
  if (status === 'completed') return '#7ee787';
  if (status === 'cancelled') return '#ff5e36';
  return '#f5b700';
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
  const [selectedId, setSelectedId] = useState(null);
  const [partners, setPartners] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  const loadRequests = useCallback(async () => {
    const user = await getStoredUser();
    if (!user?.id) return;
    setCurrentUser(user);
    const result = await getJson(`/api/requests?userId=${user.id}&includeHistory=true`);
    setRequests(result.requests || []);
    setSelectedId((current) => current || result.requests?.[0]?._id || null);
  }, []);

  useEffect(() => {
    if (!showMap || currentLocation) return;
    getCurrentLocation().then(setCurrentLocation).catch((locationError) => logError('Load map location', locationError));
  }, [showMap, currentLocation]);

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
    return () => { cleanUpdated(); cleanCreated(); cleanMatched(); };
  }, []);

  const visibleRequests = requests.filter((request) => showHistory
    ? !activeStatuses.includes(request.status)
    : activeStatuses.includes(request.status));
  const selected = visibleRequests.find((request) => Number(request._id) === Number(selectedId)) || visibleRequests[0];
  const partner = selected ? partners[selected._id] : null;

  function handleMapSelect(request) {
    setShowMap(false);
    setShowHistory(false);
    setSelectedId(request._id || request.id);
  }

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

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-2xl self-center py-2">
        <View className="flex-row items-center gap-3 mb-5">
          <View className="w-11 h-11 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center">
            <SearchIcon size={20} color="#00f2fe" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-black text-white">My Requests</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">Track every ride search independently</Text>
          </View>
        </View>

        <View className="flex-row bg-[#0b172a]/95 border border-white/[0.1] rounded-2xl p-1 mb-4">
          {[{ value: false, label: 'Active' }, { value: true, label: 'History' }].map((tab) => (
            <TouchableOpacity key={tab.label} className={`flex-1 py-3 rounded-xl items-center ${showHistory === tab.value ? 'bg-[#00f2fe]' : ''}`} onPress={() => setShowHistory(tab.value)}>
              <Text className={`font-black text-xs uppercase tracking-widest ${showHistory === tab.value ? 'text-[#061426]' : 'text-[#8eb4c6]'}`}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity className={`flex-1 py-3 rounded-2xl items-center border ${!showMap ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-[#0b172a]/95 border-white/[0.12]'}`} onPress={() => setShowMap(false)}>
            <Text className={`font-black text-xs uppercase tracking-widest ${!showMap ? 'text-[#061426]' : 'text-[#8eb4c6]'}`}>List View</Text>
          </TouchableOpacity>
          <TouchableOpacity className={`flex-1 py-3 rounded-2xl items-center border ${showMap ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-[#0b172a]/95 border-white/[0.12]'}`} onPress={() => setShowMap(true)}>
            <Text className={`font-black text-xs uppercase tracking-widest ${showMap ? 'text-[#061426]' : 'text-[#8eb4c6]'}`}>Map View</Text>
          </TouchableOpacity>
        </View>

        {showMap && !showHistory ? (
          <RequestMapView requests={requests.filter((request) => activeStatuses.includes(request.status))} currentLocation={currentLocation} selectedId={selectedId} onSelect={handleMapSelect} />
        ) : null}

        {loading ? <ActivityIndicator color="#00f2fe" size="large" /> : null}
        {error ? <Text className="text-[#ff8c73] text-sm mb-3">{error}</Text> : null}
        {!loading && visibleRequests.length === 0 ? (
          <View className="bg-[#0b172a]/95 border border-white/[0.1] rounded-3xl p-8 items-center">
            <Text className="text-white font-black text-base">No {showHistory ? 'past' : 'active'} requests</Text>
            <Text className="text-[#8eb4c6] text-xs text-center mt-2">Start another search whenever you are ready.</Text>
          </View>
        ) : null}

        {!showMap ? visibleRequests.map((request) => {
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
                  <Text style={{ color }} className="font-black text-[10px] uppercase">{request.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }) : null}

        {selected ? (
          <View className="bg-[#071426]/95 border border-[#00f2fe]/30 rounded-3xl p-5 mt-1">
            <Text className="text-[#00f2fe] text-[10px] font-black uppercase tracking-widest mb-3">Selected request #{selected._id}</Text>
            <View className="flex-row items-center gap-3 mb-3"><PinIcon size={17} color="#00f2fe" /><Text className="text-white font-extrabold flex-1">{originLabel(selected)}</Text></View>
            <View className="flex-row items-center gap-3 mb-3"><FlagIcon size={17} color="#ff5e36" /><Text className="text-white font-extrabold flex-1">{selected.destination}</Text></View>
            <View className="flex-row items-center gap-3"><ClockIcon size={17} color="#8eb4c6" /><Text className="text-[#c9e5f4] text-sm flex-1">{formatTime(selected.time)}</Text></View>
            {selected.status === 'matched' ? (
              <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-2xl p-3 mt-4">
                <Text className="text-[#00f2fe] font-black text-xs">Match found</Text>
                <Text className="text-white text-sm mt-1">{partner?.name || partner?.user_name || 'Your riding partner is ready.'}</Text>
              </View>
            ) : null}
            {!showHistory && selected.status === 'pending' ? (
              <TouchableOpacity className="bg-[#ff5e36] rounded-2xl py-3.5 items-center mt-5" onPress={() => updateStatus('cancelled')} disabled={Boolean(updatingId)}>
                <Text className="text-white font-black">{updatingId ? 'Updating...' : 'Cancel Request'}</Text>
              </TouchableOpacity>
            ) : null}
            {!showHistory && selected.status === 'matched' ? (
              <View className="flex-row gap-3 mt-5">
                <TouchableOpacity className="flex-1 bg-[#00f2fe] rounded-2xl py-3.5 items-center" onPress={() => navigation.navigate('MatchResult', { request: selected, match: { id: selected.matchId } })}>
                  <Text className="text-[#061426] font-black">Open Match</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-white/[0.08] border border-white/[0.15] rounded-2xl py-3.5 items-center" onPress={() => updateStatus('completed')} disabled={Boolean(updatingId)}>
                  <CheckIcon size={15} color="#7ee787" />
                  <Text className="text-[#7ee787] font-black text-xs mt-1">Mark Complete</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}
