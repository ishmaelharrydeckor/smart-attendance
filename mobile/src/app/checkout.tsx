import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../utils/api';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

interface CheckoutParams {
  session_id: string;
  course_name: string;
  course_code: string;
  duration_minutes?: string;
  attendance_status?: string;
}

interface CheckoutResult {
  duration_minutes: number;
  attendance_status: 'present' | 'early_leaver';
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as CheckoutParams & { is_queued?: string };
  
  const sessionId = Number(params.session_id);
  const courseName = params.course_name;
  const courseCode = params.course_code;

  const { enqueue } = useOfflineQueue();
  const [method, setMethod] = useState<'qr' | 'code' | null>(null);
  const [codeValue, setCodeValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState('');
  
  // Checkout success details
  const [successData, setSuccessData] = useState<CheckoutResult | null>(null);
  const [isQueued, setIsQueued] = useState(false);

  const hiddenInputRef = useRef<TextInput | null>(null);
  const successScaleAnim = useRef(new Animated.Value(0)).current;

  // Monitor route params on re-focus (returned from scanner.tsx)
  useEffect(() => {
    if (params.duration_minutes && params.attendance_status) {
      setSuccessData({
        duration_minutes: Number(params.duration_minutes),
        attendance_status: params.attendance_status as 'present' | 'early_leaver',
      });
    }
    if (params.is_queued === 'true') {
      setIsQueued(true);
    }
  }, [params.duration_minutes, params.attendance_status, params.is_queued]);

  // Spring animation on success mount
  useEffect(() => {
    if (successData) {
      Animated.spring(successScaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
  }, [successData]);

  const handleSubmitCode = async (finalCode: string) => {
    if (loading) return;
    setLoading(true);
    setInlineError('');

    try {
      const res = await enqueue({
        endpoint: '/api/student/check-out/code',
        method: 'POST',
        payload: {
          session_id: sessionId,
          code: finalCode,
        },
      });

      if (res.status === 'submitted') {
        const data = res.data as any;
        setSuccessData({
          duration_minutes: data.duration_minutes,
          attendance_status: data.attendance_status,
        });
      } else if (res.status === 'queued') {
        setIsQueued(true);
      } else {
        setInlineError(res.error || 'Invalid check-out code.');
        setCodeValue('');
        setTimeout(() => {
          hiddenInputRef.current?.focus();
        }, 100);
      }
    } catch (err: any) {
      setCodeValue('');
      setInlineError(err.message || 'Invalid check-out code.');
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCodeMethod = () => {
    setMethod('code');
    setCodeValue('');
    setInlineError('');
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 150);
  };

  // Render Queued Success Dashboard
  if (isQueued) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <Ionicons name="cloud-offline-outline" size={80} color={Colors.Warning} />
          <Text style={styles.successTitle}>Checkout Saved Offline</Text>
          <Text style={styles.successSubtitle}>
            {courseCode} — {courseName}
          </Text>
          <Text style={styles.noteText}>
            Your checkout has been saved and will be submitted automatically when you reconnect.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace('/')}
          activeOpacity={0.75}
        >
          <Text style={styles.doneBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render Success Dashboard
  if (successData) {
    const isFullAttendance = successData.attendance_status === 'present';
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          {/* Spring-scaled checkmark icon container */}
          <Animated.View style={[
            styles.checkmarkIconContainer,
            { transform: [{ scale: successScaleAnim }] }
          ]}>
            <Ionicons name="checkmark" size={40} color={Colors.Success} />
          </Animated.View>

          <Text style={styles.successTitle}>Checked out</Text>
          <Text style={styles.successSubtitle}>
            {courseCode} — {courseName}
          </Text>

          <View style={styles.pillsRow}>
            <View style={styles.statPillDuration}>
              <Text style={styles.statPillDurationText}>{successData.duration_minutes} min</Text>
            </View>

            <View style={[
              styles.statusPillBadge,
              isFullAttendance ? styles.pillSuccess : styles.pillWarning
            ]}>
              <Text style={[
                styles.statusPillBadgeText,
                isFullAttendance ? styles.pillSuccessText : styles.pillWarningText
              ]}>
                {isFullAttendance ? 'Full attendance' : 'Early leaver'}
              </Text>
            </View>
          </View>

          <Text style={styles.noteText}>
            {isFullAttendance
              ? 'You attended the full session. Well done.'
              : 'You left before the session ended. This has been recorded.'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace('/')}
          activeOpacity={0.75}
        >
          <Text style={styles.doneBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* HEADER SECTION */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={24} color={Colors.Neutral900} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Check out</Text>
            <Text style={styles.headerSubtitle}>
              {courseCode} — {courseName}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Method 1: Scan QR */}
          <TouchableOpacity
            style={[
              styles.methodCard,
              method === 'qr' && styles.methodCardActive,
            ]}
            onPress={() => {
              setMethod('qr');
              router.push({
                pathname: '/scanner',
                params: { mode: 'checkout', session_id: sessionId },
              });
            }}
            activeOpacity={0.75}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="qr-code" size={22} color={Colors.Primary} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>Scan QR code</Text>
              <Text style={styles.methodDesc}>
                Point your camera at the checkout QR
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.Neutral400} />
          </TouchableOpacity>

          {/* Method 2: Enter Code */}
          <TouchableOpacity
            style={[
              styles.methodCard,
              method === 'code' && styles.methodCardActive,
            ]}
            onPress={handleSelectCodeMethod}
            activeOpacity={0.75}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="keypad" size={22} color={Colors.Primary} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>Enter checkout code</Text>
              <Text style={styles.methodDesc}>
                Type the code shown by your lecturer
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.Neutral400} />
          </TouchableOpacity>

          {/* INLINE CODE ENTRY PANEL (Same OTP block design as code-entry.tsx) */}
          {method === 'code' && (
            <View style={styles.codeEntryPanel}>
              <TextInput
                ref={hiddenInputRef}
                style={styles.hiddenInput}
                value={codeValue}
                onChangeText={(text) => {
                  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  setCodeValue(clean);
                  if (clean.length === 6) {
                    handleSubmitCode(clean);
                  }
                }}
                maxLength={6}
                keyboardType="default"
                autoCorrect={false}
                autoCapitalize="characters"
                editable={!loading}
              />

              <TouchableOpacity
                style={styles.boxesRow}
                onPress={() => hiddenInputRef.current?.focus()}
                activeOpacity={1}
              >
                {Array.from({ length: 6 }).map((_, idx) => {
                  const char = codeValue[idx] || '';
                  const isActive = codeValue.length === idx;
                  const isFilled = char !== '';

                  let boxStyle = styles.codeBoxDefault;
                  if (isActive) boxStyle = styles.codeBoxActive;
                  else if (isFilled) boxStyle = styles.codeBoxFilled;

                  return (
                    <View key={idx} style={[styles.codeBox, boxStyle]}>
                      <Text style={styles.codeBoxChar}>{char}</Text>
                    </View>
                  );
                })}
              </TouchableOpacity>

              {loading && (
                <View style={styles.loadingSpinnerContainer}>
                  <ActivityIndicator size="small" color={Colors.Primary} />
                  <Text style={styles.loadingSpinnerText}>Verifying checkout code...</Text>
                </View>
              )}

              {inlineError !== '' && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.Danger} />
                  <Text style={styles.errorText}>{inlineError}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 0.5,
    borderColor: Colors.Neutral200,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.Heading,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
  headerSubtitle: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
  },
  methodCard: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    ...Shadows.Card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodCardActive: {
    borderColor: Colors.Primary,
    backgroundColor: Colors.PrimaryLight,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.PrimaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    ...Typography.Body,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
  methodDesc: {
    ...Typography.Caption,
    color: Colors.Neutral600,
    marginTop: 4,
  },
  codeEntryPanel: {
    padding: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.White,
  },
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  boxesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    width: '100%',
  },
  codeBox: {
    width: 44,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxDefault: {
    backgroundColor: Colors.Neutral100,
    borderWidth: 1.5,
    borderColor: Colors.Neutral200,
  },
  codeBoxActive: {
    backgroundColor: Colors.White,
    borderWidth: 2,
    borderColor: Colors.Primary,
    ...Shadows.Card,
  },
  codeBoxFilled: {
    backgroundColor: Colors.White,
    borderWidth: 1.5,
    borderColor: Colors.Neutral900,
  },
  codeBoxChar: {
    ...Typography.Heading,
    color: Colors.Neutral900,
    textAlign: 'center',
  },
  loadingSpinnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  loadingSpinnerText: {
    ...Typography.Label,
    color: Colors.Neutral600,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  errorText: {
    ...Typography.Body,
    color: Colors.Danger,
    fontWeight: '500',
  },
  successContainer: {
    flex: 1,
    backgroundColor: Colors.White,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  successCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  checkmarkIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.SuccessLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    ...Typography.Display,
    color: Colors.Neutral900,
    textAlign: 'center',
  },
  successSubtitle: {
    ...Typography.Body,
    color: Colors.Neutral400,
    textAlign: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  statPillDuration: {
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statPillDurationText: {
    ...Typography.Body,
    color: Colors.Neutral900,
    fontWeight: '500',
  },
  statusPillBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pillSuccess: {
    backgroundColor: Colors.SuccessLight,
  },
  pillWarning: {
    backgroundColor: Colors.WarningLight,
  },
  statusPillBadgeText: {
    ...Typography.Body,
    fontWeight: '600',
  },
  pillSuccessText: {
    color: Colors.Success,
  },
  pillWarningText: {
    color: Colors.Warning,
  },
  noteText: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  doneBtn: {
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  doneBtnText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
});
