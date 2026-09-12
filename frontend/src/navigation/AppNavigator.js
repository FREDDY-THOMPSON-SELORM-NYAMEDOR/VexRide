import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import FindRideScreen from '../screens/FindRideScreen';
import MatchResultScreen from '../screens/MatchResultScreen';
import ChatScreen from '../screens/ChatScreen';
import PaymentScreen from '../screens/PaymentScreen';
import RideDetailsScreen from '../screens/RideDetailsScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import BrowseGroupsScreen from '../screens/BrowseGroupsScreen';
import RideTrackingScreen from '../screens/RideTrackingScreen';
import MyRequestsScreen from '../screens/MyRequestsScreen';
import TrackingHubScreen from '../screens/TrackingHubScreen';
import AuthScreen from '../screens/AuthScreen';
import { getStoredUser } from '../services/user';
import { getJson } from '../services/api';
import { joinUser, onSocket, onSocketConnect, socket } from '../services/socket';
import { incrementUnread, isActiveChatMatch, setUnreadCount } from '../services/chatBadge';
import { logError } from '../services/errorHandling';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState('Auth');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const storedUser = await getStoredUser();
      setInitialRoute(storedUser? 'Home' : 'Auth');
      setReady(true);
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    let cleanConnection;
    let active = true;

    getStoredUser().then(async (user) => {
      if (!active || !user?.id) return;
      try {
        const result = await getJson(`/messages/unread/${user.id}`);
        if (active) setUnreadCount(result.unreadCount);
      } catch (error) {
        logError('Load unread messages', error);
      }
      const registerUser = () => joinUser(user.id);
      cleanConnection = onSocketConnect(registerUser);
      if (socket.connected) registerUser();
      else socket.connect();
    });

    const cleanMessage = onSocket('chatMessage', (message) => {
      getStoredUser().then((user) => {
        const isRecipient = user?.id && Number(message.receiverId) === Number(user.id);
        if (isRecipient && !message.seen && !isActiveChatMatch(message.matchId)) incrementUnread();
      });
    });

    return () => {
      active = false;
      cleanConnection?.();
      cleanMessage();
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#061426' },
          animationEnabled: true
        }}
      >
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="FindRide" component={FindRideScreen} />
        <Stack.Screen name="MatchResult" component={MatchResultScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="RideDetails" component={RideDetailsScreen} />
        <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
        <Stack.Screen name="BrowseGroups" component={BrowseGroupsScreen} />
        <Stack.Screen name="RideTracking" component={RideTrackingScreen} />
        <Stack.Screen name="MyRequests" component={MyRequestsScreen} />
        <Stack.Screen name="TrackingHub" component={TrackingHubScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}