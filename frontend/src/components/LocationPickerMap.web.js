import React from 'react';
import { View, Text } from 'react-native';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';

const defaultCenter = [5.6037, -0.1870];

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: (event) => onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng })
  });
  return null;
}

export default function LocationPickerMap({ value, onSelect, height = 300 }) {
  const center = value ? [value.latitude, value.longitude] : defaultCenter;

  return (
    <View className="overflow-hidden rounded-2xl border border-[#00f2fe]/30">
      <MapContainer
        style={{ width: '100%', height, cursor: 'crosshair' }}
        center={center}
        zoom={value ? 14 : 11}
        scrollWheelZoom
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler onSelect={onSelect} />
        {value ? <CircleMarker center={[value.latitude, value.longitude]} radius={10} pathOptions={{ color: '#ff5e36', fillColor: '#ff5e36', fillOpacity: 0.95 }} /> : null}
      </MapContainer>
      <View className="absolute top-3 left-3 right-3 bg-[#0b172a]/90 rounded-xl px-3 py-2 border border-white/[0.15]">
        <Text className="text-white text-xs font-bold text-center">Click the map to choose a location</Text>
      </View>
    </View>
  );
}
