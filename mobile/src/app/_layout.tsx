import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import React, { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthScreen from './auth';

import { useOfflineQueue } from '../hooks/useOfflineQueue';
import OfflineBanner from '../components/OfflineBanner';

function AppContent() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const { isOnline, queueLength, clearQueue } = useOfflineQueue();

  useEffect(() => {
    if (!user) {
      clearQueue();
    }
  }, [user]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <OfflineBanner isOnline={isOnline} queueLength={queueLength} />
      <AnimatedSplashOverlay />
      {!user ? <AuthScreen /> : <AppTabs />}
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
