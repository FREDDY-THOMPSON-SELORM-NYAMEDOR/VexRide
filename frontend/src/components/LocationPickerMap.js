import React from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const defaultRegion = {
  latitude: 5.6037,
  longitude: -0.1870,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12
};

export default function LocationPickerMap({ value, onSelect, height = 300 }) {
  const region = value ? { ...defaultRegion, latitude: value.latitude, longitude: value.longitude } : defaultRegion;

  return (
    <View className="overflow-hidden rounded-2xl border border-[#00f2fe]/30">
      <MapView
        style={{ width: '100%', height }}
        initialRegion={region}
        onPress={(event) => onSelect(event.nativeEvent.coordinate)}
      >
        {value ? <Marker coordinate={value} pinColor="#ff5e36" title="Selected location" /> : null}
      </MapView>
      <View className="absolute top-3 left-3 right-3 bg-[#0b172a]/90 rounded-xl px-3 py-2 border border-white/[0.15]">
        <Text className="text-white text-xs font-bold text-center">Tap the map to choose a location</Text>
      </View>
    </View>
  );
}
