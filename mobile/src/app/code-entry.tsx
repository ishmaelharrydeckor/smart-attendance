import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

export default function CodeEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { enqueue } = useOfflineQueue();

  const [codeValue, setCodeValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isQueued, setIsQueued] = useState(false);
  const [attemptsCount, setAttemptsCount] = useState(0);

  const hiddenInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 150);
  }, []);

  const handleSubmitCode = async (code: string) => {
    if (loading) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let locationData = null;
      if (status === 'granted') {
        locationData = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      const res = await enqueue({
        endpoint: '/api/student/check-in/code',
        method: 'POST',
        payload: {
          session_code: code.trim().toUpperCase(),
          lat: locationData?.coords.latitude || null,
          lng: locationData?.coords.longitude || null,
        },
      });

      if (res.status === 'submitted') {
        const resData = res.data as any;
        setSuccessMsg(resData.message || 'Checked in successfully!');
      } else if (res.status === 'queued') {
        setIsQueued(true);
      } else {
        setAttemptsCount((prev) => prev + 1);
        setErrorMsg(res.error || 'Invalid code.');
        setCodeValue('');
        setTimeout(() => {
          hiddenInputRef.current?.focus();
        }, 100);
      }
    } catch (e: any) {
      setAttemptsCount((prev) => prev + 1);
      setErrorMsg(e.message || 'Failed to submit check-in code.');
      setCodeValue('');
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (text: string) => {
    const sanitized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCodeValue(sanitized);
    if (sanitized.length === 6) {
      handleSubmitCode(sanitized);
    }
  };

  if (isQueued) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <Ionicons name="cloud-offline-outline" size={80} color={Colors.Warning} />
          <Text style={styles.successTitle}>Check-in Saved Offline</Text>
          <Text style={styles.noteText}>
            Your check-in has been saved and will be submitted automatically when you reconnect.
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

  if (successMsg) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.Success} />
          <Text style={styles.successTitle}>Checked In Successfully</Text>
          <Text style={styles.noteText}>{successMsg}</Text>
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER BAR */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.75}>
              <Ionicons name="arrow-back" size={24} color={Colors.Neutral900} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Enter session code</Text>
              <Text style={styles.headerSubtitle}>
                {params.course_name || 'Active Course Session'}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.body}>
            {/* OTP BOX GRID */}
            {!loading ? (
              <TouchableOpacity
                style={styles.codeContainer}
                activeOpacity={1}
                onPress={() => hiddenInputRef.current?.focus()}
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
                      <Text style={styles.codeText}>{char}</Text>
                    </View>
                  );
                })}
              </TouchableOpacity>
            ) : (
              <View style={styles.spinnerContainer}>
                <ActivityIndicator size="small" color={Colors.Primary} />
              </View>
            )}

            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              maxLength={6}
              value={codeValue}
              onChangeText={handleTextChange}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="default"
            />

            {errorMsg !== '' && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.Danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Warning Helper card after 3 failed attempts */}
            {attemptsCount >= 3 && (
              <View style={styles.troubleCard}>
                <Text style={styles.troubleText}>
                  Having trouble? Ask your lecturer for the code
                </Text>
                <TouchableOpacity
                  style={styles.troubleLink}
                  onPress={() => router.replace('/scanner')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.troubleLinkLabel}>Go back to scanner</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
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
  closeBtn: {
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
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  codeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    width: '100%',
  },
  codeBox: {
    width: 44,
    height: 56,
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
  codeText: {
    ...Typography.Display,
    color: Colors.Neutral900,
    textAlign: 'center',
  },
  spinnerContainer: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.Body,
    color: Colors.Danger,
    fontWeight: '500',
  },
  troubleCard: {
    backgroundColor: Colors.WarningLight,
    borderWidth: 1,
    borderColor: Colors.Warning,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
    width: '100%',
  },
  troubleText: {
    ...Typography.Label,
    color: Colors.Warning,
    textAlign: 'center',
  },
  troubleLink: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  troubleLinkLabel: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  successContainer: {
    flex: 1,
    backgroundColor: Colors.White,
    padding: Spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: Spacing.xxxl,
  },
  successCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  successTitle: {
    ...Typography.Display,
    color: Colors.Neutral900,
    textAlign: 'center',
  },
  noteText: {
    ...Typography.Body,
    color: Colors.Neutral600,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 20,
  },
  doneBtn: {
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  doneBtnText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
});
