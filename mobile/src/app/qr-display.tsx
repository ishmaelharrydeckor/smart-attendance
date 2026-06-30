import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import { apiFetch } from '../utils/api';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

export default function QrDisplayScreen() {
  useKeepAwake();
  const router = useRouter();
  const params = useLocalSearchParams();
  const courseId = Number(params.courseId);
  const courseCode = params.courseCode;
  const { width: screenWidth } = useWindowDimensions();

  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'checkin' | 'checkout'>('checkin');
  const [originalBrightness, setOriginalBrightness] = useState<number | null>(null);
  const [checkedInCount, setCheckedInCount] = useState(0);

  // Rotation Countdown
  const [timeLeft, setTimeLeft] = useState(120);
  const progressWidth = useRef(new Animated.Value(1)).current;

  // Boost screen brightness on mount and restore on unmount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Brightness.requestPermissionsAsync();
        if (status === 'granted') {
          const current = await Brightness.getBrightnessAsync();
          setOriginalBrightness(current);
          await Brightness.setBrightnessAsync(1.0);
        }
      } catch (err) {
        console.warn('Error adjusting screen brightness:', err);
      }
    })();

    return () => {
      if (originalBrightness !== null) {
        Brightness.setBrightnessAsync(originalBrightness).catch(() => {});
      }
    };
  }, [originalBrightness]);

  const sessionId = Number(params.sessionId);

  const fetchSessionStatus = async () => {
    try {
      if (!sessionId) return;
      const status = await apiFetch(`/api/sessions/${sessionId}/qr-status`);
      if (status.status === 'EXPIRED' || !status.is_active) {
        Alert.alert('Session Ended', 'This session has been deactivated or expired.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
        return;
      }
      setActiveSession(status);
      setCheckedInCount(status.present_count ? Number(status.present_count) : 0);
      setTimeLeft(status.qr_seconds_remaining !== undefined ? status.qr_seconds_remaining : 60);
    } catch (e: any) {
      console.warn('Error fetching session QR status:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      Alert.alert('Error', 'Invalid session identifier.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
      return;
    }
    fetchSessionStatus();
    const statusInterval = setInterval(fetchSessionStatus, 15000);
    return () => clearInterval(statusInterval);
  }, [sessionId]);

  // Local second-by-second countdown decrementer
  useEffect(() => {
    const countdownTimer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(countdownTimer);
  }, []);

  // Sync Animated value with timeLeft
  useEffect(() => {
    if (!activeSession) return;
    const totalSecs = (activeSession.qr_rotation_interval_mins || 1) * 60;
    Animated.timing(progressWidth, {
      toValue: timeLeft / totalSecs,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [timeLeft, activeSession]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color={Colors.Primary} />
      </View>
    );
  }

  if (!activeSession) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={60} color={Colors.Danger} />
        <Text style={styles.errorText}>No active session found.</Text>
        <TouchableOpacity style={styles.errorBackBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Text style={styles.errorBackBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasCheckout = activeSession.checkout_active;
  const qrValue = mode === 'checkout'
    ? `smartroll://check-out?qr=${activeSession.checkout_qr_token}`
    : `smartroll://check-in?qr=${activeSession.qr_token}`;
  
  const pinCode = mode === 'checkin' ? activeSession.session_code : activeSession.checkout_session_code;

  // Format timeLeft into MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const calculatedQrSize = Math.min(320, screenWidth - 96);
  const isProgressBarWarning = timeLeft < 30;

  return (
    <View style={styles.container}>
      {/* TOP NAVIGATION BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.75}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>

        <Text style={styles.courseInfoTitle}>
          {courseCode}
        </Text>

        {hasCheckout ? (
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'checkin' && styles.toggleBtnActive]}
              onPress={() => setMode('checkin')}
              activeOpacity={0.75}
            >
              <Text style={[styles.toggleBtnText, mode === 'checkin' && styles.toggleBtnTextActive]}>
                In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'checkout' && styles.toggleBtnActive]}
              onPress={() => setMode('checkout')}
              activeOpacity={0.75}
            >
              <Text style={[styles.toggleBtnText, mode === 'checkout' && styles.toggleBtnTextActive]}>
                Out
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* CENTERED BROADCAST CARD */}
      <View style={styles.centerContainerFlex}>
        <View style={styles.qrCard}>
          <QRCode
            value={qrValue}
            size={calculatedQrSize}
            color="#000000"
            backgroundColor="#FFFFFF"
          />
        </View>

        {/* PROGRESS BAR */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[
              styles.progressBarFill,
              {
                width: progressWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: isProgressBarWarning ? Colors.Warning : Colors.Primary,
              }
            ]} />
          </View>
          <Text style={styles.progressBarCaption}>
            Refreshes in {formatTime(timeLeft)}
          </Text>
        </View>

        {/* FALLBACK PIN DISPLAY */}
        {pinCode && (
          <View style={styles.fallbackContainer}>
            <Text style={styles.fallbackCaption}>Fallback code</Text>
            <View style={styles.pinBoxesRow}>
              {pinCode.split('').map((char: string, idx: number) => (
                <View key={idx} style={styles.pinBox}>
                  <Text style={styles.pinBoxText}>{char}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* CHECK-IN COUNTER BOTTOM */}
      <View style={styles.bottomCounter}>
        <Text style={styles.bottomCounterText}>
          {checkedInCount} {checkedInCount === 1 ? 'student' : 'students'} checked in
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.White,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.White,
  },
  centerContainerFlex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    width: '100%',
  },
  closeBtnText: {
    ...Typography.Body,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
  courseInfoTitle: {
    ...Typography.Label,
    color: Colors.Neutral600,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.Neutral200,
    borderRadius: BorderRadius.full,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  toggleBtnActive: {
    backgroundColor: Colors.Neutral900,
  },
  toggleBtnText: {
    ...Typography.Caption,
    color: Colors.Neutral600,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: Colors.White,
  },
  qrCard: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    ...Shadows.Float,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.Neutral100,
  },
  progressBarContainer: {
    width: '100%',
    maxWidth: 320,
    gap: Spacing.xs,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: Colors.Neutral200,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  progressBarCaption: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    textAlign: 'right',
  },
  fallbackContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  fallbackCaption: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pinBoxesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pinBox: {
    width: 40,
    height: 48,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.Neutral200,
  },
  pinBoxText: {
    ...Typography.Display,
    fontSize: 22,
    color: Colors.Neutral900,
  },
  bottomCounter: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  bottomCounterText: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    fontWeight: '500',
  },
  errorText: {
    ...Typography.Body,
    color: Colors.Danger,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  errorBackBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.Neutral100,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  errorBackBtnText: {
    ...Typography.Body,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
});
