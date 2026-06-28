import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../utils/api';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

export default function ScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isCheckout = params.action === 'checkout' || params.mode === 'checkout';
  const sessionId = params.sessionId || params.session_id;

  const { enqueue } = useOfflineQueue();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queuedState, setQueuedState] = useState<'checkin' | 'checkout' | null>(null);

  // Scanning animation values
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for geofenced check-in.');
      }
    })();
  }, []);

  // Scan line animation loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 260,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Pulse animation for bottom sheet scanning status
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color={Colors.Primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>We need your permission to use the camera</Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission} activeOpacity={0.75}>
          <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      let qrToken = data;
      if (data.includes('?qr=')) {
        const parts = data.split('?qr=');
        if (parts.length > 1) {
          qrToken = parts[1].split('&')[0];
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      let locationData = null;
      if (status === 'granted') {
        locationData = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      if (isCheckout) {
        if (!sessionId) {
          throw new Error('Active session ID not found.');
        }

        const res = await enqueue({
          endpoint: params.mode === 'checkout' ? '/api/student/check-out' : `/api/sessions/${sessionId}/checkout`,
          method: 'POST',
          payload: params.mode === 'checkout'
            ? { session_id: Number(sessionId), qr_token: qrToken }
            : { method: 'qr', qr_token: qrToken },
        });

        if (res.status === 'submitted') {
          const resData = res.data as any;
          if (params.mode === 'checkout') {
            router.replace({
              pathname: '/checkout',
              params: {
                duration_minutes: resData.duration_minutes,
                attendance_status: resData.attendance_status,
                session_id: sessionId,
              },
            });
            return;
          } else {
            Alert.alert('Success', resData.message || 'Checked out successfully!');
          }
        } else if (res.status === 'queued') {
          if (params.mode === 'checkout') {
            router.replace({
              pathname: '/checkout',
              params: {
                is_queued: 'true',
                session_id: sessionId,
              },
            });
            return;
          } else {
            setQueuedState('checkout');
            return;
          }
        } else {
          Alert.alert('Scan Failed', res.error);
          setScanned(false);
          return;
        }
      } else {
        const res = await enqueue({
          endpoint: '/api/student/check-in/qr',
          method: 'POST',
          payload: {
            qr_token: qrToken,
            lat: locationData?.coords.latitude || null,
            lng: locationData?.coords.longitude || null,
            accuracy: locationData?.coords.accuracy || null,
          },
        });

        if (res.status === 'submitted') {
          const resData = res.data as any;
          Alert.alert('Success', resData.message || 'Checked in successfully!');
        } else if (res.status === 'queued') {
          setQueuedState('checkin');
          return;
        } else {
          Alert.alert('Scan Failed', res.error);
          setScanned(false);
          return;
        }
      }

      router.back();
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message || 'An error occurred during submission.');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  if (queuedState) {
    const isCheckin = queuedState === 'checkin';
    return (
      <View style={styles.queuedContainer}>
        <View style={styles.queuedCard}>
          <Ionicons name="cloud-offline-outline" size={80} color={Colors.Warning} />
          <Text style={styles.queuedTitle}>
            {isCheckin ? 'Check-in Saved Offline' : 'Checkout Saved Offline'}
          </Text>
          <Text style={styles.queuedSubtext}>
            Your {isCheckin ? 'check-in' : 'checkout'} has been saved and will be submitted automatically when you reconnect.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.queuedBtn}
          onPress={() => router.replace('/')}
          activeOpacity={0.75}
        >
          <Text style={styles.queuedBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine scanning status text and color
  let statusText = 'Scanning...';
  let statusDotColor = Colors.Neutral400;
  let statusIcon = 'scan-outline';

  if (loading) {
    statusText = 'QR detected — submitting';
    statusDotColor = Colors.Success;
    statusIcon = 'sync-outline';
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        {/* Floating Top Overlay Bar */}
        <SafeAreaView style={styles.topBarSafe}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.75}>
              <Ionicons name="arrow-back" size={24} color={Colors.White} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>
              {isCheckout ? 'Checkout Scanner' : 'Check-in Scanner'}
            </Text>
            <View style={{ width: 24 }} />
          </View>
        </SafeAreaView>

        {/* Scanner Framing Box */}
        <View style={styles.framingContainer}>
          <View style={styles.scannerOutline}>
            {/* Corner Brackets */}
            <View style={[styles.bracket, styles.bracketTopLeft]} />
            <View style={[styles.bracket, styles.bracketTopRight]} />
            <View style={[styles.bracket, styles.bracketBottomLeft]} />
            <View style={[styles.bracket, styles.bracketBottomRight]} />

            {/* Scan Line Animation */}
            <Animated.View style={[
              styles.scanLine,
              { transform: [{ translateY: scanLineAnim }] }
            ]} />
          </View>
          <Text style={styles.helperText}>Point at the QR code</Text>
        </View>

        {/* Floating Bottom status sheet */}
        <View style={styles.bottomSheet}>
          <View style={styles.statusRow}>
            <Animated.View style={[
              styles.statusDot,
              { backgroundColor: statusDotColor, opacity: loading ? 1 : pulseOpacity }
            ]} />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          <TouchableOpacity
            style={styles.cancelTextLink}
            onPress={() => router.back()}
            activeOpacity={0.75}
          >
            <Text style={styles.cancelTextLinkLabel}>Cancel Scanner</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.White,
    padding: Spacing.xl,
  },
  message: {
    ...Typography.Body,
    color: Colors.Neutral600,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  grantBtn: {
    backgroundColor: Colors.Primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  grantBtnText: {
    ...Typography.Body,
    color: Colors.White,
    fontWeight: '600',
  },
  topBarSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  topBarTitle: {
    ...Typography.Body,
    color: Colors.White,
    fontWeight: '600',
  },
  framingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerOutline: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
    marginBottom: Spacing.xl,
  },
  bracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: Colors.White,
  },
  bracketTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  bracketTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bracketBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bracketBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.White,
    opacity: 0.8,
  },
  helperText: {
    ...Typography.Label,
    color: Colors.White,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
  cancelTextLink: {
    paddingVertical: Spacing.sm,
  },
  cancelTextLinkLabel: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    textDecorationLine: 'underline',
  },
  queuedContainer: {
    flex: 1,
    backgroundColor: Colors.White,
    padding: Spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: Spacing.xxxl,
  },
  queuedCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  queuedTitle: {
    ...Typography.Display,
    color: Colors.Neutral900,
    textAlign: 'center',
  },
  queuedSubtext: {
    ...Typography.Body,
    color: Colors.Neutral600,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 20,
  },
  queuedBtn: {
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  queuedBtnText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
});
