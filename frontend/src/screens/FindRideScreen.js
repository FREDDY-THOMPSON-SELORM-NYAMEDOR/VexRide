import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { getJson, postJson } from '../services/api';
import ScreenLayout from '../components/ScreenLayout';
import { getStoredUser } from '../services/user';
import { clearSearchSession, getSearchSession, saveSearchSession } from '../services/searchSession';
import { SearchIcon, PinIcon, FlagIcon, ClockIcon, ZapIcon } from '../components/Icons';
import LocationPickerMap from '../components/LocationPickerMap';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

export default function FindRideScreen({ navigation, route }) {
  const [origin, setOrigin] = useState('Madina');
  const [destination, setDestination] = useState('University of Ghana');
  const [time, setTime] = useState('9:30 AM');
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [draftTime, setDraftTime] = useState('9:30 AM');
  const [loading, setLoading] = useState(false);
  const [activeSearch, setActiveSearch] = useState(false);
  const [error, setError] = useState('');
  const [APP_USER, setAPP_USER] = useState({});
  const [activeLocationField, setActiveLocationField] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [originLocation, setOriginLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [locationPickerField, setLocationPickerField] = useState(null);
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function restoreSearchSession() {
      const savedSearch = await getSearchSession();
      if (!active || !savedSearch) return;
      setOrigin(savedSearch.origin || '');
      setDestination(savedSearch.destination || '');
      setOriginLocation(savedSearch.originLocation || null);
      setDestinationLocation(savedSearch.destinationLocation || null);
      setTime(savedSearch.time || '');
      setActiveSearch(savedSearch.active === true);
    }

    async function loadUser() {
      const user = await getStoredUser();
      if (active) setAPP_USER(user || {});
    }

    restoreSearchSession();
    loadUser();
    const unsubscribe = navigation.addListener('focus', restoreSearchSession);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigation]);

  const activeLocationValue = activeLocationField === 'origin' ? origin : destination;

  useEffect(() => {
    if (!activeLocationField || activeLocationValue.trim().length < 2) {
      setLocationSuggestions([]);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await getJson(`/places/search?q=${encodeURIComponent(activeLocationValue.trim())}`);
        if (active) setLocationSuggestions(result.locations || []);
      } catch (searchError) {
        if (active) setLocationSuggestions([]);
        logError('Search locations', searchError);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeLocationField, activeLocationValue]);

  function selectLocation(place) {
    if (activeLocationField === 'origin') {
      setOrigin(place.label);
      setOriginLocation({ latitude: place.latitude, longitude: place.longitude });
    }
    if (activeLocationField === 'destination') {
      setDestination(place.label);
      setDestinationLocation({ latitude: place.latitude, longitude: place.longitude });
    }
    setActiveLocationField(null);
    setLocationSuggestions([]);
  }

  function updateLocationText(field, value) {
    if (field === 'origin') {
      setOrigin(value);
      setOriginLocation(null);
    } else {
      setDestination(value);
      setDestinationLocation(null);
    }
    setActiveLocationField(field);
  }

  async function handleMapLocationSelect(coordinate) {
    const selectedField = locationPickerField;
    const fallbackLabel = `Pinned location (${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)})`;
    setLocationLookupLoading(true);
    try {
      const result = await getJson(`/places/reverse?lat=${coordinate.latitude}&lon=${coordinate.longitude}`);
      const label = result.location?.label || fallbackLabel;
      const selectedLocation = { ...coordinate, label, subtitle: result.location?.subtitle };
      if (selectedField === 'origin') {
        setOrigin(label);
        setOriginLocation(selectedLocation);
      } else {
        setDestination(label);
        setDestinationLocation(selectedLocation);
      }
    } catch (lookupError) {
      logError('Identify map location', lookupError);
      if (selectedField === 'origin') {
        setOrigin(fallbackLabel);
        setOriginLocation(coordinate);
      } else {
        setDestination(fallbackLabel);
        setDestinationLocation(coordinate);
      }
    } finally {
      setLocationLookupLoading(false);
    }
  }

  async function handleFindRide() {
    try {
      setLoading(true); setError('');
      const search = {
        origin: origin.trim(),
        destination: destination.trim(),
        originLocation,
        destinationLocation,
        time: time.trim(),
        active: true,
        startedAt: Date.now()
      };
      await saveSearchSession(search);
      setActiveSearch(true);
      const data = await postJson('/findRide', {
        origin: origin.trim(),
        destination: destination.trim(),
        time: time.trim(),
        originLatitude: originLocation?.latitude,
        originLongitude: originLocation?.longitude,
        destinationLatitude: destinationLocation?.latitude,
        destinationLongitude: destinationLocation?.longitude,
        userName: APP_USER.name,
        userEmail: APP_USER.email
      });
      await saveSearchSession({ ...search, requestId: data.request?.id });
      if (data.match) await clearSearchSession();
      console.log(data)
      navigation.navigate('MatchResult', { origin, destination, time, match: data.match, request: data.request });
    } catch (err) { logError('Find ride', err); setError(friendlyError(err, 'Could not find a ride. Please try again.')); } finally { setLoading(false); }
  }

  async function handleCancelSearch() {
    let savedSearch = null;
    try {
      savedSearch = await getSearchSession();
    } catch (error) {
      logError('Read search session', error);
    }
    setActiveSearch(false);
    setError('');
    await clearSearchSession();

    try {
      if (savedSearch?.requestId && APP_USER?.id) {
        await postJson('/cancelRide', { requestId: savedSearch.requestId, userId: APP_USER.id });
      }
    } catch (err) {
      logError('Cancel search', err);
    }
  }

  function openTimePicker() {
    setDraftTime(time || '9:30 AM');
    setTimeModalVisible(true);
  }

  function applyTime() {
    setTime(draftTime);
    setTimeModalVisible(false);
  }

  const [draftHour, draftMinutes = '30', draftPeriod = 'AM'] = draftTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)?.slice(1) || ['9', '30', 'AM'];
  const hourOptions = ['7', '8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6'];
  const minuteOptions = ['00', '15', '30', '45'];
  const periodOptions = ['AM', 'PM'];

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="flex-1 justify-center py-2">
        <View className="w-full max-w-md self-center bg-[#0b172a]/95 rounded-3xl p-5 md:p-6 border border-[#00f2fe]/30 shadow-2xl backdrop-blur-xl">

          {/* Header */}
          <View className="flex-row items-center gap-3 mb-4">
            <View className="w-10 h-10 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/40 items-center justify-center flex-shrink-0">
              <SearchIcon size={20} color="#00f2fe" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-xl font-black text-white">Find Your Ride</Text>
              <Text className="text-[#8eb4c6] text-xs">Search live shared routes nearby</Text>
            </View>
          </View>

          {/* Visual Connected Route Card */}
          <View className="bg-white/[0.04] p-4 rounded-2xl border border-white/[0.08] mb-4">
            <View className="flex-row items-center gap-3 mb-3">
              <PinIcon size={18} color="#00f2fe" />
              <View className="flex-1 min-w-0 bg-[#061426]/70 rounded-xl border border-white/[0.14] px-3 py-2">
                <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Pick-up Origin</Text>
                <TextInput
                  className="text-white font-extrabold text-sm md:text-base p-0 pt-1"
                  placeholder="Enter pickup location"
                  placeholderTextColor="#688ca0"
                  value={origin}
                  onChangeText={(value) => updateLocationText('origin', value)}
                  onFocus={() => setActiveLocationField('origin')}
                />
                {activeLocationField === 'origin' && locationSuggestions.length > 0 ? (
                  <View className="mt-2 border-t border-white/[0.1] pt-1">
                    {locationSuggestions.map((place) => (
                      <TouchableOpacity key={place.id} className="py-2" onPress={() => selectLocation(place)}>
                        <Text className="text-white text-xs font-bold" numberOfLines={1}>{place.label}</Text>
                        {place.subtitle ? <Text className="text-[#8eb4c6] text-[10px] mt-0.5" numberOfLines={1}>{place.subtitle}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                  <TouchableOpacity className="mt-1 self-start" onPress={() => setLocationPickerField('origin')}>
                    <Text className="text-[#00f2fe] text-[10px] font-black">Choose on map</Text>
                  </TouchableOpacity>
              </View>
            </View>

            <View className="h-4 w-0.5 bg-[#00f2fe]/40 ml-2 my-[-2px]" />

            <View className="flex-row items-center gap-3">
              <FlagIcon size={18} color="#ff5e36" />
              <View className="flex-1 min-w-0 bg-[#061426]/70 rounded-xl border border-white/[0.14] px-3 py-2">
                <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Drop-off Destination</Text>
                <TextInput
                  className="text-white font-extrabold text-sm md:text-base p-0 pt-1"
                  placeholder="Enter destination"
                  placeholderTextColor="#688ca0"
                  value={destination}
                  onChangeText={(value) => updateLocationText('destination', value)}
                  onFocus={() => setActiveLocationField('destination')}
                />
                {activeLocationField === 'destination' && locationSuggestions.length > 0 ? (
                  <View className="mt-2 border-t border-white/[0.1] pt-1">
                    {locationSuggestions.map((place) => (
                      <TouchableOpacity key={place.id} className="py-2" onPress={() => selectLocation(place)}>
                        <Text className="text-white text-xs font-bold" numberOfLines={1}>{place.label}</Text>
                        {place.subtitle ? <Text className="text-[#8eb4c6] text-[10px] mt-0.5" numberOfLines={1}>{place.subtitle}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                  <TouchableOpacity className="mt-1 self-start" onPress={() => setLocationPickerField('destination')}>
                    <Text className="text-[#00f2fe] text-[10px] font-black">Choose on map</Text>
                  </TouchableOpacity>
              </View>
            </View>
          </View>

            <Modal
              visible={Boolean(locationPickerField)}
              transparent
              animationType="fade"
              onRequestClose={() => setLocationPickerField(null)}
            >
              <View className="flex-1 bg-[#050c1a]/85 items-center justify-center px-5">
                <View className="w-full max-w-lg bg-[#0b172a] border border-[#00f2fe]/35 rounded-3xl p-5 shadow-2xl">
                  <Text className="text-white text-lg font-black mb-1">Choose {locationPickerField === 'origin' ? 'pickup' : 'destination'} on map</Text>
                  <Text className="text-[#8eb4c6] text-xs mb-4">Pick a nearby point so riders can match within walking distance.</Text>
                  <LocationPickerMap
                    value={locationPickerField === 'origin' ? originLocation : destinationLocation}
                    onSelect={handleMapLocationSelect}
                  />
                  {locationLookupLoading ? <Text className="text-[#00f2fe] text-xs font-bold text-center mt-3">Finding the area and city...</Text> : null}
                  <View className="flex-row gap-3 mt-4">
                    <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-white/[0.06] border border-white/[0.12] items-center" onPress={() => setLocationPickerField(null)}>
                      <Text className="text-[#c9e5f4] font-extrabold text-sm">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-[#ff5e36] border border-[#ff5e36]/60 items-center" onPress={() => setLocationPickerField(null)} disabled={locationLookupLoading}>
                      <Text className="text-white font-black text-sm">Use this location</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

          {/* Departure Time */}
          <View className="mb-5">
            <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Departure Time</Text>
            <TouchableOpacity
              className="bg-[#061426]/70 rounded-2xl px-4 py-3.5 border border-white/[0.16] flex-row items-center gap-2.5 active:border-[#00f2fe]"
              onPress={openTimePicker}
              accessibilityRole="button"
              accessibilityLabel="Choose departure time"
            >
              <ClockIcon size={18} color="#8eb4c6" />
              <View className="flex-1">
                <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Ready to leave at</Text>
                <Text className="text-white font-extrabold text-sm pt-1">{time || 'Choose a time'}</Text>
              </View>
              <Text className="text-[#00f2fe] text-lg font-black">›</Text>
            </TouchableOpacity>
          </View>

          <Modal
            visible={timeModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setTimeModalVisible(false)}
          >
            <View className="flex-1 bg-[#050c1a]/85 items-center justify-center px-5">
              <View className="w-full max-w-sm bg-[#0b172a] border border-[#00f2fe]/35 rounded-3xl p-5 shadow-2xl">
                <View className="flex-row items-center gap-3 mb-1">
                  <View className="w-10 h-10 rounded-2xl bg-[#00f2fe]/15 border border-[#00f2fe]/35 items-center justify-center">
                    <ClockIcon size={19} color="#00f2fe" />
                  </View>
                  <View>
                    <Text className="text-white text-lg font-black">Departure time</Text>
                    <Text className="text-[#8eb4c6] text-xs">When should we look for your ride?</Text>
                  </View>
                </View>

                <Text className="text-[#c9e5f4] text-xs font-extrabold mt-5 mb-2">Hour</Text>
                <View className="flex-row flex-wrap gap-2">
                  {hourOptions.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      className={`w-11 py-2.5 rounded-xl items-center border ${draftHour === hour ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-white/[0.05] border-white/[0.12]'}`}
                      onPress={() => setDraftTime(`${hour}:${draftMinutes} ${draftPeriod}`)}
                    >
                      <Text className={`font-black text-sm ${draftHour === hour ? 'text-[#061426]' : 'text-white'}`}>{hour}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-[#c9e5f4] text-xs font-extrabold mt-4 mb-2">Minutes</Text>
                <View className="flex-row gap-2">
                  {minuteOptions.map((minutes) => (
                    <TouchableOpacity
                      key={minutes}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${draftMinutes === minutes ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-white/[0.05] border-white/[0.12]'}`}
                      onPress={() => setDraftTime(`${draftHour}:${minutes} ${draftPeriod}`)}
                    >
                      <Text className={`font-black text-sm ${draftMinutes === minutes ? 'text-[#061426]' : 'text-white'}`}>{minutes}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="flex-row gap-2 mt-4">
                  {periodOptions.map((period) => (
                    <TouchableOpacity
                      key={period}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${draftPeriod.toUpperCase() === period ? 'bg-[#ff5e36] border-[#ff5e36]' : 'bg-white/[0.05] border-white/[0.12]'}`}
                      onPress={() => setDraftTime(`${draftHour}:${draftMinutes} ${period}`)}
                    >
                      <Text className="text-white font-black text-sm">{period}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="flex-row gap-3 mt-5">
                  <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-white/[0.06] border border-white/[0.12] items-center" onPress={() => setTimeModalVisible(false)}>
                    <Text className="text-[#c9e5f4] font-extrabold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-[#ff5e36] border border-[#ff5e36]/60 items-center" onPress={applyTime}>
                    <Text className="text-white font-black text-sm">Apply time</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Error Message */}
          {error ? (
            <View className="bg-[#ff5e36]/15 border border-[#ff5e36]/40 p-3 rounded-2xl mb-4">
              <Text className="text-[#ff7a5c] font-bold text-xs text-center">{error}</Text>
            </View>
          ) : null}

          {activeSearch ? (
            <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 p-3 rounded-2xl mb-4 flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#ff5e36" />
              <Text className="flex-1 text-[#c9e5f4] font-bold text-xs">
                Your search is still active. You can switch screens and return here anytime.
              </Text>
            </View>
          ) : null}

          {/* Submit Action */}
          <TouchableOpacity
            className={`py-3.5 rounded-2xl items-center shadow-xl flex-row justify-center gap-2 ${
              loading || activeSearch ? 'bg-[#ff5e36]/50' : 'bg-[#ff5e36] border border-[#ff5e36]/60 active:scale-98'
            }`}
            onPress={activeSearch ? handleCancelSearch : handleFindRide}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white font-black text-sm md:text-base tracking-wide">
                  {activeSearch ? 'Cancel Search' : 'Search Matches'}
                </Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </ScreenLayout>
  );
}