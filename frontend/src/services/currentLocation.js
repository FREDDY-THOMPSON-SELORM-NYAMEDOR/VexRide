import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { getJson } from './api';

export async function getCurrentLocation() {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      return enrichLocation(position.coords.latitude, position.coords.longitude);
    } catch (_error) {
      return getApproximateLocation();
    }
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return getApproximateLocation();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return enrichLocation(position.coords.latitude, position.coords.longitude);
}

async function getApproximateLocation() {
  const result = await getJson('/places/ip');
  const location = result.location || {};
  return { ...location, label: location.label || 'Approximate current area' };
}

async function enrichLocation(latitude, longitude) {
  const result = await getJson(`/places/reverse?lat=${latitude}&lon=${longitude}`);
  const location = result.location || {};
  return {
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    label: location.label || `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    subtitle: location.subtitle,
    city: location.city || null,
    region: location.region || null,
    country: location.country || null
  };
}