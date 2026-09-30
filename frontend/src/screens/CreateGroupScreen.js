import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { getJson, postJson } from '../services/api';
import ScreenLayout from '../components/ScreenLayout';
import { getStoredUser } from '../services/user';
import { GroupsIcon, PinIcon, FlagIcon, CalendarIcon, ClockIcon, WalletIcon, UsersIcon, ZapIcon, InfoIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';
import LocationPickerMap from '../components/LocationPickerMap';

const heroImage = require('../../assets/images/vex_groups_bg_1784946398517.jpg');

export default function CreateGroupScreen({ navigation, route }) {
  const [location, setLocation] = useState('Aqua Safari');
  const [origin, setOrigin] = useState('Madina');
  const [scheduleDate, setScheduleDate] = useState('2026-07-20');
  const [time, setTime] = useState('7:00 PM');
  const [joinDeadline, setJoinDeadline] = useState('2026-07-19T18:00');
  const [budget, setBudget] = useState('30');
  const [maxMembers, setMaxMembers] = useState('4');
  const [message, setMessage] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [locationPickerField, setLocationPickerField] = useState(null);
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);
  const [locationValues, setLocationValues] = useState({ destination: null, origin: null });
  const [activeLocationField, setActiveLocationField] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [pickerField, setPickerField] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);
  const [draftDate, setDraftDate] = useState(scheduleDate);
  const [draftTime, setDraftTime] = useState(time);

  const hourOptions = ['7', '8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6'];
  const minuteOptions = ['00', '15', '30', '45'];
  const periodOptions = ['AM', 'PM'];
  const dateOptions = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return date.toISOString().slice(0, 10);
  });

  useEffect(() => { (async () => setCurrentUser(await getStoredUser()))() }, []);

  function openDatePicker(field) {
    setPickerField(field);
    setPickerMode('date');
    setDraftDate(field === 'scheduleDate' ? scheduleDate : joinDeadline.slice(0, 10));
  }

  function openTimePicker(field) {
    setPickerField(field);
    setPickerMode('time');
    setDraftTime(field === 'time' ? time : from24Hour(joinDeadline.slice(11, 16)));
  }

  function applyPicker() {
    if (pickerMode === 'date') {
      if (pickerField === 'scheduleDate') setScheduleDate(draftDate);
      if (pickerField === 'joinDeadline') setJoinDeadline(`${draftDate}T${to24Hour(draftTime)}`);
    }
    if (pickerMode === 'time') {
      if (pickerField === 'time') setTime(draftTime);
      if (pickerField === 'joinDeadline') setJoinDeadline(`${joinDeadline.slice(0, 10)}T${to24Hour(draftTime)}`);
    }
    setPickerField(null);
    setPickerMode(null);
  }

  function to24Hour(value) {
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '18:00';
    let hour = Number(match[1]);
    if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${match[2]}`;
  }

  function from24Hour(value) {
    const [rawHour, minutes] = value.split(':');
    const hour = Number(rawHour);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  const activeLocationValue = activeLocationField === 'destination' ? location : origin;

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
      } catch (error) {
        if (active) setLocationSuggestions([]);
        logError('Search group locations', error);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeLocationField, activeLocationValue]);

  function updateLocationText(field, value) {
    setLocationValues((previous) => ({ ...previous, [field]: null }));
    if (field === 'destination') setLocation(value);
    if (field === 'origin') setOrigin(value);
    setActiveLocationField(field);
  }

  function selectLocation(place) {
    setLocationValues((previous) => ({
      ...previous,
      [activeLocationField]: {
        label: place.label,
        subtitle: place.subtitle,
        latitude: place.latitude,
        longitude: place.longitude
      }
    }));
    if (activeLocationField === 'destination') setLocation(place.label);
    if (activeLocationField === 'origin') setOrigin(place.label);
    setActiveLocationField(null);
    setLocationSuggestions([]);
  }

  async function handleMapLocationSelect(coordinate) {
    const field = locationPickerField;
    const fallbackLabel = `Pinned location (${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)})`;
    setLocationLookupLoading(true);
    try {
      const result = await getJson(`/places/reverse?lat=${coordinate.latitude}&lon=${coordinate.longitude}`);
      const label = result.location?.label || fallbackLabel;
      setLocationValues((previous) => ({ ...previous, [field]: { ...coordinate, label } }));
      if (field === 'destination') setLocation(label);
      if (field === 'origin') setOrigin(label);
    } catch (error) {
      logError('Identify group map location', error);
      setLocationValues((previous) => ({ ...previous, [field]: coordinate }));
      if (field === 'destination') setLocation(fallbackLabel);
      if (field === 'origin') setOrigin(fallbackLabel);
    } finally {
      setLocationLookupLoading(false);
    }
  }

  async function handleCreate() {
    try {
      setMessage('Creating group...');
      await postJson('/createGroup', {
        location: location.trim(), origin: origin.trim(), scheduleDate: scheduleDate.trim(),
        budget: Number(budget), maxMembers: Number(maxMembers), time: time.trim(),
        joinDeadline: joinDeadline.trim(), split_rules: 'Even split', userId: currentUser?.id
      });
      navigation.navigate('BrowseGroups');
    } catch (error) { logError('Create group', error); setMessage(friendlyError(error, 'Could not create the group. Please try again.')); }
  }

  const numericFields = [
    ['Total Group Budget (GHS)', budget, setBudget, 'Total budget', WalletIcon],
    ['Maximum Members', maxMembers, setMaxMembers, 'Max riders allowed', UsersIcon],
  ];
  const draftTimeParts = draftTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)?.slice(1) || ['7', '00', 'PM'];
  const draftHour = draftTimeParts[0];
  const draftMinutes = draftTimeParts[1];
  const draftPeriod = draftTimeParts[2].toUpperCase();

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="w-full max-w-lg self-center bg-[#0b172a]/95 rounded-3xl p-5 md:p-6 border border-[#00f2fe]/30 shadow-2xl backdrop-blur-xl py-2">

        {/* Form Title */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="w-10 h-10 rounded-2xl bg-[#ff5e36]/20 border border-[#ff5e36]/40 items-center justify-center flex-shrink-0">
            <GroupsIcon size={20} color="#ff5e36" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-xl font-black text-white">Create Live Group</Text>
            <Text className="text-[#8eb4c6] text-xs">Set your route, budget & invite riders</Text>
          </View>
        </View>

        {/* Route selectors */}
        {[
          ['Destination Location', location, 'destination', PinIcon],
          ['Pickup Origin', origin, 'origin', FlagIcon],
        ].map(([label, value, field, FieldIcon]) => (
          <View key={label} className="mb-4">
            <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">{label}</Text>
            <View className="bg-white/[0.06] rounded-2xl px-4 py-3.5 border border-white/[0.12] flex-row items-start gap-2.5">
              <FieldIcon size={16} color="#8eb4c6" />
              <View className="flex-1 min-w-0">
                <TextInput
                  className="text-white font-bold text-sm p-0"
                  placeholder="Search for a place"
                  placeholderTextColor="#688ca0"
                  value={value}
                  onChangeText={(text) => updateLocationText(field, text)}
                  onFocus={() => setActiveLocationField(field)}
                />
                {activeLocationField === field && locationSuggestions.length > 0 ? (
                  <View className="mt-2 border-t border-white/[0.1] pt-1">
                    {locationSuggestions.map((place) => (
                      <TouchableOpacity key={place.id} className="py-2" onPress={() => selectLocation(place)}>
                        <Text className="text-white text-xs font-bold" numberOfLines={1}>{place.label}</Text>
                        {place.subtitle ? <Text className="text-[#8eb4c6] text-[10px] mt-0.5" numberOfLines={1}>{place.subtitle}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity className="mt-1 self-start" onPress={() => setLocationPickerField(field)}>
                  <Text className="text-[#00f2fe] text-[10px] font-black">Choose on map</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-[#00f2fe] text-lg font-black">›</Text>
            </View>
          </View>
        ))}

        {/* Date and time selectors */}
        {[
          ['Schedule Date', scheduleDate, 'scheduleDate', CalendarIcon, openDatePicker],
          ['Departure Time', time, 'time', ClockIcon, openTimePicker],
          ['Join Deadline', `${joinDeadline.slice(0, 10)} ${from24Hour(joinDeadline.slice(11, 16))}`, 'joinDeadline', ClockIcon, openDatePicker],
        ].map(([label, value, field, FieldIcon, openPicker]) => (
          <View key={label} className="mb-4">
            <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">{label}</Text>
            <TouchableOpacity className="bg-white/[0.06] rounded-2xl px-4 py-3.5 border border-white/[0.12] flex-row items-center gap-2.5" onPress={() => openPicker(field)}>
              <FieldIcon size={16} color="#8eb4c6" />
              <Text className="flex-1 text-white font-bold text-sm">{value}</Text>
              <Text className="text-[#00f2fe] text-lg font-black">›</Text>
            </TouchableOpacity>
            {field === 'joinDeadline' ? (
              <TouchableOpacity className="mt-1 self-start" onPress={() => openTimePicker(field)}>
                <Text className="text-[#00f2fe] text-[10px] font-black">Choose deadline time</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        {numericFields.map(([label, val, setter, ph, FieldIcon]) => (
          <View key={label} className="mb-4">
            <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">{label}</Text>
            <View className="bg-white/[0.06] rounded-2xl px-4 py-3 border border-white/[0.12] flex-row items-center gap-2.5">
              <FieldIcon size={16} color="#8eb4c6" />
              <TextInput className="flex-1 text-white font-bold text-sm p-0" placeholder={ph} placeholderTextColor="#688ca0" value={val} onChangeText={setter} keyboardType="numeric" />
            </View>
          </View>
        ))}

        <Modal visible={Boolean(locationPickerField)} transparent animationType="fade" onRequestClose={() => setLocationPickerField(null)}>
          <View className="flex-1 bg-[#050c1a]/85 items-center justify-center px-5">
            <View className="w-full max-w-lg bg-[#0b172a] border border-[#00f2fe]/35 rounded-3xl p-5">
              <Text className="text-white text-lg font-black mb-1">Choose {locationPickerField === 'origin' ? 'pickup' : 'destination'} on map</Text>
              <Text className="text-[#8eb4c6] text-xs mb-4">Tap the map to set the exact meeting point.</Text>
              <LocationPickerMap value={locationValues[locationPickerField]} onSelect={handleMapLocationSelect} />
              {locationLookupLoading ? <Text className="text-[#00f2fe] text-xs font-bold text-center mt-3">Finding the area...</Text> : null}
              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-white/[0.06] border border-white/[0.12] items-center" onPress={() => setLocationPickerField(null)}><Text className="text-[#c9e5f4] font-extrabold text-sm">Cancel</Text></TouchableOpacity>
                <TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-[#ff5e36] items-center" onPress={() => setLocationPickerField(null)} disabled={locationLookupLoading}><Text className="text-white font-black text-sm">Use location</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={Boolean(pickerField)} transparent animationType="fade" onRequestClose={() => setPickerField(null)}>
          <View className="flex-1 bg-[#050c1a]/85 items-center justify-center px-5">
            <View className="w-full max-w-sm bg-[#0b172a] border border-[#00f2fe]/35 rounded-3xl p-5">
              <Text className="text-white text-lg font-black mb-4">Choose {pickerMode === 'date' ? 'date' : 'time'}</Text>
              {pickerMode === 'date' ? (
                <View className="flex-row flex-wrap gap-2">
                  {dateOptions.map((date) => <TouchableOpacity key={date} className={`w-[31%] py-3 rounded-xl items-center border ${draftDate === date ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-white/[0.05] border-white/[0.12]'}`} onPress={() => setDraftDate(date)}><Text className={`font-black text-xs ${draftDate === date ? 'text-[#061426]' : 'text-white'}`}>{date}</Text></TouchableOpacity>)}
                </View>
              ) : (
                <>
                  <View className="flex-row flex-wrap gap-2">{hourOptions.map((hour) => <TouchableOpacity key={hour} className={`w-11 py-2.5 rounded-xl items-center border ${draftHour === hour ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-white/[0.05] border-white/[0.12]'}`} onPress={() => setDraftTime(`${hour}:${draftMinutes} ${draftPeriod}`)}><Text className={`font-black text-sm ${draftHour === hour ? 'text-[#061426]' : 'text-white'}`}>{hour}</Text></TouchableOpacity>)}</View>
                  <View className="flex-row gap-2 mt-4">{minuteOptions.map((minutes) => <TouchableOpacity key={minutes} className={`flex-1 py-2.5 rounded-xl items-center border ${draftMinutes === minutes ? 'bg-[#00f2fe] border-[#00f2fe]' : 'bg-white/[0.05] border-white/[0.12]'}`} onPress={() => setDraftTime(`${draftHour}:${minutes} ${draftPeriod}`)}><Text className="text-white font-black text-sm">{minutes}</Text></TouchableOpacity>)}</View>
                  <View className="flex-row gap-2 mt-4">{periodOptions.map((period) => <TouchableOpacity key={period} className={`flex-1 py-2.5 rounded-xl items-center border ${draftPeriod === period ? 'bg-[#ff5e36] border-[#ff5e36]' : 'bg-white/[0.05] border-white/[0.12]'}`} onPress={() => setDraftTime(`${draftHour}:${draftMinutes} ${period}`)}><Text className="text-white font-black text-sm">{period}</Text></TouchableOpacity>)}</View>
                </>
              )}
              <View className="flex-row gap-3 mt-5"><TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-white/[0.06] items-center" onPress={() => setPickerField(null)}><Text className="text-[#c9e5f4] font-extrabold text-sm">Cancel</Text></TouchableOpacity><TouchableOpacity className="flex-1 py-3.5 rounded-2xl bg-[#ff5e36] items-center" onPress={applyPicker}><Text className="text-white font-black text-sm">Apply</Text></TouchableOpacity></View>
            </View>
          </View>
        </Modal>

        {/* Split Info Badge */}
        <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 p-3 rounded-2xl mb-4 flex-row items-center gap-2">
          <InfoIcon size={16} color="#00f2fe" />
          <Text className="text-[#00f2fe] text-xs font-bold flex-1">
            Even Split Rule: Each rider pays GHS {Math.max(1, Math.round(Number(budget || 0) / Math.max(1, Number(maxMembers || 1))))}
          </Text>
        </View>

        {message ? (
          <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 p-3 rounded-2xl mb-4">
            <Text className="text-[#00f2fe] text-xs font-bold text-center">{message}</Text>
          </View>
        ) : null}

        {/* Create Button */}
        <TouchableOpacity
          className="bg-[#ff5e36] border border-[#ff5e36]/60 p-4 rounded-2xl mt-2 items-center shadow-xl active:scale-98 flex-row justify-center gap-2"
          onPress={handleCreate}
        >
          <ZapIcon size={18} color="#ffffff" />
          <Text className="text-white font-black text-base tracking-wide">Create Group Crew</Text>
        </TouchableOpacity>

      </View>
    </ScreenLayout>
  );
}