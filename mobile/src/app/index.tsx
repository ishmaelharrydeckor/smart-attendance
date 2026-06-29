import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
  Animated,
  StatusBar,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Papa from 'papaparse';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { apiFetch } from '../utils/api';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

interface Course {
  id: number;
  name: string;
  code: string;
  level: string;
}

interface AttendanceRecord {
  student_id: number;
  name: string;
  academic_student_id: string;
  level: string;
  is_present: boolean;
  timestamp: string | null;
  method: string | null;
  checkout_timestamp: string | null;
  attendance_status: string | null;
}

interface InviteCode {
  id: number;
  code: string;
  intended_role: 'lecturer' | 'ta';
  course_ids: string; // JSON array string
  expires_at: string;
  used_by_name?: string;
  active_assignment_count?: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const { isOnline, queueLength, clearQueue } = useOfflineQueue(); // Get offline queue details for profile view

  // Change Password States
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPasswordLoading, setChangingPasswordLoading] = useState(false);

  const handleLogoutConfirmation = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout }
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'All password fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters.');
      return;
    }

    setChangingPasswordLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      Alert.alert('Success', 'Password changed successfully!');
      
      // Reset form states
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to change password. Please check your current password.');
    } finally {
      setChangingPasswordLoading(false);
    }
  };
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  const [history, setHistory] = useState<any[]>([]);
  const [activeCheckin, setActiveCheckin] = useState<any>(null);
  
  const [lecturerSessions, setLecturerSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [liveAttendance, setLiveAttendance] = useState<AttendanceRecord[]>([]);
  
  // Student Countdown states
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);
  const intervalRef = useRef<any | null>(null);
  const staffScrollViewRef = useRef<ScrollView | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Student manual code entry states
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [sessionCodeInput, setSessionCodeInput] = useState('');

  // Checkout Window states
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [checkoutQrToken, setCheckoutQrToken] = useState<string | null>(null);
  const [checkoutCode, setCheckoutCode] = useState<string | null>(null);
  const [showCheckoutQr, setShowCheckoutQr] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- LECTURER TABBED CONSOLE CONTROLS ---
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'live' | 'reports' | 'invites' | 'settings'>('dashboard');
  
  // Dashboard Analytics States
  const [stats, setStats] = useState<any>({
    totalStudents: 0,
    totalSessions: 0,
    studentsBelowThreshold: 0,
    overallPercentage: 100,
    avgDuration: 0,
    earlyLeaversCount: 0,
  });

  // Reports tab states
  const [courseReports, setCourseReports] = useState<any[]>([]);

  // Invites tab states
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [intendedRole, setIntendedRole] = useState<'lecturer' | 'ta'>('ta');
  const [selectedInviteCourses, setSelectedInviteCourses] = useState<number[]>([]);
  const [inviteExpiryHours, setInviteExpiryHours] = useState('48');

  // Settings states
  const [settings, setSettings] = useState({
    minThreshold: 75,
    gpsRadius: 200,
    earlyLeaverThreshold: 10,
    checkoutWindowMins: 15,
  });

  const isStaff = user?.role === 'lecturer' || user?.role === 'ta';

  useEffect(() => {
    loadCoursesOnMount();
    loadLocalSettings();
  }, []);

  const loadLocalSettings = async () => {
    try {
      const data = await AsyncStorage.getItem('app_settings');
      if (data) {
        setSettings(JSON.parse(data));
      }
    } catch (e) {
      console.warn('Error reading app settings:', e);
    }
  };

  const saveLocalSettings = async (newSettings: typeof settings) => {
    try {
      await AsyncStorage.setItem('app_settings', JSON.stringify(newSettings));
      setSettings(newSettings);
      Alert.alert('Success', 'Settings saved locally.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStudentActiveSession();
      await loadStudentHistory();
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadStudentHistory = async () => {
    try {
      const historyData = await apiFetch('/api/student/history');
      setHistory(historyData);
      const active = historyData.find((h: any) => !h.checkout_time && h.is_active);
      if (active) {
        setActiveCheckin(active);
      } else {
        setActiveCheckin(null);
      }
    } catch (e: any) {
      console.warn('Failed to load student history:', e.message);
    }
  };

  const fetchStudentActiveSession = async () => {
    try {
      const sessionData = await apiFetch('/api/student/active-session');
      setActiveSession(sessionData);
      return sessionData;
    } catch (e: any) {
      console.warn('Failed to fetch student active session:', e.message);
      return null;
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!isStaff) {
        fetchStudentActiveSession();
        loadStudentHistory();
      }
    }, [isStaff])
  );

  // Poll active session for students (every 30 seconds)
  useEffect(() => {
    let intervalId: any;
    if (!isStaff) {
      const pollActiveSession = async () => {
        try {
          const sessionData = await apiFetch('/api/student/active-session');
          
          // Re-fetch history if active session closes
          if (activeSession && !sessionData) {
            loadStudentHistory();
          }
          
          setActiveSession(sessionData);
        } catch (e: any) {
          console.warn('Poll active session error:', e.message);
        }
      };
      intervalId = setInterval(pollActiveSession, 30000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isStaff, activeSession]);

  const loadCoursesOnMount = async () => {
    setLoading(true);
    try {
      if (isStaff) {
        const courseData = await apiFetch('/api/lecturer/courses');
        setCourses(courseData);
        if (courseData.length === 1) {
          setSelectedCourse(courseData[0]);
        }
      } else {
        const courseData = await apiFetch('/api/student/courses');
        setCourses(courseData);

        await loadStudentHistory();
        await fetchStudentActiveSession();
      }
    } catch (err: any) {
      console.warn('Dashboard mount fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Student countdown state initialization and interval tick handler
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isStaff && activeSession && activeSession.end_time) {
      const endTime = new Date(activeSession.end_time).getTime();
      if (isNaN(endTime)) {
        setSecondsRemaining(null);
        setWindowClosed(false);
        return;
      }

      const initialSecs = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      if (initialSecs <= 0) {
        setSecondsRemaining(0);
        setWindowClosed(true);
      } else {
        setSecondsRemaining(initialSecs);
        setWindowClosed(false);

        intervalRef.current = setInterval(() => {
          setSecondsRemaining((prev) => {
            if (prev === null || prev <= 1) {
              setWindowClosed(true);
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      setSecondsRemaining(null);
      setWindowClosed(false);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeSession, isStaff]);

  // Under-1-minute pulse animation handler
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (secondsRemaining !== null && secondsRemaining < 60 && !windowClosed) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [secondsRemaining, windowClosed]);

  // Triggered when selectedCourse changes (Lecturers only)
  useEffect(() => {
    if (isStaff) {
      if (selectedCourse) {
        setActiveSession(null);
        setLecturerSessions([]);
        setLiveAttendance([]);
        setCheckoutEnabled(false);
        setCheckoutQrToken(null);
        setCheckoutCode(null);
        setShowCheckoutQr(false);
        
        loadLecturerSessionsForCourse(selectedCourse.id);
        loadDashboardStats(selectedCourse.id);
        loadCourseReports(selectedCourse.id);
        loadInviteCodes();
      }
    }
  }, [selectedCourse]);

  const loadDashboardStats = async (courseId: number) => {
    try {
      const statsData = await apiFetch(`/api/lecturer/dashboard-stats?course_id=${courseId}&min_threshold=${settings.minThreshold}`);
      setStats(statsData);
    } catch (e: any) {
      console.warn('Dashboard stats fetch error:', e.message);
    }
  };

  const loadCourseReports = async (courseId: number) => {
    try {
      const reportData = await apiFetch(`/api/lecturer/courses/${courseId}/report`);
      setCourseReports(reportData);
    } catch (e: any) {
      console.warn('Course reports fetch error:', e.message);
    }
  };

  const loadInviteCodes = async () => {
    try {
      if (user?.role === 'lecturer') {
        const codes = await apiFetch('/api/lecturer/invite-codes');
        setInviteCodes(codes);
      }
    } catch (e: any) {
      console.warn('Invite codes fetch error:', e.message);
    }
  };

  const handleGenerateInvite = async () => {
    if (intendedRole === 'ta' && selectedInviteCourses.length === 0) {
      Alert.alert('Error', 'Please select at least one course for TA assignment.');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/lecturer/invite-codes/generate', {
        method: 'POST',
        body: JSON.stringify({
          intended_role: intendedRole,
          course_ids: intendedRole === 'ta' ? selectedInviteCourses : [],
          expires_in_hours: parseInt(inviteExpiryHours) || 48,
        }),
      });
      Alert.alert('Success', 'Invite code generated successfully.');
      setSelectedInviteCourses([]);
      loadInviteCodes();
    } catch (e: any) {
      Alert.alert('Generation Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeInvite = async (id: number) => {
    setLoading(true);
    try {
      await apiFetch(`/api/lecturer/invite-codes/${id}/revoke`, {
        method: 'POST',
      });
      Alert.alert('Success', 'Invite code revoked.');
      loadInviteCodes();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLecturerSessionsForCourse = async (courseId: number) => {
    setLoading(true);
    try {
      const sessionData = await apiFetch(`/api/lecturer/sessions?course_id=${courseId}`);
      setLecturerSessions(sessionData);
      
      const active = sessionData.find((s: any) => s.is_active && s.course_id === courseId);
      if (active) {
        setActiveSession(active);
        if (active.checkout_qr_token || active.checkout_session_code) {
          setCheckoutEnabled(true);
          setCheckoutQrToken(active.checkout_qr_token);
          setCheckoutCode(active.checkout_session_code);
        }
      } else {
        setActiveSession(null);
        setCheckoutEnabled(false);
        setCheckoutQrToken(null);
        setCheckoutCode(null);
        setShowCheckoutQr(false);
      }
    } catch (err: any) {
      console.warn('Fetch sessions error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh live list interval for active sessions (Lecturers only)
  useEffect(() => {
    let intervalId: any;
    if (isStaff && activeSession && activeSession.id) {
      const fetchLiveList = async () => {
        try {
          const list = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
          setLiveAttendance(list.records || []);
        } catch (err: any) {
          console.warn('Live attendance list fetch error:', err.message);
        }
      };
      fetchLiveList();
      intervalId = setInterval(fetchLiveList, 15000);
    } else {
      setLiveAttendance([]);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSession, isStaff]);

  const handleStartSession = async (courseId: number) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/lecturer/sessions', {
        method: 'POST',
        body: JSON.stringify({
          course_id: courseId,
          type: 'qr',
          duration_minutes: 60,
        }),
      });
      Alert.alert('Session Started', `Active session generated code: ${res.session_code}`);
      if (selectedCourse) {
        loadLecturerSessionsForCourse(selectedCourse.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async (sessionId: number) => {
    setLoading(true);
    try {
      await apiFetch(`/api/lecturer/sessions/${sessionId}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: false }),
      });
      setActiveSession(null);
      setCheckoutEnabled(false);
      setCheckoutQrToken(null);
      setCheckoutCode(null);
      setShowCheckoutQr(false);
      
      Alert.alert('Session Closed', 'The session has been ended successfully.');
      
      // Scroll back to top immediately
      staffScrollViewRef.current?.scrollTo({ y: 0, animated: true });

      if (selectedCourse) {
        loadLecturerSessionsForCourse(selectedCourse.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Checkout Window (Lecturers only)
  const handleToggleCheckout = async (value: boolean) => {
    if (!activeSession) return;
    setLoading(true);
    try {
      if (value) {
        const res = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/activate-checkout`, {
          method: 'POST',
          body: JSON.stringify({
            checkout_window_minutes: settings.checkoutWindowMins,
            early_leaver_threshold_minutes: settings.earlyLeaverThreshold,
          }),
        });
        setCheckoutEnabled(true);
        setCheckoutQrToken(res.checkout_qr_token);
        setCheckoutCode(res.checkout_session_code);
        Alert.alert('Success', 'Checkout window is now open');
      } else {
        await apiFetch(`/api/lecturer/sessions/${activeSession.id}/deactivate-checkout`, {
          method: 'PUT',
        });
        setCheckoutEnabled(false);
        setCheckoutQrToken(null);
        setCheckoutCode(null);
        setShowCheckoutQr(false);
        Alert.alert('Success', 'Checkout window closed');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleInviteCourse = (id: number) => {
    if (selectedInviteCourses.includes(id)) {
      setSelectedInviteCourses(selectedInviteCourses.filter((cId) => cId !== id));
    } else {
      setSelectedInviteCourses([...selectedInviteCourses, id]);
    }
  };

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getCountdownColor = () => {
    if (secondsRemaining === null) return Colors.White;
    if (secondsRemaining > 60) return Colors.White;
    return Colors.Warning;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color={Colors.Primary} />
      </View>
    );
  }

  const handleExportCSV = async () => {
    if (history.length === 0) {
      Alert.alert('No records', 'No attendance records to export');
      return;
    }

    try {
      const csvData = history.map((record) => {
        const checkinTime = record.timestamp || record.checkin_time
          ? new Date(record.timestamp || record.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '--:--';
        const checkoutTime = record.checkout_timestamp || record.checkout_time
          ? new Date(record.checkout_timestamp || record.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '--:--';
        return {
          'Date': new Date(record.timestamp || record.checkin_time).toLocaleDateString(),
          'Course Code': record.course_code || '',
          'Course Name': record.course_name || '',
          'Check-in Time': checkinTime,
          'Check-out Time': checkoutTime,
          'Duration (mins)': record.duration_minutes || record.duration || '--',
          'Status': record.attendance_status || 'present',
        };
      });

      const csvString = Papa.unparse(csvData);
      const fileUri = FileSystem.cacheDirectory + 'smartroll_attendance.csv';
      await FileSystem.writeAsStringAsync(fileUri, csvString, {
        encoding: 'utf8',
      });

      await Sharing.shareAsync(fileUri);
      Alert.alert('Success', 'Attendance records exported successfully.');
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Could not export attendance data.');
    }
  };

  const checkedInStudents = liveAttendance.filter((r) => r.is_present);

  // Avatar initials helper
  const getInitials = (fullName?: string) => {
    if (!fullName) return '';
    return fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Greeting helper
  const greetingText = `Good morning, ${user?.name?.split(' ')[0] || ''}`;
  const currentDateString = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.White} />
      
      {/* HEADER BAR (COMMON) */}
      <View style={styles.header}>
        <View>
          {isStaff ? (
            <Text style={styles.welcomeText}>SmartRoll</Text>
          ) : (
            <Text style={styles.welcomeText}>{greetingText}</Text>
          )}
          <Text style={styles.dateText}>{currentDateString}</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.avatar} onPress={() => setProfileMenuVisible(true)} activeOpacity={0.75}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PORTAL SPECIFIC BODY */}
      {!isStaff ? (
        // STUDENT PORTAL VIEW
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {activeSession ? (
            // Active Session Card
            <View style={styles.activeSessionCard}>
              <Text style={styles.activeCourseCode}>
                {activeSession.course_code}
              </Text>
              <Text style={styles.activeCourseName}>
                {activeSession.course_name}
              </Text>
              
              {/* Pills row */}
              <View style={styles.pillsRow}>
                <View style={styles.pillWhite}>
                  <Text style={styles.pillWhiteText}>Level {activeSession.level || user?.level}</Text>
                </View>
                <View style={styles.pillWhite}>
                  <Text style={styles.pillWhiteText}>Sem 1</Text>
                </View>
              </View>

              {/* Attendance specific sub-states */}
              {(() => {
                const activeSessionRecord = history.find((h: any) => h.session_id === activeSession.id);
                const isCheckedIn = !!activeSessionRecord;
                const hasCheckedOut = !!(activeSessionRecord?.checkout_timestamp || activeSessionRecord?.checkout_time);

                if (isCheckedIn) {
                  if (hasCheckedOut) {
                    return (
                      <View style={styles.statusPillAlert}>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.Success} />
                        <Text style={styles.statusPillAlertText}>
                          Checked out · {new Date(activeSessionRecord.checkout_timestamp || activeSessionRecord.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    );
                  }
                  
                  return (
                    <View style={styles.statusPillAlert}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.Success} />
                      <Text style={styles.statusPillAlertText}>
                        Checked in · Waiting for checkout
                      </Text>
                    </View>
                  );
                }

                // Not checked in yet - show countdown & buttons
                return (
                  <View style={{ width: '100%', alignItems: 'center' }}>
                    {activeSession.end_time && (
                      <View style={[
                        styles.countdownContainer,
                        secondsRemaining !== null && secondsRemaining < 60 && styles.countdownContainerWarning
                      ]}>
                        {windowClosed ? (
                          <Text style={styles.windowClosedText}>Window closed</Text>
                        ) : secondsRemaining !== null ? (
                          <Animated.View
                            style={[
                              styles.timerRow,
                              {
                                opacity: secondsRemaining < 60 ? pulseAnim : 1,
                              },
                            ]}
                          >
                            <Ionicons name="time" size={18} color={getCountdownColor()} />
                            <Text style={[styles.timerText, { color: getCountdownColor() }]}>
                              check-in closes in {formatCountdown(secondsRemaining)}
                            </Text>
                          </Animated.View>
                        ) : null}
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.primaryCheckinBtn}
                      onPress={() => router.push('/scanner')}
                      disabled={windowClosed}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="qr-code-outline" size={20} color={Colors.Primary} />
                      <Text style={styles.primaryCheckinBtnText}>Scan QR Code</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryCheckinLink}
                      onPress={() => router.push('/code-entry')}
                      disabled={windowClosed}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.secondaryCheckinLinkText}>Enter code instead →</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          ) : (
            // No Active Session State
            <View style={styles.noActiveSessionContainer}>
              <View style={styles.calendarIconContainer}>
                <Ionicons name="calendar-outline" size={64} color={Colors.Neutral200} />
              </View>
              <Text style={styles.noActiveSessionTitle}>No active session</Text>
              <Text style={styles.noActiveSessionSubtext}>
                Your lecturer hasn't started a session yet
              </Text>
            </View>
          )}

          {/* Student Checkout Section (Floating island checkout card) */}
          {(() => {
            const activeSessionRecord = activeSession ? history.find((h: any) => h.session_id === activeSession.id) : null;
            const isCheckedIn = !!activeSessionRecord;
            const hasCheckedOut = !!(activeSessionRecord?.checkout_timestamp || activeSessionRecord?.checkout_time);
            
            if (activeSession && activeSession.checkout_qr_token && isCheckedIn && !hasCheckedOut) {
              return (
                <View style={styles.checkoutPillCard}>
                  <View style={styles.checkoutPillLeft}>
                    <View style={styles.checkmarkIconBg}>
                      <Ionicons name="checkmark" size={16} color={Colors.Success} />
                    </View>
                    <Text style={styles.checkoutPillText}>You're checked in</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.checkoutPillBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/checkout',
                        params: {
                          session_id: activeSession.id,
                          course_name: activeSession.course_name,
                          course_code: activeSession.course_code,
                        },
                      })
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={styles.checkoutPillBtnText}>Check Out</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return null;
          })()}

          {/* Attendance summary horizontal list */}
          <Text style={styles.sectionHeaderTitle}>Your attendance</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContent}
          >
            {courses.map((course) => {
              const total = course.total_sessions !== undefined && course.total_sessions !== null ? Number(course.total_sessions) : 0;
              const attended = course.attended !== undefined && course.attended !== null ? Number(course.attended) : 0;
              const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

              // Color coding
              let percentColor = Colors.Neutral900;
              if (percentage < 50) percentColor = Colors.Danger;
              else if (percentage < 75) percentColor = Colors.Warning;

              return (
                <View key={course.id} style={styles.courseSummaryCard}>
                  <Text style={styles.courseSummaryCode}>{course.code}</Text>
                  <Text style={[styles.courseSummaryPercentage, { color: percentColor }]}>
                    {percentage}%
                  </Text>
                  <Text style={styles.courseSummaryRatio}>
                    {attended} of {total} sessions
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Attendance History Section with CSV Export Button */}
          <View style={styles.historyHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Attendance History</Text>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={handleExportCSV}
              activeOpacity={0.75}
            >
              <Ionicons name="download-outline" size={18} color={Colors.Neutral600} />
            </TouchableOpacity>
          </View>

          {history.length === 0 ? (
            <Text style={styles.emptyText}>No check-ins recorded yet.</Text>
          ) : (
            history.map((record: any, index: number) => (
              <View key={index} style={styles.itemRow}>
                <View>
                  <Text style={styles.itemName}>{record.course_name}</Text>
                  <Text style={styles.itemMeta}>
                    Date: {new Date(record.timestamp || record.checkin_time).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.statusBadge,
                    record.attendance_status === 'present' ? styles.presentBadge : styles.lateBadge,
                  ]}
                >
                  {record.attendance_status || 'present'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        // LECTURER / TA PORTAL VIEW
        <View style={styles.staffContainer}>
          <ScrollView
            ref={staffScrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContentStaff}
            showsVerticalScrollIndicator={false}
          >
            {/* Course Selector pills */}
            <View style={styles.selectorContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {courses.map((course) => {
                  const isSelected = selectedCourse?.id === course.id;
                  return (
                    <TouchableOpacity
                      key={course.id}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => setSelectedCourse(course)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                        {course.code} · L{course.level}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {!selectedCourse ? (
              // Banner when no course is active
              <View style={styles.indigoSelectorBanner}>
                <Text style={styles.indigoSelectorBannerText}>Select a course to begin</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.White} />
              </View>
            ) : (
              <View style={styles.tabContentContainer}>
                {/* TAB CONTENT: 1. DASHBOARD */}
                {activeSubTab === 'dashboard' && (
                  <View style={{ gap: Spacing.lg }}>
                    {/* Stats Grid */}
                    <View style={styles.statsRow}>
                      <View style={styles.statsCardMetric}>
                        <Text style={styles.statsCardMetricValue}>{stats.totalStudents}</Text>
                        <Text style={styles.statsCardMetricLabel}>Enrolled</Text>
                      </View>
                      <View style={styles.statsCardMetric}>
                        <Text style={styles.statsCardMetricValue}>{stats.totalSessions}</Text>
                        <Text style={styles.statsCardMetricLabel}>Sessions</Text>
                      </View>
                      <View style={styles.statsCardMetric}>
                        <Text style={styles.statsCardMetricValue}>{stats.overallPercentage}%</Text>
                        <Text style={styles.statsCardMetricLabel}>Avg. Attendance</Text>
                      </View>
                    </View>

                    {/* Active Session Creator / Controller */}
                    {activeSession ? (
                      <View style={styles.staffActiveSessionCard}>
                        <View style={styles.pulseActiveHeader}>
                          <Text style={styles.staffActiveSessionTitle}>Session active</Text>
                          <View style={styles.greenPulsingDot} />
                        </View>
                        <Text style={styles.staffActiveSessionCourseName}>
                          {selectedCourse.name}
                        </Text>
                        <Text style={styles.staffActiveSessionMeta}>
                          Code: {activeSession.session_code} · Started: {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>

                        <View style={styles.staffActiveSessionActions}>
                          <TouchableOpacity
                            style={styles.staffActiveShowQrBtn}
                            onPress={() => router.push({
                              pathname: '/qr-display',
                              params: {
                                courseId: selectedCourse.id,
                                courseCode: selectedCourse.code,
                              }
                            })}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.staffActiveShowQrBtnText}>Show QR Code</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.staffActiveEndBtn}
                            onPress={() => handleEndSession(activeSession.id)}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.staffActiveEndBtnText}>Close Session</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flex: 1 }}>
                        <TouchableOpacity
                          style={styles.startSessionButtonFull}
                          onPress={() => handleStartSession(selectedCourse.id)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="play" size={18} color={Colors.White} />
                          <Text style={styles.startSessionButtonFullText}>Start Session</Text>
                        </TouchableOpacity>

                        <View style={styles.lecturerNoSessionContainer}>
                          <Ionicons name="calendar-outline" size={56} color="#9CA3AF" />
                          <Text style={styles.lecturerNoSessionTitle}>No active session</Text>
                          <Text style={styles.lecturerNoSessionSubtext}>
                            Start a session to begin taking attendance
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* TAB CONTENT: 2. LIVE ATTENDANCES LIST */}
                {activeSubTab === 'live' && (
                  <View style={{ gap: Spacing.lg }}>
                    <View style={styles.liveHeaderCounterRow}>
                      <Text style={styles.liveHeaderCounterValuePrimary}>
                        {checkedInStudents.length}
                      </Text>
                      <Text style={styles.liveHeaderCounterValueSecondary}>
                        / {liveAttendance.length} checked in
                      </Text>
                    </View>

                    {/* Switch controller for checkout */}
                    {activeSession && (
                      <View style={styles.checkoutSwitchCard}>
                        <View style={styles.checkoutSwitchLeft}>
                          <Text style={styles.checkoutSwitchTitle}>Enable Student Checkout</Text>
                          {checkoutEnabled && checkoutCode && (
                            <Text style={styles.checkoutSwitchCode}>Code: {checkoutCode}</Text>
                          )}
                        </View>
                        <Switch
                          value={checkoutEnabled}
                          onValueChange={handleToggleCheckout}
                          trackColor={{ false: Colors.Neutral200, true: Colors.Primary }}
                          thumbColor={Colors.White}
                        />
                      </View>
                    )}

                    {/* Student List View */}
                    <View style={styles.liveListContainer}>
                      {liveAttendance.length === 0 ? (
                        <Text style={styles.emptyText}>No check-ins yet. Waiting for students...</Text>
                      ) : (
                        liveAttendance.map((item) => {
                          const checkinTime = item.timestamp
                            ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '--:--';
                          return (
                            <View key={item.student_id.toString()} style={styles.studentListRow}>
                              <View style={styles.studentListRowLeft}>
                                <View style={styles.studentInitialsCircle}>
                                  <Text style={styles.studentInitialsText}>
                                    {getInitials(item.name)}
                                  </Text>
                                </View>
                                <View>
                                  <Text style={styles.studentListName}>{item.name}</Text>
                                  <Text style={styles.studentListId}>{item.academic_student_id}</Text>
                                </View>
                              </View>

                              <View style={styles.studentListRowRight}>
                                <Text style={styles.studentListTime}>{checkinTime}</Text>
                                <View style={styles.studentListBadgesRow}>
                                  {item.attendance_status && item.attendance_status !== 'present' && (
                                    <View style={item.attendance_status === 'late' ? styles.pillLate : styles.pillEarly}>
                                      <Text style={item.attendance_status === 'late' ? styles.pillLateText : styles.pillEarlyText}>
                                        {item.attendance_status === 'late' ? 'Late' : 'Early'}
                                      </Text>
                                    </View>
                                  )}
                                  {item.checkout_timestamp && (
                                    <View style={styles.studentCheckoutPill}>
                                      <Text style={styles.studentCheckoutPillText}>Out</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                )}

                {/* TAB CONTENT: 3. REPORTS */}
                {activeSubTab === 'reports' && (
                  <View style={styles.card}>
                    <Text style={styles.cardHeaderTitleText}>Cross-Student Report</Text>
                    <View style={styles.reportList}>
                      {courseReports.length === 0 ? (
                        <Text style={styles.emptyText}>No report records found.</Text>
                      ) : (
                        courseReports.map((record, index) => {
                          const rate = record.total_sessions > 0
                            ? Math.round((record.attended_sessions / record.total_sessions) * 100)
                            : 100;
                          const isBelow = rate < settings.minThreshold;

                          return (
                            <View key={index} style={styles.reportRowCard}>
                              <View>
                                <Text style={styles.reportRowStudentName}>{record.name}</Text>
                                <Text style={styles.reportRowStudentId}>
                                  ID: {record.academic_student_id} · Level {record.level}
                                </Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[
                                  styles.reportRowPercentage,
                                  { color: isBelow ? Colors.Danger : Colors.Success }
                                ]}>
                                  {rate}%
                                </Text>
                                <Text style={styles.reportRowSessionsRatio}>
                                  {record.attended_sessions} / {record.total_sessions} sessions
                                </Text>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                )}

                {/* TAB CONTENT: 4. STAFF INVITE MANAGER */}
                {activeSubTab === 'invites' && user?.role === 'lecturer' && (
                  <View style={{ gap: Spacing.lg }}>
                    <View style={styles.card}>
                      <Text style={styles.cardHeaderTitleText}>Generate Registration Invite</Text>

                      <Text style={styles.settingsLabel}>Intended Role</Text>
                      <View style={styles.roleSelectionRow}>
                        <TouchableOpacity
                          style={[styles.roleBtn, intendedRole === 'lecturer' && styles.roleBtnActive]}
                          onPress={() => setIntendedRole('lecturer')}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.roleBtnText, intendedRole === 'lecturer' && styles.roleBtnTextActive]}>
                            Lecturer
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.roleBtn, intendedRole === 'ta' && styles.roleBtnActive]}
                          onPress={() => setIntendedRole('ta')}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.roleBtnText, intendedRole === 'ta' && styles.roleBtnTextActive]}>
                            TA
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {intendedRole === 'ta' && (
                        <View style={{ marginTop: Spacing.md }}>
                          <Text style={styles.settingsLabel}>Assign Course(s)</Text>
                          {courses.map((course) => {
                            const isAssigned = selectedInviteCourses.includes(course.id);
                            return (
                              <TouchableOpacity
                                key={course.id}
                                style={[styles.inviteCourseChip, isAssigned && styles.inviteCourseChipActive]}
                                onPress={() => toggleInviteCourse(course.id)}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.inviteCourseChipText, isAssigned && styles.inviteCourseChipTextActive]}>
                                  {course.code} - {course.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      <Text style={[styles.settingsLabel, { marginTop: Spacing.md }]}>Expires In (Hours)</Text>
                      <TextInput
                        style={styles.settingsInput}
                        keyboardType="numeric"
                        value={inviteExpiryHours}
                        onChangeText={setInviteExpiryHours}
                      />

                      <TouchableOpacity style={styles.staffGenerateBtn} onPress={handleGenerateInvite} activeOpacity={0.75}>
                        <Text style={styles.staffGenerateBtnText}>Generate Invite Code</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardHeaderTitleText}>Generated Invite Codes</Text>
                      {inviteCodes.length === 0 ? (
                        <Text style={styles.emptyText}>No invite codes generated yet.</Text>
                      ) : (
                        inviteCodes.map((code) => {
                          const isExpired = new Date(code.expires_at) < new Date();
                          return (
                            <View key={code.id} style={styles.inviteCodeRowCard}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.inviteCodeStringText}>{code.code}</Text>
                                <Text style={styles.inviteCodeMetaText}>
                                  Role: {code.intended_role.toUpperCase()}
                                </Text>
                                <Text style={[styles.inviteCodeMetaText, isExpired && { color: Colors.Danger }]}>
                                  Expires: {new Date(code.expires_at).toLocaleDateString()} {isExpired ? '(Expired)' : ''}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.inviteCodeRevokeBtn}
                                onPress={() => handleRevokeInvite(code.id)}
                                activeOpacity={0.75}
                              >
                                <Text style={styles.inviteCodeRevokeBtnText}>Revoke</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                )}

                {/* TAB CONTENT: 5. SETTINGS */}
                {activeSubTab === 'settings' && (
                  <View style={styles.card}>
                    <Text style={styles.cardHeaderTitleText}>Console Local Settings</Text>

                    <Text style={styles.settingsLabel}>Min Attendance Threshold (%)</Text>
                    <TextInput
                      style={styles.settingsInput}
                      keyboardType="numeric"
                      value={settings.minThreshold.toString()}
                      onChangeText={(val) => setSettings({ ...settings, minThreshold: parseInt(val) || 75 })}
                    />

                    <Text style={styles.settingsLabel}>Default GPS Radius (Meters)</Text>
                    <TextInput
                      style={styles.settingsInput}
                      keyboardType="numeric"
                      value={settings.gpsRadius.toString()}
                      onChangeText={(val) => setSettings({ ...settings, gpsRadius: parseInt(val) || 200 })}
                    />

                    <Text style={styles.settingsLabel}>Grace Checkout window (Minutes)</Text>
                    <TextInput
                      style={styles.settingsInput}
                      keyboardType="numeric"
                      value={settings.checkoutWindowMins.toString()}
                      onChangeText={(val) => setSettings({ ...settings, checkoutWindowMins: parseInt(val) || 15 })}
                    />

                    <Text style={styles.settingsLabel}>Early Checkout Threshold (Minutes)</Text>
                    <TextInput
                      style={styles.settingsInput}
                      keyboardType="numeric"
                      value={settings.earlyLeaverThreshold.toString()}
                      onChangeText={(val) => setSettings({ ...settings, earlyLeaverThreshold: parseInt(val) || 10 })}
                    />

                    <TouchableOpacity
                      style={styles.settingsApplyBtn}
                      onPress={() => saveLocalSettings(settings)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.settingsApplyBtnText}>Apply Settings</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* NATIVE BOTTOM TAB BAR FOR LECTURER */}
          <View style={styles.bottomTabBar}>
            {([
              { id: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
              { id: 'live', label: 'Live', icon: 'flash-outline' },
              { id: 'reports', label: 'Reports', icon: 'document-text-outline' },
              user?.role === 'lecturer' && { id: 'invites', label: 'Invites', icon: 'people-outline' },
              { id: 'settings', label: 'Settings', icon: 'settings-outline' },
            ].filter(Boolean) as any[]).map((tab) => {
              const isTabActive = activeSubTab === tab.id;
              const tabColor = isTabActive ? Colors.Primary : Colors.Neutral400;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabBarItem}
                  onPress={() => setActiveSubTab(tab.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={tab.icon} size={20} color={tabColor} />
                  <Text style={[styles.tabBarLabel, { color: tabColor }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      {/* Profile Menu Modal Overlay */}
      <Modal
        visible={profileMenuVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header / Close */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {isChangingPassword ? 'Change Password' : 'Account Profile'}
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setProfileMenuVisible(false);
                  setIsChangingPassword(false);
                }} 
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={Colors.Neutral600} />
              </TouchableOpacity>
            </View>

            {isChangingPassword ? (
              /* Change Password Form View */
              <View style={styles.passwordForm}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Current Password</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Enter current password"
                    secureTextEntry={true}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>New Password</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Enter new password (min. 6 chars)"
                    secureTextEntry={true}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Confirm New Password</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Confirm new password"
                    secureTextEntry={true}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                </View>

                <View style={styles.formActionsRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setIsChangingPassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    style={styles.formCancelBtn}
                    disabled={changingPasswordLoading}
                  >
                    <Text style={styles.formCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleChangePassword}
                    style={styles.formSubmitBtn}
                    disabled={changingPasswordLoading}
                  >
                    {changingPasswordLoading ? (
                      <ActivityIndicator size="small" color={Colors.White} />
                    ) : (
                      <Text style={styles.formSubmitBtnText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Profile Details & Sync View */
              <>
                {/* Profile Info Card */}
                <View style={styles.profileCard}>
                  <View style={styles.profileAvatarBig}>
                    <Text style={styles.profileAvatarTextBig}>{getInitials(user?.name)}</Text>
                  </View>
                  <Text style={styles.profileName}>{user?.name}</Text>
                  <Text style={styles.profileRole}>{user?.role?.toUpperCase()}</Text>
                  <Text style={styles.profileEmail}>{user?.email || user?.student_id || 'User account'}</Text>
                </View>

                {/* Offline Sync Status Section */}
                <View style={styles.syncSection}>
                  <View style={styles.syncRow}>
                    <View style={styles.syncIconContainer}>
                      <Ionicons 
                        name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"} 
                        size={20} 
                        color={isOnline ? "#059669" : "#D97706"} 
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.syncTitle}>Connection Status</Text>
                      <Text style={styles.syncSubtitle}>
                        {isOnline ? "Online — database connected" : "Offline mode — changes cached"}
                      </Text>
                    </View>
                    <View style={[styles.statusIndicator, { backgroundColor: isOnline ? '#D1FAE5' : '#FEF3C7' }]}>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: isOnline ? '#065F46' : '#92400E' }}>
                        {isOnline ? "ONLINE" : "OFFLINE"}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.syncRow, { marginTop: 16 }]}>
                    <View style={styles.syncIconContainer}>
                      <Ionicons name="sync-outline" size={20} color={Colors.Brand600} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.syncTitle}>Offline Sync Queue</Text>
                      <Text style={styles.syncSubtitle}>
                        {queueLength} pending check-in requests
                      </Text>
                    </View>
                    {queueLength > 0 && (
                      <TouchableOpacity 
                        onPress={() => {
                          Alert.alert(
                            'Clear Queue',
                            'Are you sure you want to clear your local offline check-in queue?',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Clear', style: 'destructive', onPress: () => { clearQueue(); Alert.alert('Success', 'Offline queue cleared.'); } }
                            ]
                          );
                        }}
                        style={styles.clearQueueBtn}
                      >
                        <Text style={styles.clearQueueBtnText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            )}

            {/* Valuable Actions */}
            <View style={{ marginTop: 'auto', gap: 10, marginBottom: 12 }}>
              {!isChangingPassword && (
                <TouchableOpacity
                  onPress={() => setIsChangingPassword(true)}
                  style={styles.changePasswordBtn}
                >
                  <Ionicons name="key-outline" size={20} color={Colors.Brand700} />
                  <Text style={styles.changePasswordBtnText}>Change Password</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setProfileMenuVisible(false);
                  setIsChangingPassword(false);
                  handleLogoutConfirmation();
                }}
                style={styles.logoutButton}
              >
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                <Text style={styles.logoutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.White,
  },
  header: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 0.5,
    borderColor: Colors.Neutral200,
    backgroundColor: Colors.White,
  },
  welcomeText: {
    ...Typography.Body,
    fontWeight: '500',
    color: Colors.Neutral900,
  },
  dateText: {
    ...Typography.Label,
    color: Colors.Neutral400,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.PrimaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  activeSessionCard: {
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  activeCourseCode: {
    ...Typography.Label,
    color: 'rgba(255, 255, 255, 0.75)',
    textTransform: 'uppercase',
  },
  activeCourseName: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
    textAlign: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pillWhite: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pillWhiteText: {
    ...Typography.Caption,
    color: Colors.White,
    fontWeight: '600',
  },
  countdownContainer: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  countdownContainerWarning: {
    backgroundColor: Colors.WarningLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.Warning,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  timerText: {
    ...Typography.Body,
    fontWeight: '600',
  },
  windowClosedText: {
    ...Typography.Body,
    color: Colors.Danger,
    fontWeight: '600',
  },
  primaryCheckinBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
    height: 52,
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.md,
  },
  primaryCheckinBtnText: {
    ...Typography.Body,
    color: Colors.Primary,
    fontWeight: '600',
  },
  secondaryCheckinLink: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  secondaryCheckinLinkText: {
    ...Typography.Label,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  statusPillAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.SuccessLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusPillAlertText: {
    ...Typography.Caption,
    color: Colors.Success,
    fontWeight: '600',
  },
  noActiveSessionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  calendarIconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Neutral100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  noActiveSessionTitle: {
    ...Typography.Heading,
    color: Colors.Neutral600,
  },
  noActiveSessionSubtext: {
    ...Typography.Body,
    color: Colors.Neutral400,
    textAlign: 'center',
  },
  checkoutPillCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.SuccessLight,
    borderWidth: 1,
    borderColor: Colors.Success,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  checkoutPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkmarkIconBg: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.SuccessLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.Success,
  },
  checkoutPillText: {
    ...Typography.Body,
    color: Colors.Success,
    fontWeight: '500',
  },
  checkoutPillBtn: {
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.Success,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutPillBtnText: {
    ...Typography.Label,
    color: Colors.Success,
    fontWeight: '600',
  },
  sectionHeaderTitle: {
    ...Typography.Label,
    color: Colors.Neutral400,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  horizontalScrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  courseSummaryCard: {
    width: 160,
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.Card,
    borderWidth: 1,
    borderColor: Colors.Neutral100,
  },
  courseSummaryCode: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
  },
  courseSummaryPercentage: {
    ...Typography.Display,
    marginVertical: Spacing.xs,
  },
  courseSummaryRatio: {
    ...Typography.Caption,
    color: Colors.Neutral400,
  },
  staffContainer: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  scrollContentStaff: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 90, // Avoid bottom nav overlap
    gap: Spacing.lg,
  },
  selectorContainer: {
    paddingVertical: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
  },
  chipActive: {
    backgroundColor: Colors.Primary,
  },
  chipText: {
    ...Typography.Label,
    color: Colors.Neutral600,
    fontWeight: '600',
  },
  chipTextActive: {
    color: Colors.White,
  },
  indigoSelectorBanner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.Primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  indigoSelectorBannerText: {
    ...Typography.Body,
    color: Colors.White,
    fontWeight: '600',
  },
  tabContentContainer: {
    gap: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsCardMetric: {
    flex: 1,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statsCardMetricValue: {
    ...Typography.Display,
    color: Colors.Neutral900,
  },
  statsCardMetricLabel: {
    ...Typography.Caption,
    color: Colors.Neutral400,
    marginTop: 2,
  },
  staffActiveSessionCard: {
    backgroundColor: Colors.SuccessLight,
    borderWidth: 1,
    borderColor: Colors.Success,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  pulseActiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  greenPulsingDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Success,
  },
  staffActiveSessionTitle: {
    ...Typography.Label,
    color: Colors.Success,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  staffActiveSessionCourseName: {
    ...Typography.Heading,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
  staffActiveSessionMeta: {
    ...Typography.Label,
    color: Colors.Neutral600,
    marginTop: Spacing.xs,
  },
  staffActiveSessionActions: {
    flexDirection: 'column',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  staffActiveShowQrBtn: {
    height: 48,
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffActiveShowQrBtnText: {
    ...Typography.Body,
    color: Colors.White,
    fontWeight: '600',
  },
  staffActiveEndBtn: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.Danger,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffActiveEndBtnText: {
    ...Typography.Body,
    color: Colors.Danger,
    fontWeight: '600',
  },
  startSessionButtonFull: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 52,
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
  },
  startSessionButtonFullText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
  liveHeaderCounterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: -Spacing.xs,
  },
  liveHeaderCounterValuePrimary: {
    ...Typography.Display,
    color: Colors.Primary,
  },
  liveHeaderCounterValueSecondary: {
    ...Typography.Heading,
    color: Colors.Neutral400,
    fontWeight: '400',
  },
  checkoutSwitchCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  checkoutSwitchLeft: {
    flex: 1,
  },
  checkoutSwitchTitle: {
    ...Typography.Body,
    color: Colors.Neutral900,
    fontWeight: '600',
  },
  checkoutSwitchCode: {
    ...Typography.Heading,
    color: Colors.Primary,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  liveListContainer: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    overflow: 'hidden',
  },
  studentListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 0.5,
    borderColor: Colors.Neutral200,
    backgroundColor: Colors.White,
  },
  studentListRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  studentInitialsCircle: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Neutral100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentInitialsText: {
    ...Typography.Label,
    color: Colors.Neutral600,
    fontWeight: '600',
  },
  studentListName: {
    ...Typography.Body,
    fontWeight: '600',
    color: Colors.Neutral900,
  },
  studentListId: {
    ...Typography.Caption,
    color: Colors.Neutral400,
  },
  studentListRowRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  studentListTime: {
    ...Typography.Caption,
    color: Colors.Neutral400,
  },
  studentListBadgesRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  studentStatusPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  pillLate: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#D97706',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillLateText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '600',
  },
  pillEarly: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#E65100',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillEarlyText: {
    color: '#E65100',
    fontSize: 11,
    fontWeight: '600',
  },
  pillWarningText: {
    color: Colors.Warning,
  },
  studentCheckoutPill: {
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  studentCheckoutPillText: {
    ...Typography.Caption,
    color: Colors.Neutral600,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.Card,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
  },
  cardHeaderTitleText: {
    ...Typography.Heading,
    color: Colors.Neutral900,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  reportList: {
    gap: Spacing.sm,
  },
  reportRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderColor: Colors.Neutral200,
  },
  reportRowStudentName: {
    ...Typography.Body,
    fontWeight: '600',
    color: Colors.Neutral900,
  },
  reportRowStudentId: {
    ...Typography.Caption,
    color: Colors.Neutral400,
  },
  reportRowPercentage: {
    ...Typography.Heading,
    fontWeight: '700',
  },
  reportRowSessionsRatio: {
    ...Typography.Caption,
    color: Colors.Neutral600,
  },
  roleSelectionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  roleBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.Neutral100,
  },
  roleBtnActive: {
    backgroundColor: Colors.Primary,
    borderColor: Colors.Primary,
  },
  roleBtnText: {
    ...Typography.Label,
    color: Colors.Neutral600,
  },
  roleBtnTextActive: {
    color: Colors.White,
    fontWeight: '600',
  },
  inviteCourseChip: {
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.Neutral100,
    marginBottom: Spacing.xs,
  },
  inviteCourseChipActive: {
    borderColor: Colors.Primary,
    backgroundColor: Colors.PrimaryLight,
  },
  inviteCourseChipText: {
    ...Typography.Body,
    color: Colors.Neutral600,
  },
  inviteCourseChipTextActive: {
    color: Colors.Primary,
    fontWeight: '600',
  },
  settingsLabel: {
    ...Typography.Label,
    color: Colors.Neutral600,
    marginBottom: Spacing.xs,
  },
  settingsInput: {
    height: 48,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    paddingHorizontal: Spacing.lg,
    ...Typography.Body,
    color: Colors.Neutral900,
    marginBottom: Spacing.md,
  },
  staffGenerateBtn: {
    height: 52,
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  staffGenerateBtnText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
  inviteCodeRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderColor: Colors.Neutral200,
  },
  inviteCodeStringText: {
    ...Typography.Heading,
    color: Colors.Primary,
    fontWeight: '700',
  },
  inviteCodeMetaText: {
    ...Typography.Caption,
    color: Colors.Neutral600,
    marginTop: 2,
  },
  inviteCodeRevokeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.DangerLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.Danger,
  },
  inviteCodeRevokeBtnText: {
    ...Typography.Caption,
    color: Colors.Danger,
    fontWeight: '600',
  },
  settingsApplyBtn: {
    height: 52,
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  settingsApplyBtnText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: Colors.White,
    borderTopWidth: 0.5,
    borderColor: Colors.Neutral200,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  tabBarLabel: {
    ...Typography.Caption,
    marginTop: 2,
    fontWeight: '500',
  },
  itemMeta: {
    ...Typography.Caption,
    color: Colors.Neutral400,
  },
  emptyText: {
    ...Typography.Body,
    color: Colors.Neutral400,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    ...Shadows.Card,
    marginBottom: Spacing.sm,
  },
  itemCode: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
  },
  itemName: {
    ...Typography.Body,
    fontWeight: '600',
    color: Colors.Neutral900,
  },
  statusBadge: {
    ...Typography.Caption,
    fontWeight: '600',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  presentBadge: {
    backgroundColor: Colors.SuccessLight,
    color: Colors.Success,
  },
  lateBadge: {
    backgroundColor: Colors.WarningLight,
    color: Colors.Warning,
  },
  lecturerNoSessionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
  },
  lecturerNoSessionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4B5563',
    marginTop: 12,
  },
  lecturerNoSessionSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 32,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  exportBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Neutral100,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.Card,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.White,
    borderTopLeftRadius: BorderRadius.xl * 1.5,
    borderTopRightRadius: BorderRadius.xl * 1.5,
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + 12,
    minHeight: 450,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Neutral800,
  },
  modalCloseButton: {
    padding: 4,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    marginBottom: Spacing.xl,
  },
  profileAvatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.Brand100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  profileAvatarTextBig: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.Brand700,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Neutral800,
  },
  profileRole: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.Brand600,
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 6,
  },
  profileEmail: {
    fontSize: 13,
    color: Colors.Neutral500,
  },
  syncSection: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    marginBottom: Spacing.xl,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.Neutral800,
  },
  syncSubtitle: {
    fontSize: 12,
    color: Colors.Neutral500,
    marginTop: 1,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clearQueueBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  clearQueueBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  changePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  changePasswordBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.Brand700,
  },
  passwordForm: {
    gap: Spacing.sm,
  },
  formGroup: {
    marginBottom: Spacing.xs,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.Neutral700,
    marginBottom: 4,
  },
  formInput: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
    color: Colors.Neutral800,
    backgroundColor: '#F8FAFC',
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  formCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.Neutral300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.White,
  },
  formCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.Neutral600,
  },
  formSubmitBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSubmitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.White,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
});
