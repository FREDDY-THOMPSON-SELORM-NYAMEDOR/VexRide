import React from 'react';
import { View, Text, Platform } from 'react-native';

let MapView = null;
let Marker = null;
let Polyline = null;
if (Platform.OS !== 'web') {
  ({ default: MapView, Marker, Polyline } = require('react-native-maps'));
}

function toRegion(locations) {
  if (!locations.length) return null;
  const latitudes = locations.map((location) => Number(location.latitude));
  const longitudes = locations.map((location) => Number(location.longitude));
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(maxLatitude - minLatitude, 0.02) * 1.4,
    longitudeDelta: Math.max(maxLongitude - minLongitude, 0.02) * 1.4
  };
}
function isValidLocation(loc) {
  return loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
}

export default function LiveLocationMap({ liveLocationState, height = 240, title = 'Live locations' }) {
  const participants = liveLocationState?.participants?.length
    ? liveLocationState.participants
    : [liveLocationState?.user1Location, liveLocationState?.user2Location].filter(Boolean);
  const carLocation = liveLocationState?.carLocation;
  const validParticipants = participants.filter(isValidLocation);
  const validLocations = [...validParticipants, carLocation].filter(isValidLocation);
  const hasLiveLocations = validParticipants.some((participant) => participant.locationType !== 'pickup');
  const region = toRegion(validLocations);
  const isWeb = Platform.OS === 'web';

  if (isWeb || !region || !validLocations.length) {
    return (
      <View style={{ minHeight: height }} className="bg-[#0b172a] rounded-3xl p-4 border border-[#00f2fe]/30 shadow-xl mb-4 justify-center items-center">
        <Text className="text-white font-extrabold text-sm mb-2">{title}</Text>
        <Text className="text-[#8eb4c6] text-xs font-semibold text-center leading-5 mb-2">
          Waiting for live GPS coordinates from matched riders...
        </Text>
        {liveLocationState?.pickupSummary ? <Text className="text-[#00f2fe] text-xs font-bold text-center leading-4">{liveLocationState.pickupSummary}</Text> : null}
      </View>
    );
  }

  return (
    <View className="bg-[#0b172a] rounded-3xl p-4 border border-[#00f2fe]/30 shadow-xl mb-4 w-full">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-white font-extrabold text-sm tracking-wide">{title}</Text>
        <View className="flex-row items-center gap-1 bg-[#00f2fe]/10 px-2.5 py-0.5 rounded-full border border-[#00f2fe]/30">
          <View className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />
          <Text className="text-[#00f2fe] font-bold text-[10px] uppercase">{hasLiveLocations ? 'GPS Live' : 'Pickup points'}</Text>
        </View>
      </View>

      <MapView style={{ height, width: '100%', borderRadius: 16 }} initialRegion={region} region={region}>
        {validParticipants.map((participant, index) => (
          <Marker
            key={participant.userId || participant.id || index}
            coordinate={participant}
            title={participant.name || `Rider ${index + 1}`}
            description={participant.locationType === 'pickup' ? 'Pickup location' : 'Live location'}
            pinColor={index % 2 === 0 ? '#00f2fe' : '#ff5e36'}
          />
        ))}
        {isValidLocation(carLocation) ? <Marker coordinate={carLocation} title="Car" description="Shared car location" pinColor="#ffffff" /> : null}
        {validParticipants.length > 1 ? <Polyline coordinates={liveLocationState?.pickupSequence?.length ? liveLocationState.pickupSequence : validParticipants} strokeColor="rgba(0, 242, 254, 0.6)" strokeWidth={3} /> : null}
      </MapView>
      <Text className="text-[#00f2fe] text-xs font-bold mt-2.5 leading-4">{liveLocationState?.pickupSummary || 'Live tracking active'}</Text>
    </View>
  );
}