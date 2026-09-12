import React from 'react';
import { Text, View } from 'react-native';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';

function coordinate(location) {
  if (!location) return null;
  const latitude = Number(location.lat ?? location.latitude);
  const longitude = Number(location.lon ?? location.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

export default function RequestMapView({ requests, currentLocation, selectedId, onSelect, height = 360 }) {
  const points = requests.map((request) => coordinate(request.origin)).filter(Boolean);
  const userPoint = coordinate(currentLocation);
  const center = userPoint || points[0] || [5.6037, -0.1870];

  return (
    <View className="overflow-hidden rounded-3xl border border-[#00f2fe]/30 bg-[#0b172a]">
      <MapContainer center={center} zoom={12} scrollWheelZoom style={{ width: '100%', height, filter: 'saturate(1.15) contrast(1.05)' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {userPoint ? <CircleMarker center={userPoint} radius={9} pathOptions={{ color: '#ffffff', fillColor: '#00f2fe', fillOpacity: 1 }}><Popup>Your current location</Popup></CircleMarker> : null}
        {requests.map((request) => {
          const origin = coordinate(request.origin);
          const destination = coordinate(request.destinationLocation);
          if (!origin) return null;
          const selected = Number(selectedId) === Number(request._id || request.id);
          const matched = request.status === 'matched';
          return (
            <React.Fragment key={request._id || request.id}>
              <CircleMarker center={origin} radius={matched ? 12 : 9} pathOptions={{ color: matched ? '#00f2fe' : '#ff5e36', fillColor: matched ? '#00f2fe' : '#ff5e36', fillOpacity: 0.9, weight: selected ? 4 : 2 }} eventHandlers={{ click: () => onSelect(request) }}>
                <Popup><Text>{request.originLabel || 'Ride origin'} · {request.status}</Text></Popup>
              </CircleMarker>
              {selected && destination ? <Polyline positions={[origin, destination]} pathOptions={{ color: matched ? '#00f2fe' : '#ff5e36', weight: matched ? 5 : 3, dashArray: matched ? undefined : '8 8' }} /> : null}
            </React.Fragment>
          );
        })}
      </MapContainer>
      <Text className="text-[#8eb4c6] text-[10px] font-bold px-3 py-2">Select a pin to inspect the request and route</Text>
    </View>
  );
}