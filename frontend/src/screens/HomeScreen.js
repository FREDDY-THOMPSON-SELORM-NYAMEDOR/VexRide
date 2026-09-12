import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import LogoutConfirm from '../components/LogoutConfirm';
import { onSocket } from '../services/socket';
import { getStoredUser, logoutUser } from '../services/user';
import ScreenLayout from '../components/ScreenLayout';
import { SearchIcon, PlusIcon, GroupsIcon, LogoutIcon, ZapIcon, CarIcon, TrackingIcon } from '../components/Icons';

const heroImage = require('../../assets/images/vex_home_bg_1784946351687.jpg');

export default function HomeScreen({ navigation, route }) {
  const [alerts, setAlerts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => { (async () => { setCurrentUser(await getStoredUser()) })() }, []);
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true })
    ])).start();
  }, []);

  useEffect(() => {
    const cleanups = [
      onSocket('rideMatched', ({ origin, destination }) => setAlerts(prev => [`Live Match: ${origin} → ${destination}`, ...prev].slice(0, 5))),
      onSocket('groupCreated', ({ group }) => setAlerts(prev => [`New Crew: ${group.origin} → ${group.location}`, ...prev].slice(0, 5))),
      onSocket('groupRideBooked', ({ ride }) => setAlerts(prev => [`Ride Booked: ${ride.provider} arrives in ${ride.eta}`, ...prev].slice(0, 5)))
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  async function handleLogout() {
    try { setLoggingOut(true); await logoutUser(); navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] })); } finally { setLoggingOut(false); }
  }

  const heroScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });
  const initial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="flex-1 w-full max-w-2xl self-center">

        {/* User Profile Bar */}
        {currentUser && (
          <View className="bg-[#0b172a]/95 rounded-3xl p-4 mb-4 border border-[#00f2fe]/20 shadow-xl flex-row justify-between items-center backdrop-blur-xl">
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
                className="bg-[#ff5e36]/15 px-3.5 py-2 rounded-2xl border border-[#ff5e36]/40 flex-row items-center gap-1.5 flex-shrink-0"
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
          </View>
        )}

        {/* Hero Card */}
        <Animated.View style={{ transform: [{ scale: heroScale }] }} className="w-full rounded-3xl overflow-hidden mb-5 border border-[#00f2fe]/30 shadow-2xl bg-[#0b172a]/95 p-5 md:p-6 backdrop-blur-xl">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="bg-[#00f2fe]/20 px-2.5 py-1 rounded-full border border-[#00f2fe]/40 flex-row items-center gap-1">
              {/*<ZapIcon size={12} color="#00f2fe" />*/}
              <Text className="text-[#00f2fe] font-black text-[10px] uppercase tracking-widest">Real-time Mobility</Text>
            </View>
          </View>
          <Text className="text-2xl font-black text-white mb-1 tracking-tight">Ride Modern & Split Smart</Text>
          <Text className="text-[#ccebf5] text-xs leading-5">Connect with nearby riders, share group trips, and verify payments instantly.</Text>
        </Animated.View>

        {/* Quick Action Buttons */}
        <Text className="text-white text-base font-black mb-3 tracking-wide">Quick Actions</Text>
        <View className="mb-5 flex-col sm:flex-row gap-3">
          <TouchableOpacity
            className="flex-1 bg-[#00f2fe] p-4 rounded-2xl items-center justify-center shadow-lg border border-[#00f2fe]/50 active:scale-95 transition-all flex-row sm:flex-col gap-2 sm:gap-1"
            onPress={() => navigation.navigate('FindRide')}
            activeOpacity={0.8}
          >
            <SearchIcon size={20} color="#050c1a" />
            <View className="items-start sm:items-center">
              <Text className="text-[#050c1a] font-black text-base">Find Ride</Text>
              <Text className="text-[#050c1a]/70 font-semibold text-[10px]">Instant matching</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 bg-[#ff5e36] p-4 rounded-2xl items-center justify-center shadow-lg border border-[#ff5e36]/50 active:scale-95 transition-all flex-row sm:flex-col gap-2 sm:gap-1"
            onPress={() => navigation.navigate('CreateGroup')}
            activeOpacity={0.8}
          >
            <PlusIcon size={20} color="#ffffff" />
            <View className="items-start sm:items-center">
              <Text className="text-white font-black text-base">Create Group</Text>
              <Text className="text-white/80 font-semibold text-[10px]">Host a ride crew</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="w-full bg-[#0b172a]/95 border border-[#00f2fe]/40 p-4 rounded-2xl items-center justify-center flex-row gap-2.5 active:bg-[#00f2fe]/10 transition-all shadow-md mb-6 backdrop-blur-xl"
          onPress={() => navigation.navigate('BrowseGroups')}
          activeOpacity={0.8}
        >
          <GroupsIcon size={18} color="#00f2fe" />
          <Text className="text-[#00f2fe] font-extrabold text-base">Browse Live Groups</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="w-full bg-[#0b172a]/95 border border-white/[0.12] p-4 rounded-2xl items-center justify-center flex-row gap-2.5 active:bg-white/[0.08] shadow-md mb-6 backdrop-blur-xl"
          onPress={() => navigation.navigate('TrackingHub')}
          activeOpacity={0.8}
        >
          <TrackingIcon size={18} color="#00f2fe" />
          <Text className="text-white font-extrabold text-base">Open Tracking</Text>
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
                Listening for fresh ride matches and crew updates...
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