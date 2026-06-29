import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../theme';

interface StaffRegisterPayload {
  name: string;
  email: string;
  password: string;
  invite_code: string;
}

export default function AuthScreen() {
  const { login, registerStudent, loading: authLoading } = useAuth();
  const scrollViewRef = useRef<any>(null);
  const passwordInputRef = useRef<any>(null);
  const regPasswordInputRef = useRef<any>(null);
  const staffPasswordInputRef = useRef<any>(null);
  
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  const [authState, setAuthState] = useState<'login' | 'register' | 'staffRegister'>('login');

  // Input states
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Student Register Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [level, setLevel] = useState('100');
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);

  // Staff Register Fields
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  // Inline error states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submittingStaff, setSubmittingStaff] = useState(false);

  // Focus states for custom border glow
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (authState === 'register') {
      apiFetch('/api/auth/courses')
        .then(setCourses)
        .catch(() => {
          setCourses([
            { id: 1, name: 'Introduction to Computer Science', code: 'CS-101' },
            { id: 2, name: 'Data Structures and Algorithms', code: 'CS-201' },
            { id: 3, name: 'Software Engineering Principles', code: 'CS-301' },
            { id: 4, name: 'Information Technology', code: 'PE-155' },
            { id: 5, name: 'Thermodynamics I', code: 'PE-257' },
            { id: 6, name: 'Computer Programming', code: 'PE-262' },
          ]);
        });
    }
  }, [authState]);

  const navigateTo = (state: 'login' | 'register' | 'staffRegister') => {
    setName('');
    setEmail('');
    setStudentId('');
    setPassword('');
    setLoginId('');
    setSelectedCourses([]);
    setStaffName('');
    setStaffEmail('');
    setStaffPassword('');
    setInviteCode('');
    setEmailError('');
    setPasswordError('');
    setSubmitError('');
    setAuthState(state);
  };

  const handleLogin = async () => {
    if (!loginId || !password) {
      Alert.alert('Error', 'Please fill all login fields');
      return;
    }
    try {
      await login(loginId, password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    }
  };

  const handleRegister = async () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
    if (!name || !email || !password || !studentId) {
      Alert.alert('Error', 'Please fill in all registration fields');
      return;
    }
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Only KNUST student emails (@st.knust.edu.gh or @knust.edu.gh) are allowed.');
      return;
    }
    if (selectedCourses.length === 0) {
      Alert.alert('Select Courses', 'Please enroll in at least one course.');
      return;
    }

    try {
      await registerStudent({
        name,
        email,
        password,
        student_id: studentId,
        level,
        selectedCourses,
      });
      Alert.alert('Success', 'Registered successfully!');
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message);
    }
  };

  const handleStaffRegister = async () => {
    setEmailError('');
    setPasswordError('');
    setSubmitError('');

    const emailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
    if (!staffName || !staffEmail || !staffPassword || !inviteCode) {
      setSubmitError('All fields are required.');
      return;
    }
    if (!emailRegex.test(staffEmail)) {
      setEmailError('Invalid email. Must be @st.knust.edu.gh or @knust.edu.gh');
      return;
    }
    if (staffPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }

    setSubmittingStaff(true);
    try {
      await apiFetch('/api/auth/register/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: staffName,
          email: staffEmail,
          password: staffPassword,
          invite_code: inviteCode,
        } as StaffRegisterPayload),
      });
      await login(staffEmail, staffPassword);
    } catch (err: any) {
      setSubmitError(err.message || 'Registration failed.');
    } finally {
      setSubmittingStaff(false);
    }
  };

  const toggleCourse = (id: number) => {
    if (selectedCourses.includes(id)) {
      setSelectedCourses(selectedCourses.filter((cId) => cId !== id));
    } else {
      setSelectedCourses([...selectedCourses, id]);
    }
  };

  const isAnyLoading = authLoading || submittingStaff;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Branding Section */}
          <View style={styles.topSection}>
            <View style={styles.logoMark}>
              <Ionicons name="qr-code" size={28} color={Colors.White} />
            </View>
            <Text style={styles.appName}>SmartRoll</Text>
            <Text style={styles.tagline}>Smart attendance for KNUST</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Custom Tab Switcher (Visible only if not in staffRegister view) */}
            {authState !== 'staffRegister' && (
              <View style={styles.tabSwitcher}>
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    authState === 'login' && styles.tabButtonActive,
                  ]}
                  onPress={() => navigateTo('login')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.tabText,
                      authState === 'login' && styles.tabTextActive,
                    ]}
                  >
                    Login
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    authState === 'register' && styles.tabButtonActive,
                  ]}
                  onPress={() => navigateTo('register')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.tabText,
                      authState === 'register' && styles.tabTextActive,
                    ]}
                  >
                    Register
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Navigation Back Link for Staff registration */}
            {authState === 'staffRegister' && (
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => navigateTo('login')}
                activeOpacity={0.75}
              >
                <Text style={styles.backLinkText}>← Back to login</Text>
              </TouchableOpacity>
            )}

            {/* FORM BODY: LOGIN */}
            {authState === 'login' && (
              <View style={styles.form}>
                <Text style={styles.label}>Student ID / Email / Username</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'loginId' && styles.inputFocused,
                  ]}
                  placeholder="e.g. 20681234 or email"
                  placeholderTextColor={Colors.Neutral400}
                  value={loginId}
                  onChangeText={setLoginId}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('loginId')}
                  onBlur={() => setFocusedField(null)}
                />

                <Text style={styles.label}>Password</Text>
                <View
                  style={[
                    styles.passwordInputWrapper,
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                >
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.passwordInput}
                    placeholder="Enter your password"
                    placeholderTextColor={Colors.Neutral400}
                    secureTextEntry={!showLoginPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => {
                      setFocusedField('password');
                      setTimeout(() => {
                        passwordInputRef.current?.measureInWindow((x, y) => {
                          scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
                        });
                      }, 300);
                    }}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    style={styles.eyeToggleBtn}
                    onPress={() => setShowLoginPassword(!showLoginPassword)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={showLoginPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={Colors.Neutral400}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleLogin}
                  disabled={isAnyLoading}
                  activeOpacity={0.75}
                >
                  {isAnyLoading ? (
                    <ActivityIndicator color={Colors.White} size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* FORM BODY: REGISTER */}
            {authState === 'register' && (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'regName' && styles.inputFocused,
                  ]}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={Colors.Neutral400}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocusedField('regName')}
                  onBlur={() => setFocusedField(null)}
                />

                <Text style={styles.label}>KNUST Student Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'regEmail' && styles.inputFocused,
                  ]}
                  placeholder="username@st.knust.edu.gh"
                  placeholderTextColor={Colors.Neutral400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('regEmail')}
                  onBlur={() => setFocusedField(null)}
                />

                <Text style={styles.label}>Student ID Number</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'regStudentId' && styles.inputFocused,
                  ]}
                  placeholder="e.g. 20658421"
                  placeholderTextColor={Colors.Neutral400}
                  value={studentId}
                  onChangeText={setStudentId}
                  keyboardType="numeric"
                  onFocus={() => setFocusedField('regStudentId')}
                  onBlur={() => setFocusedField(null)}
                />

                <Text style={styles.label}>Password</Text>
                <View
                  style={[
                    styles.passwordInputWrapper,
                    focusedField === 'regPassword' && styles.inputFocused,
                  ]}
                >
                  <TextInput
                    ref={regPasswordInputRef}
                    style={styles.passwordInput}
                    placeholder="Create password"
                    placeholderTextColor={Colors.Neutral400}
                    secureTextEntry={!showRegPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => {
                      setFocusedField('regPassword');
                      setTimeout(() => {
                        regPasswordInputRef.current?.measureInWindow((x, y) => {
                          scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
                        });
                      }, 300);
                    }}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    style={styles.eyeToggleBtn}
                    onPress={() => setShowRegPassword(!showRegPassword)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={showRegPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={Colors.Neutral400}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Academic Level</Text>
                <View style={styles.levelContainer}>
                  {['100', '200', '300', '400'].map((lvl) => (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.levelButton,
                        level === lvl && styles.levelButtonActive,
                      ]}
                      onPress={() => setLevel(lvl)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.levelButtonText,
                          level === lvl && styles.levelButtonTextActive,
                        ]}
                      >
                        {lvl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Select Enrolled Courses</Text>
                <View style={styles.coursesList}>
                  {courses.map((course) => {
                    const isSelected = selectedCourses.includes(course.id);
                    return (
                      <TouchableOpacity
                        key={course.id}
                        style={[
                          styles.courseItem,
                          isSelected && styles.courseItemActive,
                        ]}
                        onPress={() => toggleCourse(course.id)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.courseItemText,
                            isSelected && styles.courseItemTextActive,
                          ]}
                        >
                          {course.code} - {course.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleRegister}
                  disabled={isAnyLoading}
                  activeOpacity={0.75}
                >
                  {isAnyLoading ? (
                    <ActivityIndicator color={Colors.White} size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Register & Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.staffLinkContainer}
                  onPress={() => navigateTo('staffRegister')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.staffLinkText}>
                    Staff or TA? Register with an invite code
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* FORM BODY: STAFF REGISTER */}
            {authState === 'staffRegister' && (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'staffName' && styles.inputFocused,
                  ]}
                  placeholder="Full Name"
                  placeholderTextColor={Colors.Neutral400}
                  value={staffName}
                  onChangeText={setStaffName}
                  onFocus={() => setFocusedField('staffName')}
                  onBlur={() => setFocusedField(null)}
                />

                <Text style={styles.label}>KNUST Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'staffEmail' && styles.inputFocused,
                  ]}
                  placeholder="your@knust.edu.gh"
                  placeholderTextColor={Colors.Neutral400}
                  value={staffEmail}
                  onChangeText={setStaffEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('staffEmail')}
                  onBlur={() => setFocusedField(null)}
                />
                {emailError ? (
                  <View style={styles.inlineErrorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.Danger} />
                    <Text style={styles.inlineError}>{emailError}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Password</Text>
                <View
                  style={[
                    styles.passwordInputWrapper,
                    focusedField === 'staffPassword' && styles.inputFocused,
                  ]}
                >
                  <TextInput
                    ref={staffPasswordInputRef}
                    style={styles.passwordInput}
                    placeholder="Password"
                    placeholderTextColor={Colors.Neutral400}
                    secureTextEntry={!showStaffPassword}
                    value={staffPassword}
                    onChangeText={setStaffPassword}
                    onFocus={() => {
                      setFocusedField('staffPassword');
                      setTimeout(() => {
                        staffPasswordInputRef.current?.measureInWindow((x, y) => {
                          scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
                        });
                      }, 300);
                    }}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    style={styles.eyeToggleBtn}
                    onPress={() => setShowStaffPassword(!showStaffPassword)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={showStaffPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={Colors.Neutral400}
                    />
                  </TouchableOpacity>
                </View>
                {passwordError ? (
                  <View style={styles.inlineErrorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.Danger} />
                    <Text style={styles.inlineError}>{passwordError}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Invite Code</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'inviteCode' && styles.inputFocused,
                  ]}
                  placeholder="Invite Code (e.g. AB3X9K2M)"
                  placeholderTextColor={Colors.Neutral400}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('inviteCode')}
                  onBlur={() => setFocusedField(null)}
                />

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleStaffRegister}
                  disabled={isAnyLoading}
                  activeOpacity={0.75}
                >
                  {isAnyLoading ? (
                    <ActivityIndicator color={Colors.White} size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Register with Invite Code</Text>
                  )}
                </TouchableOpacity>

                {submitError ? (
                  <View style={styles.inlineErrorRowCenter}>
                    <Ionicons name="alert-circle-outline" size={15} color={Colors.Danger} />
                    <Text style={styles.inlineError}>{submitError}</Text>
                  </View>
                ) : null}
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
  scrollView: {
    flex: 1,
    backgroundColor: Colors.White,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  appName: {
    ...Typography.Display,
    color: Colors.Neutral900,
  },
  tagline: {
    ...Typography.Label,
    color: Colors.Neutral400,
    marginTop: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.White,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    ...Shadows.Card,
  },
  tabSwitcher: {
    flexDirection: 'row',
    height: 44,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.sm - 2,
  },
  tabButtonActive: {
    backgroundColor: Colors.White,
    ...Shadows.Card,
  },
  tabText: {
    ...Typography.Label,
    color: Colors.Neutral400,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.Primary,
  },
  backLink: {
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  backLinkText: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
  },
  form: {
    gap: Spacing.md,
  },
  label: {
    ...Typography.Label,
    color: Colors.Neutral600,
    marginBottom: -Spacing.xs,
  },
  input: {
    height: 48,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    ...Typography.Body,
    color: Colors.Neutral900,
    paddingHorizontal: Spacing.lg,
  },
  inputFocused: {
    borderColor: Colors.Primary,
    backgroundColor: Colors.White,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: Colors.Neutral100,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    paddingRight: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    ...Typography.Body,
    color: Colors.Neutral900,
    paddingHorizontal: Spacing.lg,
  },
  eyeToggleBtn: {
    padding: Spacing.xs,
  },
  button: {
    height: 52,
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonText: {
    ...Typography.Heading,
    color: Colors.White,
    fontWeight: '600',
  },
  staffLinkContainer: {
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  staffLinkText: {
    ...Typography.Label,
    color: Colors.Primary,
    fontWeight: '600',
  },
  levelContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  levelButton: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.Neutral100,
  },
  levelButtonActive: {
    backgroundColor: Colors.Primary,
    borderColor: Colors.Primary,
  },
  levelButtonText: {
    ...Typography.Label,
    color: Colors.Neutral600,
  },
  levelButtonTextActive: {
    color: Colors.White,
    fontWeight: '600',
  },
  coursesList: {
    gap: Spacing.sm,
  },
  courseItem: {
    borderWidth: 1,
    borderColor: Colors.Neutral200,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.Neutral100,
  },
  courseItemActive: {
    borderColor: Colors.Primary,
    backgroundColor: Colors.PrimaryLight,
  },
  courseItemText: {
    ...Typography.Body,
    color: Colors.Neutral600,
  },
  courseItemTextActive: {
    color: Colors.Primary,
    fontWeight: '600',
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: -Spacing.xs,
  },
  inlineErrorRowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  inlineError: {
    ...Typography.Caption,
    color: Colors.Danger,
    fontWeight: '500',
  },
});
