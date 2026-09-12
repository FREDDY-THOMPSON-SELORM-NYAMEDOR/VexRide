import React from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

function coordinate(location) {
  if (!location) return null;
  const latitude = Number(location.lat ?? location.latitude);
  const longitude = Number(location.lon ?? location.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export default function RequestMapView({ requests, currentLocation, selectedId, onSelect, height = 360 }) {
  const points = requests.map((request) => coordinate(request.origin)).filter(Boolean);
  const center = coordinate(currentLocation) || points[0] || { latitude: 5.6037, longitude: -0.1870 };

  return (
    <View className="overflow-hidden rounded-3xl border border-[#00f2fe]/30 bg-[#0b172a]">
      <MapView
        style={{ width: '100%', height }}
        initialRegion={{ ...center, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
        pitchEnabled
        rotateEnabled
        showsBuildings
        showsUserLocation={Boolean(currentLocation)}
        camera={{ center, pitch: 42, heading: 0, altitude: 9000, zoom: 12 }}
      >
        {coordinate(currentLocation) ? <Marker coordinate={coordinate(currentLocation)} title="Your current location" pinColor="#ffffff" /> : null}
        {requests.map((request) => {
          const origin = coordinate(request.origin);
          const destination = coordinate(request.destinationLocation);
          if (!origin) return null;
          const selected = Number(selectedId) === Number(request._id || request.id);
          const matched = request.status === 'matched';
          return (
            <React.Fragment key={request._id || request.id}>
              <Marker coordinate={origin} title={request.originLabel || 'Ride origin'} description={`${request.status} request`} pinColor={matched ? '#00f2fe' : '#ff5e36'} onPress={() => onSelect(request)} />
              {selected && destination ? <Polyline coordinates={[origin, destination]} strokeColor={matched ? '#00f2fe' : '#ff5e36'} strokeWidth={matched ? 5 : 3} lineDashPattern={matched ? undefined : [5, 5]} /> : null}
            </React.Fragment>
          );
        })}
      </MapView>
      <Text className="text-[#8eb4c6] text-[10px] font-bold px-3 py-2">Pinch, zoom, rotate, and tilt to explore requests</Text>
    </View>
  );
}