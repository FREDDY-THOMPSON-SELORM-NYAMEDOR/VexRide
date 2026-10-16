import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { getJson } from '../services/api';
import ScreenLayout from '../components/ScreenLayout';
import LiveLocationMap from '../components/LiveLocationMap';
import { CheckIcon, PinIcon, FlagIcon, ClockIcon, HomeIcon, UsersIcon } from '../components/Icons';
import { logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_home_bg_1784946351687.jpg');

export default function RideDetailsScreen({ navigation, route }) {
  const ride = route.params?.ride || {};
  const matchId = route.params?.matchId || ride.matchId || ride.id;
  const [liveLocationState, setLiveLocationState] = useState(route.params?.liveLocationState || ride.liveLocationState || null);

  useEffect(() => {
    let active = true;

    async function loadLiveState() {
      if (!matchId || liveLocationState) return;
      try {
        const result = await getJson(`/match/${matchId}/live`);
        if (!active) return;
        if (result.liveLocationState) {
          setLiveLocationState(result.liveLocationState);
        }
      } catch (error) {
        logError('Load ride location', error);
      }
    }

    loadLiveState();
    return () => {
      active = false;
    };
  }, [matchId, liveLocationState]);

  const rideStatus = String(ride.status || '').toLowerCase();
  const rideStatusLabel = rideStatus === 'completed'
    ? 'completed'
    : rideStatus === 'confirmed'
      ? 'confirmed'
      : rideStatus === 'cancelled'
        ? 'cancelled'
        : 'pending';

  const departureTime = ride.ride_time ? new Date(ride.ride_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'TBD';

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-md self-center py-2">
        <View className="items-center mb-6">
          <View className="w-14 h-14 rounded-full bg-[#00f2fe]/20 border border-[#00f2fe]/50 items-center justify-center mb-3 shadow-xl">
            <CheckIcon size={24} color="#00f2fe" />
          </View>
          <Text className="text-2xl font-black text-white">Ride Details</Text>
          <Text className="text-[#8eb4c6] text-xs mt-1">Route and rider details for this confirmed trip</Text>
        </View>

        <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-2xl px-4 py-3 mb-4 flex-row items-center justify-between">
          <Text className="text-white font-bold text-xs uppercase tracking-widest">Ride Status</Text>
          <View className={`px-3 py-1 rounded-full ${rideStatusLabel === 'completed' ? 'bg-[#00f2fe]' : rideStatusLabel === 'cancelled' ? 'bg-[#ff5e36]' : 'bg-[#f5b700]'}`}>
            <Text className={`font-black text-[10px] uppercase ${rideStatusLabel === 'completed' ? 'text-[#050c1a]' : 'text-white'}`}>{rideStatusLabel}</Text>
          </View>
        </View>

        <View className="mb-5 rounded-3xl overflow-hidden border border-[#00f2fe]/30 shadow-2xl bg-[#0b172a]">
          <LiveLocationMap liveLocationState={liveLocationState} title="Ride map" height={220} />
        </View>

        <View className="bg-[#0b172a]/95 rounded-3xl p-5 border border-[#00f2fe]/30 shadow-2xl mb-5 backdrop-blur-xl">
          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <PinIcon size={18} color="#00f2fe" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Pick-up</Text>
              <Text className="text-white text-base font-extrabold">{ride.pickup_location || 'TBD'}</Text>
            </View>
          </View>

          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <FlagIcon size={18} color="#ff5e36" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Drop-off</Text>
              <Text className="text-white text-base font-extrabold">{ride.dropoff_location || 'TBD'}</Text>
            </View>
          </View>

          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <UsersIcon size={18} color="#00f2fe" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Riders</Text>
              <Text className="text-white text-sm font-extrabold">{ride.user1_name || 'Rider 1'} and {ride.user2_name || 'Rider 2'}</Text>
            </View>
          </View>

          <View className="bg-white/[0.04] rounded-2xl p-3.5 mb-2.5 border border-white/[0.08] flex-row items-center gap-3">
            <ClockIcon size={18} color="#8eb4c6" />
            <View className="flex-1 min-w-0">
              <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Departure Time</Text>
              <Text className="text-white text-base font-extrabold">{departureTime}</Text>
            </View>
          </View>

        </View>

        <TouchableOpacity
          className="bg-[#ff5e36] border border-[#ff5e36]/60 p-4 rounded-2xl items-center shadow-xl active:scale-98 flex-row justify-center gap-2"
          onPress={() => navigation.navigate('Home')}
        >
          <HomeIcon size={18} color="#ffffff" />
          <Text className="text-white font-black text-base tracking-wide">Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}
