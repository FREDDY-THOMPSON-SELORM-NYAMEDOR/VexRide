import React, { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import FindRideScreen from '../screens/FindRideScreen';
import DiscoverRidersScreen from '../screens/DiscoverRidersScreen';
import ConnectionRequestsScreen from '../screens/ConnectionRequestsScreen';
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
import { onSocket } from '../services/socket';
import { incrementUnread, isActiveChatMatch, setUnreadCount } from '../services/chatBadge';
import { logError } from '../services/errorHandling';
import { clearSearchSession } from '../services/searchSession';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState('Auth');
  const [ready, setReady] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState(null);

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
    let active = true;

    getStoredUser().then(async (user) => {
      if (!active || !user?.id) return;
      try {
        const result = await getJson(`/messages/unread/${user.id}`);
        if (active) setUnreadCount(result.unreadCount);
      } catch (error) {
        logError('Load unread messages', error);
      }
    });

    const cleanMessage = onSocket('chatMessage', (message) => {
      getStoredUser().then((user) => {
        const isRecipient = user?.id && Number(message.receiverId) === Number(user.id);
        if (isRecipient && !message.seen && !isActiveChatMatch(message.matchId)) incrementUnread();
      });
    });

    const cleanConnectionRequest = onSocket('connectionRequested', (notification) => {
      setConnectionNotice({ type: 'received', ...notification });
    });
    const cleanAccepted = onSocket('connectionAccepted', async (notification) => {
      const user = await getStoredUser();
      if (Number(user?.id) === Number(notification.requester_id)) {
        await clearSearchSession();
        setConnectionNotice({ type: 'accepted', ...notification });
      }
    });
    const cleanDeclined = onSocket('connectionDeclined', async (notification) => {
      const user = await getStoredUser();
      if (Number(user?.id) === Number(notification.requester_id)) {
        setConnectionNotice({ type: 'declined', ...notification });
      }
    });
    const cleanGroupMatch = onSocket('groupMatchFound', async ({ rideRequestId, matchId, request }) => {
      await clearSearchSession();
      if (active && navigationRef.isReady()) {
        navigationRef.navigate('MatchResult', { groupRequestId: rideRequestId, matchId, request });
      }
    });

    return () => {
      active = false;
      cleanMessage();
      cleanConnectionRequest();
      cleanAccepted();
      cleanDeclined();
      cleanGroupMatch();
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <NavigationContainer ref={navigationRef}>
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
        <Stack.Screen name="DiscoverRiders" component={DiscoverRidersScreen} />
        <Stack.Screen name="ConnectionRequests" component={ConnectionRequestsScreen} />
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
      <Modal
        visible={Boolean(connectionNotice)}
        transparent
        animationType="fade"
        onRequestClose={() => setConnectionNotice(null)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-5">
          <View className="w-full max-w-sm bg-[#0b172a] border border-[#00f2fe]/40 rounded-3xl p-6">
            <Text className="text-white text-xl font-black">
              {connectionNotice?.type === 'received' ? 'New ride request' : connectionNotice?.type === 'accepted' ? 'Request accepted' : 'Request declined'}
            </Text>
            <Text className="text-[#c9e5f4] text-sm leading-5 mt-2">
              {connectionNotice?.type === 'received'
                ? `${connectionNotice?.requester?.name || 'A rider'} would like to join your ride.`
                : `${connectionNotice?.recipient?.name || 'The rider'} ${connectionNotice?.type === 'accepted' ? 'accepted' : 'declined'} your request to join their ride${connectionNotice?.rideRequest?.destination ? ` to ${connectionNotice.rideRequest.destination}` : ''}.`}
            </Text>
            <View className="flex-row gap-3 mt-5">
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-2xl bg-white/[0.08] border border-white/[0.15] items-center"
                onPress={() => setConnectionNotice(null)}
              >
                <Text className="text-[#c9e5f4] font-bold">{connectionNotice?.type === 'received' ? 'Later' : 'Close'}</Text>
              </TouchableOpacity>
              {connectionNotice?.type === 'received' ? (
                <TouchableOpacity
                  className="flex-1 py-3.5 rounded-2xl bg-[#00f2fe] items-center"
                  onPress={() => {
                    setConnectionNotice(null);
                    if (navigationRef.isReady()) navigationRef.navigate('ConnectionRequests');
                  }}
                >
                  <Text className="text-[#061426] font-black">Review request</Text>
                </TouchableOpacity>
              ) : null}
              {connectionNotice?.type === 'accepted' ? (
                <TouchableOpacity
                  className="flex-1 py-3.5 rounded-2xl bg-[#00f2fe] items-center"
                  onPress={() => {
                    const accepted = connectionNotice;
                    setConnectionNotice(null);
                    if (navigationRef.isReady()) navigationRef.navigate('Chat', {
                      rideRequestId: accepted.requestId,
                      matchId: accepted.matchId,
                      request: accepted.rideRequest
                    });
                  }}
                >
                  <Text className="text-[#061426] font-black">Open ride chat</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
  );
}