import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import ScreenLayout from '../components/ScreenLayout';
import { SearchIcon, TrackingIcon } from '../components/Icons';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

export default function TrackingHubScreen({ navigation, route }) {
  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-lg self-center py-2">
        <View className="items-center mb-7">
          <View className="w-14 h-14 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center mb-3">
            <TrackingIcon size={25} color="#00f2fe" />
          </View>
          <Text className="text-2xl font-black text-white">Tracking</Text>
          <Text className="text-[#8eb4c6] text-xs text-center mt-1">Manage requests and follow matched rides</Text>
        </View>

        <TouchableOpacity
          className="bg-[#0b172a]/95 border border-[#00f2fe]/35 rounded-3xl p-5 mb-4 flex-row items-center gap-4 shadow-xl"
          onPress={() => navigation.navigate('MyRequests')}
          activeOpacity={0.8}
        >
          <View className="w-12 h-12 rounded-2xl bg-[#00f2fe]/15 border border-[#00f2fe]/35 items-center justify-center">
            <SearchIcon size={21} color="#00f2fe" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-base font-black">My Requests</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">View, cancel, and complete your ride requests</Text>
          </View>
          <Text className="text-[#00f2fe] text-2xl font-black">›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[#0b172a]/95 border border-[#ff5e36]/35 rounded-3xl p-5 flex-row items-center gap-4 shadow-xl"
          onPress={() => navigation.navigate('RideTracking')}
          activeOpacity={0.8}
        >
          <View className="w-12 h-12 rounded-2xl bg-[#ff5e36]/15 border border-[#ff5e36]/35 items-center justify-center">
            <TrackingIcon size={21} color="#ff5e36" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-base font-black">Matched Rides</Text>
            <Text className="text-[#8eb4c6] text-xs mt-1">Open confirmed rides, maps, and rider chat</Text>
          </View>
          <Text className="text-[#ff5e36] text-2xl font-black">›</Text>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}
