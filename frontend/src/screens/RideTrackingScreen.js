import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { getJson, patchJson, postJson } from '../services/api';
import { getStoredUser } from '../services/user';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import LiveLocationMap from '../components/LiveLocationMap';
import { TrackingIcon, CheckIcon, CarIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';
import ChatUnreadBadge from '../components/ChatUnreadBadge';
import { getChatRoomId } from '../services/chatBadge';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

export default function RideTrackingScreen({ navigation, route }) {
  const [activeRides, setActiveRides] = useState([]);
  const [completedRides, setCompletedRides] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { (async () => { const user = await getStoredUser(); setCurrentUser(user); if (user) await loadRides(user.id); })() }, []);
  useEffect(() => {
    if (!currentUser) return;
    const c1 = onSocket('rideConfirmed', ({ matchId }) => loadRides(currentUser.id));
    const c4 = onSocket('rideCompletionUpdate', () => loadRides(currentUser.id));
    const c2 = onSocket('matchLocationUpdate', () => loadRides(currentUser.id));
    const c3 = onSocket('userLocationUpdated', () => loadRides(currentUser.id));
    return () => { c1(); c2(); c3(); c4(); };
  }, [currentUser]);

  async function loadRides(userId) {
    try {
      const data = await getJson(`/activeRides/${userId}`);
      setActiveRides(data.rides || []);
      setCompletedRides(data.completedRides || []);
    }
    catch (e) { logError('Load active rides', e); } finally { setLoading(false); setRefreshing(false); }
  }

  async function handleConfirmRide(ride) {
    if (!currentUser) return Alert.alert('Error', 'User not found');
    if ((ride.user1_id === currentUser.id && ride.user1_confirmed) || (ride.user2_id === currentUser.id && ride.user2_confirmed)) return Alert.alert('Already Confirmed', 'You have already confirmed this ride');
    try { await postJson('/confirmMatch', { matchId: ride.id, userId: currentUser.id }); Alert.alert('Success', 'Ride confirmation recorded!'); await loadRides(currentUser.id); }
    catch (error) { logError('Confirm ride', error); Alert.alert('Unable to confirm', friendlyError(error, 'Ride confirmation failed. Please try again.')); }
  }

  async function onRefresh() { setRefreshing(true); if (currentUser) await loadRides(currentUser.id); }

  async function handleLeaveGroup(ride) {
    if (!ride.groupConnectionId || !currentUser?.id) return;
    try {
      await patchJson(`/api/connections/${ride.groupConnectionId}`, { userId: currentUser.id, status: 'cancelled' });
      await loadRides(currentUser.id);
      Alert.alert('Group left', 'You have left this ride group.');
    } catch (error) {
      logError('Leave ride group', error);
      Alert.alert('Unable to leave group', friendlyError(error, 'Could not leave this ride group.'));
    }
  }

  async function handleCompleteRide(ride) {
    if (!currentUser?.id) return;
    try {
      await postJson('/confirmRideCompleted', { matchId: ride.id, userId: currentUser.id });
      await loadRides(currentUser.id);
      Alert.alert('Completion recorded', 'The ride will move to completed rides after every rider confirms.');
    } catch (error) {
      logError('Complete ride', error);
      Alert.alert('Unable to complete ride', friendlyError(error, 'Could not record ride completion.'));
    }
  }

  function openRideDetails(ride) {
    navigation.navigate('RideDetails', {
      ride,
      matchId: ride.id,
      liveLocationState: ride.liveLocationState
    });
  }

  if (loading) return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="flex-1 justify-center items-center p-8 bg-[#0b172a]/95 rounded-3xl border border-[#00f2fe]/30 backdrop-blur-xl">
        <View className="w-12 h-12 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 items-center justify-center mb-3">
          <TrackingIcon size={24} color="#00f2fe" />
        </View>
        <Text className="text-[#00f2fe] font-extrabold text-base text-center">Loading Active Rides...</Text>
      </View>
    </ScreenLayout>
  );

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00f2fe" />}>
      <View className="w-full max-w-lg self-center">

        {/* Header */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="w-10 h-10 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center flex-shrink-0">
            <TrackingIcon size={20} color="#00f2fe" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-xl font-black text-white">Live Tracking</Text>
            <Text className="text-[#8eb4c6] text-xs">Monitor confirmed trips and GPS locations</Text>
          </View>
        </View>

        {/* Live Map Card */}
        {activeRides[0]?.liveLocationState ? (
          <View className="rounded-3xl overflow-hidden mb-5 border border-[#00f2fe]/30 shadow-2xl bg-[#0b172a]">
            <LiveLocationMap liveLocationState={activeRides[0].liveLocationState} title="Live ride map" height={260} />
          </View>
        ) : (
          <View className="bg-[#0b172a]/95 rounded-3xl p-5 border border-[#00f2fe]/20 shadow-xl mb-5 flex-row items-center gap-3">
            <View className="flex-1 min-w-0">
              <Text className="text-white font-extrabold text-sm mb-0.5">Live GPS Stream</Text>
              <Text className="text-[#8eb4c6] text-xs leading-4">Waiting for GPS data from matched riders.</Text>
            </View>
          </View>
        )}

        {/* Active Rides List */}
        {activeRides.length === 0 ? (
          <View className="bg-[#0b172a]/95 rounded-3xl p-8 border border-white/[0.08] items-center my-4">
            <View className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.1] items-center justify-center mb-3">
              <CarIcon size={24} color="#8eb4c6" />
            </View>
            <Text className="text-white text-base font-extrabold mb-1">No Active Confirmed Rides</Text>
            <Text className="text-[#8eb4c6] text-xs text-center">Match a ride from the search screen to track it live here.</Text>
          </View>
        ) : (
          activeRides.map((ride) => {
            const isUser1 = ride.user1_id === currentUser?.id;
            const userConfirmed = ride.status === 'confirmed' || (isUser1 ? ride.user1_confirmed : ride.user2_confirmed);
            const completedByUser = ride.match_type === 'group'
              ? (ride.completion_confirmations || []).map(Number).includes(Number(currentUser?.id))
              : (isUser1 ? ride.user1_completed_confirmed : ride.user2_completed_confirmed);
            const rideStatusLabel = ride.status === 'confirmed' ? 'fulfilled' : ride.status === 'cancelled' ? 'cancelled' : 'pending';

            return (
              <View key={ride.id} className="bg-[#0b172a]/95 rounded-3xl p-5 mb-4 border border-[#00f2fe]/25 shadow-xl">

                {/* Card Header */}
                <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-white/[0.08]">
                  <Text className="text-white text-base font-black">Ride #{ride.id}</Text>
                  <View className={`px-3 py-1 rounded-full ${rideStatusLabel === 'fulfilled' ? 'bg-[#00f2fe]' : rideStatusLabel === 'cancelled' ? 'bg-[#ff5e36]' : 'bg-[#f5b700]'}`}>
                    <Text className={`font-black text-[10px] uppercase ${rideStatusLabel === 'fulfilled' ? 'text-[#050c1a]' : 'text-white'}`}>
                      {rideStatusLabel}
                    </Text>
                  </View>
                </View>

                {/* Route Info Box */}
                <View className="bg-white/[0.03] rounded-2xl p-3.5 mb-3 border border-white/[0.08]">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-[#8eb4c6] text-xs font-bold">Pick-up:</Text>
                    <Text className="text-white font-extrabold text-xs">{ride.pickup_location || 'Downtown'}</Text>
                  </View>
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-[#8eb4c6] text-xs font-bold">Drop-off:</Text>
                    <Text className="text-white font-extrabold text-xs">{ride.dropoff_location || 'Airport'}</Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[#8eb4c6] text-xs font-bold">Time:</Text>
                    <Text className="text-[#00f2fe] font-extrabold text-xs">{ride.ride_time ? new Date(ride.ride_time).toLocaleTimeString() : 'TBD'}</Text>
                  </View>
                </View>

                <View className="mb-3">
                  <TouchableOpacity
                    className="flex-1 bg-[#00f2fe]/10 border border-[#00f2fe]/40 py-3 rounded-2xl items-center"
                    onPress={() => openRideDetails(ride)}
                  >
                    <Text className="text-[#00f2fe] font-black text-xs uppercase tracking-wider">View Ride Details</Text>
                    <ChatUnreadBadge roomId={getChatRoomId(ride.id, ride.group_request_id)} />
                  </TouchableOpacity>
                  {ride.groupConnectionId ? (
                    <TouchableOpacity
                      className="mt-2 border border-[#ff5e36]/50 bg-[#ff5e36]/10 py-3 rounded-2xl items-center"
                      onPress={() => handleLeaveGroup(ride)}
                    >
                      <Text className="text-[#ff9b83] font-black text-xs uppercase tracking-wider">Leave Group</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* User Confirmation Status */}
                <View className="flex-row items-center mb-3">
                  <View className={`px-3 py-1 rounded-full flex-row items-center gap-1.5 ${userConfirmed ? 'bg-[#00f2fe]/20 border border-[#00f2fe]/40' : 'bg-[#ff5e36]/20 border border-[#ff5e36]/40'}`}>
                    <CheckIcon size={12} color={userConfirmed ? '#00f2fe' : '#ff5e36'} />
                    <Text className={`text-[10px] font-extrabold ${userConfirmed ? 'text-[#00f2fe]' : 'text-[#ff5e36]'}`}>
                      {userConfirmed ? 'Confirmed by You' : 'Confirmation Pending'}
                    </Text>
                  </View>
                </View>

                {!userConfirmed && ride.status !== 'confirmed' && (
                  <TouchableOpacity
                    className="bg-[#00f2fe] border border-[#00f2fe]/60 py-3 rounded-2xl items-center shadow-lg active:scale-98 mt-2 flex-row justify-center gap-2"
                    onPress={() => handleConfirmRide(ride)}
                  >
                    <CheckIcon size={16} color="#050c1a" />
                    <Text className="text-[#050c1a] font-black text-xs">Confirm Ride</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  className={`mt-2 border py-3 rounded-2xl items-center ${completedByUser ? 'border-[#7ee787]/40 bg-[#7ee787]/10' : 'border-[#7ee787]/50 bg-[#7ee787]/15'}`}
                  onPress={() => handleCompleteRide(ride)}
                  disabled={completedByUser}
                >
                  <Text className="text-[#7ee787] font-black text-xs uppercase tracking-wider">
                    {completedByUser ? 'Completion Recorded' : 'Mark Ride Complete'}
                  </Text>
                </TouchableOpacity>

                {!userConfirmed && ride.status !== 'confirmed' && (
                  <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/25 rounded-2xl p-3 mt-2">
                    <Text className="text-[#8eb4c6] text-[11px] font-bold leading-4">
                      Confirm when you are ready. Both riders can chat first and decide how to proceed.
                    </Text>
                  </View>
                )}

              </View>
            );
          })
        )}

        {completedRides.length ? (
          <View className="mt-5">
            <Text className="text-white text-base font-black mb-3">Completed rides</Text>
            {completedRides.map((ride) => (
              <TouchableOpacity
                key={ride.id}
                className="bg-[#0b172a]/75 rounded-2xl p-4 mb-3 border border-white/[0.1]"
                onPress={() => openRideDetails(ride)}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-white font-black text-sm" numberOfLines={1}>
                      {ride.pickup_location || 'Pickup'} to {ride.dropoff_location || 'Destination'}
                    </Text>
                    <Text className="text-[#8eb4c6] text-xs mt-1">
                      {ride.ride_time ? new Date(ride.ride_time).toLocaleDateString() : 'Completed ride'}
                    </Text>
                  </View>
                  <Text className="text-[#7ee787] font-black text-[10px] uppercase">Completed</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

      </View>
    </ScreenLayout>
  );
}