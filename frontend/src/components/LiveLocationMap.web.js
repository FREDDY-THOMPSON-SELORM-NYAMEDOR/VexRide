import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet';

function isValidLocation(loc) {
  return loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
}

function FitMapToLocations({ locations }) {
  const map = useMap();
  const locationKey = locations.map((location) => `${location.latitude},${location.longitude}`).join('|');

  useEffect(() => {
    const bounds = locations.map((location) => [location.latitude, location.longitude]);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36] });
    else if (bounds.length === 1) map.setView(bounds[0], 14);
  }, [map, locationKey]);

  return null;
}

export default function LiveLocationMap({ liveLocationState, height = 240, title = 'Live locations' }) {
  const participants = liveLocationState?.participants?.length
    ? liveLocationState.participants
    : [liveLocationState?.user1Location, liveLocationState?.user2Location].filter(Boolean);
  const validParticipants = participants.filter(isValidLocation);
  const carLocation = liveLocationState?.carLocation;
  const validLocations = [...validParticipants, carLocation].filter(isValidLocation);
  const centerLocation = carLocation || validParticipants[0];
  const hasAnyLocation = validLocations.length > 0;
  const hasLiveLocations = validParticipants.some((participant) => participant.locationType !== 'pickup');
  const pickupSequence = liveLocationState?.pickupSequence?.length ? liveLocationState.pickupSequence : validParticipants;

  return (
    <View className="bg-[#0b172a] rounded-3xl p-4 border border-[#00f2fe]/30 shadow-xl mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-white font-extrabold text-sm tracking-wide">{title}</Text>
        <View className="flex-row items-center gap-1 bg-[#00f2fe]/10 px-2.5 py-0.5 rounded-full border border-[#00f2fe]/30">
          <View className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />
          <Text className="text-[#00f2fe] font-bold text-[10px] uppercase">{hasLiveLocations ? 'GPS Live' : 'Pickup points'}</Text>
        </View>
      </View>

      {hasAnyLocation ? (
        <MapContainer
          style={{ width: '100%', height, borderRadius: 16, overflow: 'hidden' }}
          center={[centerLocation.latitude, centerLocation.longitude]}
          zoom={14}
          scrollWheelZoom={false}
        >
          <FitMapToLocations locations={validLocations} />
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {validParticipants.map((participant, index) => <CircleMarker key={participant.userId || participant.id || index} center={[participant.latitude, participant.longitude]} radius={10} pathOptions={{ color: index % 2 === 0 ? '#00f2fe' : '#ff5e36', fillColor: index % 2 === 0 ? '#00f2fe' : '#ff5e36', fillOpacity: 0.95 }}><Popup>{participant.name || `Rider ${index + 1}`}{participant.locationType === 'pickup' ? ' · Pickup location' : ' · Live location'}</Popup></CircleMarker>)}
          {isValidLocation(carLocation) && <CircleMarker center={[carLocation.latitude, carLocation.longitude]} radius={9} pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.9 }}><Popup>Shared car location</Popup></CircleMarker>}
          {pickupSequence.length > 1 && <Polyline positions={pickupSequence.map((participant) => [participant.latitude, participant.longitude])} pathOptions={{ color: 'rgba(0, 242, 254, 0.6)', weight: 3 }} />}
        </MapContainer>
      ) : (
        <View style={{ minHeight: height }} className="justify-center items-center py-6">
          <Text className="text-2xl mb-2">📡</Text>
          <Text className="text-[#8eb4c6] text-xs font-semibold text-center leading-5">
            Waiting for live GPS coordinates from matched riders...
          </Text>
        </View>
      )}

      {liveLocationState?.pickupSummary ? (
        <Text className="text-[#00f2fe] text-xs font-bold mt-3 leading-4">{liveLocationState.pickupSummary}</Text>
      ) : null}
    </View>
  );
}