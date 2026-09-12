import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { getJson, postJson } from '../services/api';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import LiveLocationMap from '../components/LiveLocationMap';
import { ZapIcon, PinIcon, FlagIcon, ClockIcon, ChatIcon, CheckIcon } from '../components/Icons';
import { getStoredUser } from '../services/user';
import { clearSearchSession, saveSearchSession } from '../services/searchSession';
import ChatUnreadBadge from '../components/ChatUnreadBadge';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');
const SEARCH_TIMEOUT_SECONDS = 120;

function locationLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.label) return value.label;
  return [value.city, value.region, value.country].filter(Boolean).join(', ') || 'Current area';
}

export default function MatchResultScreen({ navigation, route }) {
  const { origin, destination, time, match, request } = route.params || {};
  const [currentMatch, setCurrentMatch] = useState(match);
  const [status, setStatus] = useState(match ? 'Match ready' : 'Searching for a rider nearby...');
  const [activeRequest, setActiveRequest] = useState(request);
  const [counterParty, setCounterParty] = useState(match?.counterParty || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(SEARCH_TIMEOUT_SECONDS);
  const [searching, setSearching] = useState(!match);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);

  function clearSearchTimers() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timeoutRef.current = null;
    countdownRef.current = null;
  }

  function startSearchTimers() {
    clearSearchTimers();
    setSearchTimeout(false);
    setSearching(true);
    setSecondsRemaining(SEARCH_TIMEOUT_SECONDS);
    countdownRef.current = setInterval(() => {
      setSecondsRemaining((previous) => Math.max(previous - 1, 0));
    }, 1000);
    timeoutRef.current = setTimeout(() => {
      clearSearchTimers();
      setSearching(false);
      setSearchTimeout(true);
      setStatus('Search timed out');
    }, SEARCH_TIMEOUT_SECONDS * 1000);
  }

  useEffect(() => {
    (async () => setCurrentUser(await getStoredUser()))();

    const cleanup = onSocket('matchFound', ({ matchId, request, counterParty, liveLocationState }) => {
      setCurrentMatch({ id: matchId, liveLocationState });
      setActiveRequest(request);
      setCounterParty(counterParty || null);
      setStatus('Live match found!');
      setSearching(false);
      setSearchTimeout(false);
      clearSearchTimers();
      clearSearchSession();
    });
    if (!match) startSearchTimers();
    return () => {
      cleanup();
      clearSearchTimers();
    };
  }, []);

  useEffect(() => {
    async function loadLiveState() {
      if (!currentMatch?.id || currentMatch?.liveLocationState) return;
      try { const result = await getJson(`/match/${currentMatch.id}/live`); if (result.liveLocationState) setCurrentMatch(prev => ({ ...prev, liveLocationState: result.liveLocationState })); }
      catch (e) { logError('Load match location', e); }
    }
    loadLiveState();
  }, [currentMatch?.id]);

  const liveLocationState = currentMatch?.liveLocationState;

  async function handleSearchAgain() {
    try {
      startSearchTimers();
      const search = {
        origin: origin?.trim(),
        destination: destination?.trim(),
        time: time?.trim(),
        active: true,
        startedAt: Date.now()
      };
      await saveSearchSession(search);
      const result = await postJson('/findRide', {
        origin: origin?.trim(),
        destination: destination?.trim(),
        time: time?.trim(),
        userName: currentUser?.name,
        userEmail: currentUser?.email
      });
      setActiveRequest(result.request);
      await saveSearchSession({ ...search, requestId: result.request?.id });
      if (result.match) {
        setCurrentMatch(result.match);
        setCounterParty(result.match.counterParty || null);
        setStatus('Match ready');
        setSearching(false);
        clearSearchTimers();
        await clearSearchSession();
      }
    } catch (error) {
      clearSearchTimers();
      setSearching(false);
      logError('Retry match search', error);
      Alert.alert('Search failed', friendlyError(error, 'Unable to search for a ride. Please try again.'));
    }
  }

  async function handleCancelSearch() {
    clearSearchTimers();
    if (activeRequest?.id && currentUser?.id) {
      try {
        await postJson('/cancelRide', { requestId: activeRequest.id, userId: currentUser.id });
      } catch (error) {
        logError('Cancel match search', error);
      }
    }
    await clearSearchSession();
    navigation.navigate('FindRide');
  }

  async function handleConfirmRide() {
    if (!currentMatch?.id) return;
    if (!currentUser?.id) {
      Alert.alert('Sign in required', 'Please sign in before confirming this match.');
      return;
    }

    try {
      setConfirming(true);
      const result = await postJson('/confirmMatch', { matchId: currentMatch.id, userId: currentUser.id });
      setCurrentMatch(result.match || currentMatch);
      if (result.match?.status === 'confirmed') {
        setStatus('Ride confirmed by both riders');
        setConfirmationNote('Both riders confirmed. You can keep chatting and coordinate externally.');
      } else {
        setStatus('Waiting for the other rider to confirm');
        setConfirmationNote('Your confirmation is recorded. Waiting for the other rider.');
      }
    } catch (error) {
      logError('Confirm match', error);
      Alert.alert('Unable to confirm', friendlyError(error, 'This match could not be confirmed. Please try again.'));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <Modal
        visible={searchTimeout}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchTimeout(false)}
      >
        <View className="flex-1 bg-[#050c1a]/80 items-center justify-center px-6">
          <View className="w-full max-w-sm bg-[#0b172a] border border-[#ff5e36]/50 rounded-3xl p-6 shadow-2xl">
            <Text className="text-white text-lg font-black text-center mb-2">Still looking</Text>
            <Text className="text-[#c9e5f4] text-sm leading-5 text-center mb-5">
              No match was found within 2 minutes. Please try searching again.
            </Text>
            <Text className="text-[#8eb4c6] text-xs text-center mb-5">
              You can also try a wider radius or a different departure time.
            </Text>
            <TouchableOpacity
              className="bg-[#ff5e36] border border-[#ff5e36]/60 py-3.5 rounded-2xl items-center flex-row justify-center gap-2"
              onPress={handleSearchAgain}
            >
              <ZapIcon size={17} color="#ffffff" />
              <Text className="text-white font-black text-sm">Search Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="mt-3 border border-white/[0.15] bg-white/[0.04] py-3.5 rounded-2xl items-center"
              onPress={() => setSearchTimeout(false)}
            >
              <Text className="text-[#8eb4c6] font-extrabold text-sm">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View className="w-full max-w-md self-center py-2">

        {/* Screen Title */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2.5">
            <View className="w-9 h-9 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center">
              <ZapIcon size={18} color="#00f2fe" />
            </View>
            <Text className="text-xl font-black text-white">Ride Match</Text>
          </View>
          <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 px-3 py-1 rounded-full">
            <Text className="text-[#00f2fe] font-bold text-[10px] uppercase">
              {currentMatch ? `Match #${currentMatch.id}` : 'Searching'}
            </Text>
          </View>
        </View>

        {/* Live Map Card */}
        <View className="mb-4 rounded-3xl overflow-hidden border border-[#00f2fe]/30 shadow-2xl bg-[#0b172a]">
          <LiveLocationMap liveLocationState={liveLocationState} title="Your live match map" height={220} />
        </View>

        {/* Route Summary Cards */}
        <View className="bg-[#0b172a]/95 rounded-3xl p-5 border border-[#00f2fe]/20 shadow-xl mb-4">
          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <PinIcon size={18} color="#00f2fe" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Pick-up Origin</Text>
              <Text className="text-white text-sm font-extrabold">{locationLabel(origin || activeRequest?.origin || request?.origin) || 'Downtown'}</Text>
            </View>
          </View>

          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <FlagIcon size={18} color="#ff5e36" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Drop-off Destination</Text>
              <Text className="text-white text-sm font-extrabold">{destination || activeRequest?.destination || request?.destination || 'Airport'}</Text>
            </View>
          </View>

          <View className="bg-white/[0.04] rounded-2xl p-3.5 border border-white/[0.08] flex-row items-center gap-3">
            <ClockIcon size={18} color="#8eb4c6" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Departure Time</Text>
              <Text className="text-white text-sm font-extrabold">{time || activeRequest?.time || request?.time || '7:30 PM'}</Text>
            </View>
          </View>
        </View>

        {/* Live Status Info Banner */}
        <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-2xl p-3.5 mb-5 items-center">
          {searching ? (
            <View className="flex-row items-center gap-2 mb-1">
              <ActivityIndicator size="small" color="#ff5e36" />
              <Text className="text-[#ffb09b] text-xs font-bold">
                Searching... {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')} left
              </Text>
            </View>
          ) : null}
          <Text className="text-[#00f2fe] text-xs font-black tracking-wide text-center">{status}</Text>
          <Text className="text-[#ccebf5] text-xs text-center mt-1 leading-4">
            Match stays pending until both riders confirm. Chat first, then confirm when ready.
          </Text>
          {liveLocationState?.pickupSummary ? (
            <Text className="text-[#ccebf5] text-xs text-center mt-1 leading-4">{liveLocationState.pickupSummary}</Text>
          ) : null}
          {counterParty ? (
            <Text className="text-[#ccebf5] text-xs text-center mt-1 leading-4">
              Matched with {counterParty.name || counterParty.user_name || 'another rider'} 
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          className={`py-4 rounded-2xl items-center shadow-xl mb-3 flex-row justify-center gap-2 ${
            !currentMatch?.id || confirming ? 'bg-[#00f2fe]/40 border border-[#00f2fe]/30' : 'bg-[#00f2fe] border border-[#00f2fe]/60 active:scale-98'
          }`}
          onPress={handleConfirmRide}
          disabled={!currentMatch?.id || confirming}
        >
          <CheckIcon size={18} color="#050c1a" />
          <Text className="text-white font-black text-base tracking-wide">
            {confirming ? 'Confirming...' : currentMatch?.id ? 'Confirm Ride' : 'Waiting for Match...'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`border border-[#00f2fe]/50 bg-[#00f2fe]/10 py-3.5 rounded-2xl items-center flex-row justify-center gap-2 shadow-md ${currentMatch?.id ? 'active:bg-[#00f2fe]/20' : 'opacity-50'}`}
          onPress={() => navigation.navigate('Chat', { matchId: currentMatch?.id, request: activeRequest, counterParty })}
          disabled={!currentMatch?.id}
        >
          <ChatIcon size={16} color="#00f2fe" />
          <Text className="text-[#00f2fe] font-extrabold text-sm">Open Chat</Text>
          <ChatUnreadBadge />
        </TouchableOpacity>

        <TouchableOpacity
          className="mt-3 border border-[#ff5e36]/40 bg-[#ff5e36]/10 py-3 rounded-2xl items-center"
          onPress={handleCancelSearch}
        >
          <Text className="text-[#ff9b83] font-extrabold text-sm">Cancel Search</Text>
        </TouchableOpacity>

        {confirmationNote ? (
          <View className="mt-3 bg-[#050e1d] border border-white/[0.08] rounded-2xl px-4 py-3">
            <Text className="text-[#8eb4c6] text-xs leading-4">{confirmationNote}</Text>
          </View>
        ) : null}

      </View>
    </ScreenLayout>
  );
}