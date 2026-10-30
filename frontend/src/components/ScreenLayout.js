import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Text, Image, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from './BottomNav';
import { ArrowLeftIcon } from './Icons';

export default function ScreenLayout({ navigation, route, children, refreshControl, showsVerticalScrollIndicator = true, className = "", bgImage, hideBottomNav = false }) {
  const canGoBack = navigation?.canGoBack?.() ?? false;

  return (
    <SafeAreaView className="flex-1 bg-[#050c1a] relative">
      {/* Fixed Full Screen Background Image */}
      {bgImage && (
        <View
          className="absolute inset-0 z-0 overflow-hidden"
          style={Platform.OS === 'web' ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' } : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <ImageBackground
            source={bgImage}
            className="w-full h-full flex-1"
            resizeMode="cover"
            imageStyle={{ width: '100%', height: '100%' }}
          >
            <View className="absolute inset-0 bg-[#050c1a]/75" />
          </ImageBackground>
        </View>
      )}

      {/* Main Content Layout Overlay */}
      <KeyboardAvoidingView
        className="flex-1 relative z-10"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          className="flex-1"
          style={Platform.OS === 'web' ? { flex: 1, minHeight: '100%', overflowY: 'auto' } : { flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: hideBottomNav ? 32 : 110 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        >
          {/* RESPONSIVE CONTAINER */}
          <View className={`w-full self-center max-w-3xl px-4 md:px-6 py-2 ${className}`}>
            {/* Header Navigation Bar */}
            <View className="pt-2 pb-4 flex-row justify-between items-center">
              {canGoBack ? (
                <TouchableOpacity
                  className="px-4 py-2 rounded-full bg-black/40 border border-white/20 active:bg-white/20 flex-row items-center gap-2 shadow-lg backdrop-blur-md"
                  onPress={() => navigation.goBack()}
                >
                  <ArrowLeftIcon size={16} color="#00f2fe" />
                  <Text className="text-[#d8f4ff] font-extrabold text-xs tracking-wider uppercase">Back</Text>
                </TouchableOpacity>
              ) : (
                <View className="flex-row items-center gap-2.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                  <Image
                    source={require('../../assets/icon.png')}
                    resizeMode="contain"
                    style={{ width: 32, height: 32, borderRadius: 10 }}
                  />
                  <Text className="text-white font-black text-lg tracking-wider">VEX<Text className="text-[#00f2fe]">RIDE</Text></Text>
                </View>
              )}

            </View>

            {/* Screen Content */}
            <View className="flex-1 w-full">
              {children}
            </View>
          </View>
        </ScrollView>

        {!hideBottomNav && navigation && <BottomNav navigation={navigation} activeRoute={route?.name} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}