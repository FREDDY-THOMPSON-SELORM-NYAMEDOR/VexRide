import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { joinUser } from './src/services/socket';
import { getStoredUser } from './src/services/user';
import { startLiveLocationTracking, stopLiveLocationTracking } from './src/services/liveLocation';

// Tailwind / NativeWind
import './global.css';

export default function App() {
  const stopTrackingRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function initUser() {
      const user = await getStoredUser();
      if (!mounted) return;
      if (user?.id) {
        joinUser(user.id);
        stopTrackingRef.current = await startLiveLocationTracking(user.id);
        console.log('User connected!');
      } else {
        await stopLiveLocationTracking();
      }
    }
    initUser();
    return () => {
      mounted = false;
      stopTrackingRef.current?.();
      stopLiveLocationTracking();
    };
  }, []);

  return <AppNavigator />;
}