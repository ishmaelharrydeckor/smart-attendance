import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  Animated,
  SafeAreaView,
  View,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

interface OfflineBannerProps {
  isOnline: boolean;
  queueLength: number;
}

export default function OfflineBanner({ isOnline, queueLength }: OfflineBannerProps) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const isSyncing = isOnline && queueLength > 0;

  useEffect(() => {
    const shouldBeVisible = !isOnline || queueLength > 0;
    
    if (shouldBeVisible) {
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }
  }, [isOnline, queueLength]);

  // Rotation animation for sync spinner
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isSyncing) {
      spinAnim.setValue(0);
      loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isSyncing]);

  if (!visible) return null;

  const backgroundColor = isSyncing ? '#D97706' : '#1F2937';
  const iconName = isSyncing ? 'sync' : 'wifi-outline';
  const bannerText = isSyncing
    ? `Reconnected — syncing ${queueLength} check-in(s)...`
    : "Offline Mode — Check-ins are saved locally";

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          backgroundColor,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.innerContent}>
          <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : {}}>
            <Ionicons name={iconName} size={16} color={Colors.White} style={styles.icon} />
          </Animated.View>
          <Text style={styles.text}>{bannerText}</Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
    height: 'auto',
  },
  safeArea: {
    width: '100%',
  },
  innerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  text: {
    ...Typography.Label,
    color: Colors.White,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
});
