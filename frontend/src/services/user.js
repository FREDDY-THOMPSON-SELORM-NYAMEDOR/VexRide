import AsyncStorage from '@react-native-async-storage/async-storage';
import { postJson } from './api';
import { stopLiveLocationTracking } from './liveLocation';
import { joinUser, leaveUser } from './socket';

const USER_KEY = 'vex-current-user';

export async function saveUser(user) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user?.id) joinUser(user.id);
}

export async function getStoredUser() {
  const value = await AsyncStorage.getItem(USER_KEY);
  return value ? JSON.parse(value) : null;
}

export async function clearStoredUser() {
  await AsyncStorage.removeItem(USER_KEY);
}

export async function logoutUser() {
  console.log('logout')
  const user = await getStoredUser();
  await stopLiveLocationTracking();
  if (user?.id) leaveUser(user.id);
  await clearStoredUser();

  try {
    await postJson('/auth/logout', {});
  } catch (error) {
    console.warn('Logout network error:', error.message || error);
  }

  return true;
}

export async function getAppUser() {
  const theUser = getStoredUser()
  return theUser;
}

export const APP_USER = {
  id: Math.floor(1000 + Math.random() * 9000),
  name: `Guest ${Math.floor(1000 + Math.random() * 9000)}`,
  email: `guest${Math.floor(100000 + Math.random() * 900000)}@vex.app`
};
