import React, { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

const DISMISSED_KEY = 'vexride-install-dismissed';

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch (error) {
    console.warn('VexRide could not read install prompt preference:', error);
    return false;
  }
}

function saveDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
  } catch (error) {
    console.warn('VexRide could not save install prompt preference:', error);
  }
}

export default function PwaExperience() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installError, setInstallError] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      if (readDismissed() || window.matchMedia('(display-mode: standalone)').matches) return;
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      saveDismissed();
      setInstallPrompt(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      saveDismissed();
      setInstallPrompt(null);
    } catch (error) {
      console.error('VexRide installation prompt failed:', error);
      setInstallError('The install prompt could not be opened. Please try again from your browser menu.');
    }
  }

  function dismissInstallPrompt() {
    saveDismissed();
    setInstallPrompt(null);
  }

  return (
    <>
      {!online ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{
            position: 'fixed',
            top: 'max(12px, env(safe-area-inset-top))',
            left: 16,
            right: 16,
            zIndex: 10000,
            alignItems: 'center'
          }}
        >
          <View style={{ width: '100%', maxWidth: 480, padding: 16, borderRadius: 20, backgroundColor: '#0b172a', borderWidth: 1, borderColor: '#ff5e3680' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>You are currently offline</Text>
            <Text style={{ color: '#c9e5f4', fontSize: 13, lineHeight: 19, marginTop: 4 }}>
              Previously opened pages and cached conversations may still be available.
            </Text>
          </View>
        </View>
      ) : null}
      <Modal visible={Boolean(installPrompt)} transparent animationType="fade" onRequestClose={dismissInstallPrompt}>
        <View style={{ flex: 1, backgroundColor: '#000b', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, padding: 26, borderRadius: 28, backgroundColor: '#0b172a', borderWidth: 1, borderColor: '#ff5e3680' }}>
            <Text style={{ color: '#ff5e36', fontSize: 12, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' }}>VexRide</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 10 }}>Install VexRide</Text>
            <Text style={{ color: installError ? '#ff8c73' : '#c9e5f4', fontSize: 15, lineHeight: 22, marginTop: 8 }}>
              {installError || 'Access VexRide directly from your home screen.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={dismissInstallPrompt}
                style={{ flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff30' }}
              >
                <Text style={{ color: '#c9e5f4', fontWeight: '800' }}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={installApp}
                style={{ flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff5e36' }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>Install</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
