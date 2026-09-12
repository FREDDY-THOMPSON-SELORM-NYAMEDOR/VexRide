import React from 'react';
import { View, TouchableOpacity, Text, Platform } from 'react-native';
import { HomeIcon, SearchIcon, TrackingIcon, GroupsIcon } from './Icons';
import { useUnreadCount } from '../services/chatBadge';

const navItems = [
  { name: 'Home', label: 'Home', IconComponent: HomeIcon },
  { name: 'FindRide', label: 'Search', IconComponent: SearchIcon },
  { name: 'TrackingHub', label: 'Tracking', IconComponent: TrackingIcon },
  { name: 'BrowseGroups', label: 'Groups', IconComponent: GroupsIcon }
];

export default function BottomNav({ navigation, activeRoute }) {
  const unreadCount = useUnreadCount();

  return (
    <View
      className="w-full left-0 right-0 z-50 items-center justify-center px-4 pb-3 pt-1"
      style={
        Platform.OS === 'web'
          ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999 }
          : { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 999 }
      }
    >
      <View className="w-full max-w-md bg-[#07162b]/95 border border-[#00f2fe]/40 rounded-full px-2 py-2 flex-row justify-around items-center shadow-2xl shadow-[#00f2fe]/30 backdrop-blur-2xl">
        {navItems.map((item) => {
          const active = item.name === 'TrackingHub'
            ? ['TrackingHub', 'MyRequests', 'RideTracking'].includes(activeRoute)
            : activeRoute === item.name;
          const { IconComponent } = item;
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => navigation.navigate(item.name)}
              activeOpacity={0.8}
              className={`flex-1 items-center justify-center py-2 px-2 sm:px-4 rounded-full flex-row gap-1.5 transition-all ${
                active
                  ? 'bg-[#00f2fe] border border-[#00f2fe] shadow-lg shadow-[#00f2fe]/40 scale-105'
                  : 'bg-transparent active:bg-white/[0.08]'
              }`}
            >
              <IconComponent size={17} color={active ? '#050c1a' : '#8eb4c6'} />
              <View className="flex-row items-center gap-1.5">
                <Text
                  numberOfLines={1}
                  className={`font-black text-xs tracking-wider ${
                    active ? 'text-[#050c1a]' : 'text-[#8eb4c6]'
                  }`}
                >
                  {item.label}
                </Text>
                {item.name === 'TrackingHub' && unreadCount > 0 ? (
                  <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center">
                    <Text className="text-white text-[10px] font-black">{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}