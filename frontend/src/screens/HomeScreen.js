import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import LogoutConfirm from '../components/LogoutConfirm';
import { onSocket } from '../services/socket';
import { getStoredUser, logoutUser } from '../services/user';
import ScreenLayout from '../components/ScreenLayout';
import { SearchIcon, PlusIcon, GroupsIcon, LogoutIcon, ZapIcon, CarIcon, TrackingIcon } from '../components/Icons';
import { logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_home_bg_1784946351687.jpg');

export default function HomeScreen({ navigation, route }) {
  const [alerts, setAlerts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoadingProfile(true);
    getStoredUser()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch((error) => {
        if (active) setCurrentUser(null);
        logError('Load home profile', error);
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => { active = false; };
  }, []));

  useEffect(() => {
    const cleanups = [
      onSocket('rideMatched', ({ origin, destination }) => setAlerts(prev => [`Live Match: ${origin} → ${destination}`, ...prev].slice(0, 5))),
      onSocket('connectionRequested', ({ requester }) => setAlerts(prev => [`${requester?.name || 'A rider'} wants to join your ride`, ...prev].slice(0, 5))),
      onSocket('connectionAccepted', ({ recipient }) => setAlerts(prev => [`${recipient?.name || 'The ride owner'} accepted a request to join`, ...prev].slice(0, 5))),
      onSocket('connectionDeclined', ({ recipient }) => setAlerts(prev => [`${recipient?.name || 'The ride owner'} declined a request to join`, ...prev].slice(0, 5))),
      onSocket('groupCreated', ({ group }) => setAlerts(prev => [`New Crew: ${group.origin} → ${group.location}`, ...prev].slice(0, 5))),
      onSocket('groupRideBooked', ({ ride }) => setAlerts(prev => [`Ride Booked: ${ride.provider} arrives in ${ride.eta}`, ...prev].slice(0, 5)))
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  async function handleLogout() {
    try { setLoggingOut(true); await logoutUser(); navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] })); } finally { setLoggingOut(false); }
  }

  const initial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="flex-1 w-full max-w-2xl self-center">

        <View className="bg-[#0b172a]/95 rounded-3xl p-4 mb-4 border border-[#00f2fe]/20 shadow-xl flex-col sm:flex-row justify-between items-center gap-3 backdrop-blur-xl">
          {currentUser ? (
            <>
              <View className="flex-row items-center gap-3 flex-1 min-w-0 mr-2">
                <View className="w-11 h-11 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 items-center justify-center shadow-md flex-shrink-0">
                  <Text className="text-[#00f2fe] font-black text-lg">{initial}</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-white text-base font-extrabold" numberOfLines={1}>{currentUser.name}</Text>
                  <Text className="text-[#8eb4c6] text-xs font-semibold" numberOfLines={1}>{currentUser.email}</Text>
                </View>
              </View>
              <LogoutConfirm onLogout={handleLogout} loading={loggingOut} renderTrigger={({ open, disabled }) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Log out"
                  className="self-end sm:self-auto bg-[#ff5e36]/15 px-3.5 py-2 rounded-2xl border border-[#ff5e36]/40 flex-row items-center gap-1.5 flex-shrink-0"
                  onPress={open}
                  disabled={disabled}
                >
                  {disabled ? (
                    <ActivityIndicator color="#ff5e36" size="small" />
                  ) : (
                    <>
                      <LogoutIcon size={14} color="#ff5e36" />
                      <Text className="text-[#ff5e36] font-bold text-xs">Logout</Text>
                    </>
                  )}
                </TouchableOpacity>
              )} />
            </>
          ) : (
            <>
              <View className="flex-1 self-start">
                <Text className="text-white text-base font-extrabold">
                  {loadingProfile ? 'Loading profile…' : 'You’re not signed in'}
                </Text>
                <Text className="text-[#8eb4c6] text-xs font-semibold mt-1">
                  {loadingProfile ? 'Checking your account' : 'Sign in to manage your rides'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Log in"
                className="self-end sm:self-auto bg-[#00f2fe] px-5 py-2.5 rounded-2xl"
                onPress={() => navigation.navigate('Auth')}
              >
                <Text className="text-[#050c1a] font-black text-sm">Log in</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Hero Card */}
        <View className="w-full rounded-3xl overflow-hidden mb-5 border border-[#00f2fe]/30 shadow-2xl bg-[#0b172a]/95 p-5 md:p-6 backdrop-blur-xl">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="bg-[#00f2fe]/20 px-2.5 py-1 rounded-full border border-[#00f2fe]/40 flex-row items-center gap-1">
              {/*<ZapIcon size={12} color="#00f2fe" />*/}
              <Text className="text-[#00f2fe] font-black text-[10px] uppercase tracking-widest">Ride together</Text>
            </View>
          </View>
          <Text className="text-2xl font-black text-white mb-1 tracking-tight">Going somewhere?</Text>
          <Text className="text-[#ccebf5] text-xs leading-5">Share your route and meet riders heading the same way.</Text>
        </View>

        {/* Quick Action Buttons */}
        <Text className="text-white text-base font-black mb-3 tracking-wide">Let’s get you moving</Text>
        <View className="mb-5 flex-col sm:flex-row gap-3">
          <TouchableOpacity
            className="flex-1 bg-[#00f2fe] p-4 rounded-2xl items-center justify-center shadow-lg border border-[#00f2fe]/50 active:scale-95 transition-all flex-row sm:flex-col gap-2 sm:gap-1"
            onPress={() => navigation.navigate('FindRide')}
            activeOpacity={0.8}
          >
            <SearchIcon size={20} color="#050c1a" />
            <View className="items-start sm:items-center">
              <Text className="text-[#050c1a] font-black text-base">Find riders going my way</Text>
              <Text className="text-[#050c1a]/70 font-semibold text-[10px]">Share a route and travel together</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 bg-[#ff5e36] p-4 rounded-2xl items-center justify-center shadow-lg border border-[#ff5e36]/50 active:scale-95 transition-all flex-row sm:flex-col gap-2 sm:gap-1"
            onPress={() => navigation.navigate('CreateGroup')}
            activeOpacity={0.8}
          >
            <PlusIcon size={20} color="#ffffff" />
            <View className="items-start sm:items-center">
              <Text className="text-white font-black text-base">Plan a group ride</Text>
              <Text className="text-white/80 font-semibold text-[10px]">Bring your people along</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="w-full bg-[#0b172a]/95 border border-[#00f2fe]/40 p-4 rounded-2xl items-center justify-center flex-row gap-2.5 active:bg-[#00f2fe]/10 transition-all shadow-md mb-6 backdrop-blur-xl"
          onPress={() => navigation.navigate('BrowseGroups')}
          activeOpacity={0.8}
        >
          <GroupsIcon size={18} color="#00f2fe" />
          <Text className="text-[#00f2fe] font-extrabold text-base">Browse group rides</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="w-full bg-[#0b172a]/95 border border-[#ff5e36]/40 p-4 rounded-2xl items-center justify-center flex-row gap-2.5 active:bg-[#ff5e36]/10 transition-all shadow-md mb-6 backdrop-blur-xl"
          onPress={() => navigation.navigate('ConnectionRequests')}
          activeOpacity={0.8}
        >
          <SearchIcon size={18} color="#ff5e36" />
          <Text className="text-[#ff8c73] font-extrabold text-base">Rider requests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="w-full bg-[#0b172a]/95 border border-white/[0.12] p-4 rounded-2xl items-center justify-center flex-row gap-2.5 active:bg-white/[0.08] shadow-md mb-6 backdrop-blur-xl"
          onPress={() => navigation.navigate('TrackingHub')}
          activeOpacity={0.8}
        >
          <TrackingIcon size={18} color="#00f2fe" />
          <Text className="text-white font-extrabold text-base">My rides</Text>
        </TouchableOpacity>

        {/* Live Activity Feed */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-base font-black tracking-wide">Live Activity</Text>
          <View className="flex-row items-center gap-1.5 bg-[#00f2fe]/10 px-2.5 py-1 rounded-full border border-[#00f2fe]/25">
            <View className="w-2 h-2 rounded-full bg-[#00f2fe]" />
            <Text className="text-[#00f2fe] font-bold text-[10px] uppercase">Realtime</Text>
          </View>
        </View>

        <View className="flex-1 bg-[#0b172a]/95 rounded-3xl p-5 border border-white/[0.08] min-h-[160px] backdrop-blur-xl">
          {alerts.length === 0 ? (
            <View className="items-center justify-center py-8">
              <View className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/[0.1] items-center justify-center mb-2">
                <CarIcon size={20} color="#8eb4c6" />
              </View>
              <Text className="text-[#8eb4c6] text-xs font-semibold text-center leading-5">
                Ride updates and group activity will appear here.
              </Text>
            </View>
          ) : (
            alerts.map((alert, index) => (
              <View key={index} className="bg-[#071426] rounded-2xl p-3.5 mb-2.5 border border-[#00f2fe]/15 shadow-sm flex-row items-center gap-3">
                <ZapIcon size={14} color="#00f2fe" />
                <Text className="text-[#e6f7ff] text-xs font-semibold flex-1 leading-4">{alert}</Text>
              </View>
            ))
          )}
        </View>

      </View>
    </ScreenLayout>
  );
}