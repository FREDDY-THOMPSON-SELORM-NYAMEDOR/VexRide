import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { postJson } from '../services/api';
import { saveUser } from '../services/user';
import ScreenLayout from '../components/ScreenLayout';
import { LockIcon, ZapIcon, ArrowLeftIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_auth_bg_1784946380935.jpg');

export default function AuthScreen({ navigation, route }) {
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit() {
    try {
      setLoading(true);
      setMessage('');
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const body = mode === 'signup' ? { name, email, phone, password } : { email, password };
      if (mode === 'signup') {
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
        if (password !== confirmPassword) throw new Error('Passwords do not match');
      }
      const result = await postJson(endpoint, body);
      await saveUser(result.user);
      navigation.replace('Home');
    } catch (error) {
      logError('Authentication', error);
      setMessage(friendlyError(error, 'Authentication failed. Please check your details and try again.'));
    } finally {
      setLoading(false);
    }
  }

  const canGoBack = navigation?.canGoBack?.() ?? false;
  const strengthInfo = passwordStrength(password);

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage} hideBottomNav={true}>
      <View className="flex-1 justify-center py-4 px-2">
        <View className="w-full max-w-md self-center bg-[#0b172a]/95 rounded-3xl p-6 md:p-8 border border-[#00f2fe]/30 shadow-2xl backdrop-blur-xl">

          {/* Previous Button */}
          {canGoBack && (
            <TouchableOpacity
              className="self-start px-3.5 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.15] mb-5 flex-row items-center gap-1.5"
              onPress={() => navigation.goBack()}
            >
              <ArrowLeftIcon size={14} color="#00f2fe" />
              <Text className="text-[#c9e5f4] font-extrabold text-[10px] tracking-wider uppercase">Previous</Text>
            </TouchableOpacity>
          )}

          {/* Brand Header */}
          <View className="items-center mb-6">
            <View className="w-12 h-12 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 items-center justify-center mb-3 shadow-lg">
              <ZapIcon size={24} color="#06ecf8" />
            </View>
            <Text className="text-2xl font-black text-white tracking-tight">
              {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
            </Text>
            <Text className="text-[#8eb4c6] text-xs text-center mt-1">
              {mode === 'signup' ? 'Create an account to find and plan rides with others' : 'Sign in to manage your rides'}
            </Text>
          </View>

          {/* Mode Switcher Tabs */}
          <View className="flex-row bg-[#050e1d] p-1.5 rounded-2xl border border-white/[0.08] mb-6">
            <TouchableOpacity
              className={`flex-1 py-2.5 rounded-xl items-center ${mode === 'signup' ? 'bg-[#00f2fe] shadow-md' : ''}`}
              onPress={() => setMode('signup')}
            >
              <Text className={`font-black text-xs ${mode === 'signup' ? 'text-[#050c1a]' : 'text-[#8eb4c6]'}`}>Sign Up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-2.5 rounded-xl items-center ${mode === 'login' ? 'bg-[#00f2fe] shadow-md' : ''}`}
              onPress={() => setMode('login')}
            >
              <Text className={`font-black text-xs ${mode === 'login' ? 'text-[#050c1a]' : 'text-[#8eb4c6]'}`}>Log In</Text>
            </TouchableOpacity>
          </View>

          {/* Signup Specific Fields */}
          {mode === 'signup' && (
            <>
              <View className="mb-4">
                <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Full Name</Text>
                <TextInput
                  className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm"
                  placeholder="Jane Doe"
                  placeholderTextColor="#688ca0"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View className="mb-4">
                <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Phone Number</Text>
                <TextInput
                  className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm"
                  placeholder="+233 24 123 4567"
                  placeholderTextColor="#688ca0"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <View className="mb-4">
                <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Password</Text>
                <View className="relative justify-center">
                  <TextInput
                    className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm pr-16"
                    placeholder="Min 6 characters"
                    placeholderTextColor="#688ca0"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity className="absolute right-4" onPress={() => setShowPassword(s => !s)}>
                    <Text className="text-[#00f2fe] font-extrabold text-xs">{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-2">
                <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Confirm Password</Text>
                <View className="relative justify-center">
                  <TextInput
                    className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm pr-16"
                    placeholder="Repeat password"
                    placeholderTextColor="#688ca0"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity className="absolute right-4" onPress={() => setShowConfirmPassword(s => !s)}>
                    <Text className="text-[#00f2fe] font-extrabold text-xs">{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password Strength Indicator */}
              {password ? (
                <View className="mt-2 mb-3">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-[#8eb4c6] text-[10px]">Strength</Text>
                    <Text className={`text-[10px] font-bold ${strengthInfo.color}`}>{strengthInfo.label}</Text>
                  </View>
                  <View className="h-1.5 w-full bg-white/[0.1] rounded-full overflow-hidden">
                    <View className={`h-full ${strengthInfo.width} ${strengthInfo.bgColor}`} />
                  </View>
                </View>
              ) : null}
            </>
          )}

          {/* Email Field */}
          <View className="mb-4 mt-1">
            <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Email Address</Text>
            <TextInput
              className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm"
              placeholder="rider@vex.app"
              placeholderTextColor="#688ca0"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Login Specific Password Field */}
          {mode === 'login' && (
            <View className="mb-4">
              <Text className="text-[#c9e5f4] text-xs font-extrabold mb-1.5">Password</Text>
              <View className="relative justify-center">
                <TextInput
                  className="bg-white/[0.06] rounded-2xl px-4 py-3.5 text-white border border-white/[0.12] focus:border-[#00f2fe] text-sm pr-16"
                  placeholder="Enter password"
                  placeholderTextColor="#688ca0"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity className="absolute right-4" onPress={() => setShowPassword(s => !s)}>
                  <Text className="text-[#00f2fe] font-extrabold text-xs">{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Message / Error Notification */}
          {message ? (
            <View className="bg-[#ff5e36]/15 border border-[#ff5e36]/40 p-3 rounded-2xl mb-4">
              <Text className="text-[#ff7a5c] font-bold text-xs text-center">{message}</Text>
            </View>
          ) : null}

          {/* Submit Button */}
          <TouchableOpacity
            className={`py-4 rounded-2xl mt-2 items-center shadow-xl ${
              loading || !canSubmit(mode, name, email, password, confirmPassword)
                ? 'bg-[#ff5e36]/40 border border-[#ff5e36]/30'
                : 'bg-[#ff5e36] border border-[#ff5e36]/60 active:scale-98'
            }`}
            onPress={handleSubmit}
            disabled={loading || !canSubmit(mode, name, email, password, confirmPassword)}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-black text-base tracking-wide">
                {mode === 'signup' ? 'Create Account' : 'Log In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Mode Footer */}
          <TouchableOpacity className="mt-5 items-center" onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
            <Text className="text-[#00f2fe] font-extrabold text-xs">
              {mode === 'signup' ? 'Already have an account? Log In' : 'Need an account? Sign Up'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </ScreenLayout>
  );
}

function passwordStrength(pw) {
  if (!pw) return { label: '', width: 'w-0', color: 'text-white', bgColor: 'bg-white' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Weak', width: 'w-1/3', color: 'text-[#ff5e36]', bgColor: 'bg-[#ff5e36]' };
  if (score === 2) return { label: 'Okay', width: 'w-2/3', color: 'text-[#ffb36b]', bgColor: 'bg-[#ffb36b]' };
  return { label: 'Strong', width: 'w-full', color: 'text-[#00f2fe]', bgColor: 'bg-[#00f2fe]' };
}

function canSubmit(mode, name, email, password, confirm) {
  if (mode === 'login') return email && password;
  return name && email && password && confirm && password === confirm && password.length >= 6;
}