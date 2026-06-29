import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  LogOut,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  FileSpreadsheet,
  Settings,
  Key,
  Sparkles,
  Search,
  ChevronRight,
  TrendingUp,
  Sliders,
  Check,
  UserPlus,
  RefreshCw,
  Camera,
  Keyboard,
  Clock,
  Download,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  Upload,
  Printer,
  Sun,
  Moon,
  Menu,
  X,
  Smartphone
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

const APK_VERSION = '1.0.0';
const APK_DOWNLOAD_URL = 'https://expo.dev/artifacts/eas/turjwaGW1cqgG-8X_QoV9FltjjWUGbCddO3ewrg5eVg.apk';
const APK_SIZE_MB = '11.5';

// Mock/Default configurations (Stored in LocalStorage to preserve settings)
const DEFAULT_SETTINGS = {
  minThreshold: 75,
  qrRotationMins: 1,
  gpsRadius: 200,
  gpsEnabled: false,
  earlyLeaverThreshold: 15,
  checkoutWindowMins: 10,
  frequentEarlyLeaverThreshold: 20
};

export default function App() {
  // Authentication & Session States
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');

  // App settings state
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // Academic Period State
  const [academicPeriods, setAcademicPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  // Global Toast Notification
  const [toast, setToast] = useState(null);

  // Change Password Modal States
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);


  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getCoordinates = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        () => resolve(null),
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  };

  useEffect(() => {
    if (user && user.role === 'lecturer') {
      apiFetch('/api/auth/academic-periods')
        .then(periods => {
          setAcademicPeriods(periods);
          const current = periods.find(p => p.is_current) || periods[0];
          if (current) setSelectedPeriodId(current.id);
        })
        .catch(err => console.warn(err.message));
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, [token, user]);

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showToast('Logged out successfully', 'info');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return showToast('New passwords do not match.', 'error');
    }
    if (newPassword.length < 6) {
      return showToast('Password must be at least 6 characters long.', 'error');
    }
    setUpdatingPassword(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      showToast('Password updated successfully!');
      setChangePasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const API_BASE = import.meta.env.VITE_API_URL || '';

  // Helper fetch wrapper to include token headers
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };
    // Combine base and endpoint, then sanitize double slashes (except after http:// or https://)
    let url = `${API_BASE}${endpoint}`;
    url = url.replace(/([^:]\/)\/+/g, "$1");
    
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server request failed');
    }
    return response.json();
  };

  const queueOfflineRequest = (endpoint, body) => {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
      queue.push({ endpoint, body, timestamp: new Date().toISOString() });
      localStorage.setItem('offline_attendance_queue', JSON.stringify(queue));
      showToast("Check-in queued locally (offline mode).", "info");
    } catch (e) {
      console.error("Failed to queue request offline:", e);
    }
  };

  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
    if (queue.length === 0) return;

    localStorage.removeItem('offline_attendance_queue');
    showToast("Internet connection restored. Syncing offline check-ins...", "info");

    for (const item of queue) {
      try {
        const response = await apiFetch(item.endpoint, {
          method: 'POST',
          body: JSON.stringify(item.body)
        });
        showToast(response.message || "Synced successfully!");
      } catch (err) {
        showToast(`Sync failed: ${err.message}`, 'error');
        if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
          const currentQueue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
          currentQueue.push(item);
          localStorage.setItem('offline_attendance_queue', JSON.stringify(currentQueue));
        }
      }
    }
  };

  useEffect(() => {
    window.addEventListener('online', syncOfflineQueue);
    return () => {
      window.removeEventListener('online', syncOfflineQueue);
    };
  }, [token]);

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans`}>
      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed top-5 right-5 animate-bounce" style={{ zIndex: 9999 }}>
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-white ${
            toast.type === 'error' ? 'bg-red-500 border-red-600' :
            toast.type === 'info' ? 'bg-blue-500 border-blue-600' :
            'bg-emerald-500 border-emerald-600'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}



      {/* Top Banner Navigation */}
      {user && user.role === 'student' && (
        <nav className="sticky top-0 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 text-white p-2.5 rounded-xl shadow-lg shadow-brand-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none tracking-tight">SmartRoll</h1>
              <span className="text-xs text-slate-500 dark:text-slate-400">Smart Attendance System</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={APK_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Download Android App"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Download App</span>
            </a>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Change Password"
            >
              <Key className="w-4 h-4" />
            </button>

            <div className="text-right hidden sm:block">
              <p className="font-medium text-sm">{user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user.role} {user.student_id ? `(${user.student_id})` : ''}</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 transition text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </nav>
      )}

      {!user ? (
        <AuthScreen onAuthSuccess={(t, u) => { setToken(t); setUser(u); showToast(`Welcome back, ${u.name}!`); }} showToast={showToast} apiFetch={apiFetch} setShowInstallInstructions={setShowInstallInstructions} />
      ) : (user.role === 'lecturer' || user.role === 'ta') ? (
        <LecturerConsole
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          settings={settings}
          setSettings={setSettings}
          showToast={showToast}
          apiFetch={apiFetch}
          academicPeriods={academicPeriods}
          selectedPeriodId={selectedPeriodId}
          setAcademicPeriods={setAcademicPeriods}
          setSelectedPeriodId={setSelectedPeriodId}
          logout={logout}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          setChangePasswordOpen={setChangePasswordOpen}
        />
      ) : (
        <StudentConsole
          user={user}
          settings={settings}
          showToast={showToast}
          apiFetch={apiFetch}
          queueOfflineRequest={queueOfflineRequest}
        />
      )}

      {/* Change Password Modal Overlay */}
      {changePasswordOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleChangePassword} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-2">Change Password</h3>
            <p className="text-slate-500 text-xs mb-4">Update your account password below.</p>
            
            <div className="space-y-3 mb-6 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setChangePasswordOpen(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatingPassword}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                {updatingPassword ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Updating...</span>
                  </>
                ) : (
                  'Update'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Installation Instructions Modal Overlay */}
      {showInstallInstructions && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
            <h3 className="font-bold text-lg mb-2">How to install SmartRoll on Android</h3>
            <p className="text-slate-500 text-xs mb-4">Follow these simple steps to manually install the app.</p>
            
            <div className="space-y-4 mb-6 text-left">
              <div>
                <p className="text-sm font-semibold">Step 1: Download the APK</p>
                <p className="text-slate-500 text-xs">Tap the Download button. Your browser will download the SmartRoll APK file.</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Step 2: Open the file</p>
                <p className="text-slate-500 text-xs">Open your phone's Downloads folder (or tap the notification) and tap the smartroll-preview.apk file.</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Step 3: Allow installation</p>
                <p className="text-slate-500 text-xs">If prompted with "Install unknown apps", tap Settings → enable "Allow from this source" → go back and tap Install.</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Step 4: Open SmartRoll</p>
                <p className="text-slate-500 text-xs">Once installed, open SmartRoll from your app drawer. Log in with your student ID and password, or register if you're a new student.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-6 text-left border border-slate-100 dark:border-slate-800/60">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                <strong>Note:</strong> SmartRoll is not available on the Google Play Store. You must install it directly using this APK file. This is safe — the app is built and distributed by KNUST.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallInstructions(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-sm transition hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// AUTHENTICATION SCREEN (LOGIN & REGISTER)
// -------------------------------------------------------------
function AuthScreen({ onAuthSuccess, showToast, apiFetch, setShowInstallInstructions }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isStaffRegister, setIsStaffRegister] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentId, setStudentId] = useState('');
  const [level, setLevel] = useState('100');
  const [loginId, setLoginId] = useState('');
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isRegister) {
      // Fetch available courses so student can select them
      apiFetch('/api/auth/courses')
        .then(setCourses)
        .catch(() => {
          // If auth isn't active yet, use mock fallback list
          setCourses([
            { id: 1, name: 'Introduction to Computer Science', code: 'CS-101' },
            { id: 2, name: 'Data Structures and Algorithms', code: 'CS-201' },
            { id: 3, name: 'Software Engineering Principles', code: 'CS-301' },
            { id: 4, name: 'Information Technology', code: 'PE-155' },
            { id: 5, name: 'Thermodynamics I', code: 'PE-257' },
            { id: 6, name: 'Thermodynamics II', code: 'PE-258' },
            { id: 7, name: 'Computer Programming', code: 'PE-262' },
            { id: 8, name: 'Numerical Methods', code: 'PE-350' },
            { id: 9, name: 'Energy and Climate Change', code: 'PE-476' }
          ]);
        });
    }
  }, [isRegister]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login_id: loginId, password })
      });
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    const emailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
    if (!emailRegex.test(email)) {
      showToast('Only KNUST student emails (@st.knust.edu.gh or @knust.edu.gh) are allowed.', 'error');
      setLoading(false);
      return;
    }

    if (selectedCourses.length === 0) {
      showToast('You must select at least one course to register.', 'error');
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          student_id: studentId,
          level,
          course_ids: selectedCourses
        })
      });
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      setLoading(false);
      return;
    }

    if (!inviteCode) {
      showToast('Invite code is required.', 'error');
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/auth/register/staff', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          invite_code: inviteCode
        })
      });
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleCourseSelect = (id) => {
    if (selectedCourses.includes(id)) {
      setSelectedCourses(selectedCourses.filter(cid => cid !== id));
    } else {
      setSelectedCourses([...selectedCourses, id]);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col lg:flex-row items-center justify-center gap-8 p-4 w-full max-w-6xl mx-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex bg-brand-500 text-white p-3.5 rounded-2xl shadow-lg shadow-brand-500/30 mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isStaffRegister ? 'Staff & TA Registration' : isRegister ? 'Student Registration' : 'Sign in to your portal'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Smart Attendance Management System</p>
        </div>

        {isStaffRegister ? (
          <form onSubmit={handleStaffRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="e.g. Dr. Kwame Nkrumah"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="lecturer@knust.edu.gh"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Invite Code</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none font-mono uppercase tracking-widest text-center"
                placeholder="ABC123XY"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-xl shadow-lg transition"
            >
              {loading ? 'Verifying & Registering...' : 'Complete Staff Register'}
            </button>

            <p className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{' '}
              <button type="button" onClick={() => { setIsRegister(false); setIsStaffRegister(false); }} className="text-brand-600 font-medium hover:underline">Sign in</button>
            </p>
          </form>
        ) : isRegister ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="e.g. John Doe"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Student ID</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="STU001"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Level</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={level}
                  onChange={e => {
                    setLevel(e.target.value);
                    setSelectedCourses([]);
                  }}
                >
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="300">300</option>
                  <option value="400">400</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="student@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Select Enrolled Courses</label>
              <div className="space-y-2 max-h-32 overflow-y-auto border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                {(() => {
                  const filtered = courses.filter(course => {
                    const match = course.code.match(/\d/);
                    const courseLevel = match ? match[0] + '00' : '100';
                    return courseLevel === level;
                  });
                  if (filtered.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 text-center py-4 font-medium">No courses available for Level {level}</p>
                    );
                  }
                  return filtered.map(course => (
                    <div
                      key={course.id}
                      onClick={() => toggleCourseSelect(course.id)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer border transition ${
                        selectedCourses.includes(course.id)
                          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20'
                          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-sm">{course.name}</p>
                        <p className="text-xs text-slate-500">{course.code}</p>
                      </div>
                      {selectedCourses.includes(course.id) && (
                        <Check className="w-4 h-4 text-brand-600" />
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-xl shadow-lg transition"
            >
              {loading ? 'Creating account...' : 'Complete Register'}
            </button>

            <p className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{' '}
              <button type="button" onClick={() => { setIsRegister(false); setIsStaffRegister(false); }} className="text-brand-600 font-medium hover:underline">Sign in</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email, Reference Number or Index Number</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="e.g. 20612345, 2234567, or user@st.knust.edu.gh"
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-xl shadow-lg transition"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p className="text-center text-sm text-slate-500 mt-4">
              Student checking in for the first time?{' '}
              <button type="button" onClick={() => { setIsRegister(true); setIsStaffRegister(false); }} className="text-brand-600 font-medium hover:underline">Register here</button>
            </p>

            <p className="text-center text-sm text-slate-500 mt-2">
              Lecturer or TA with an invite code?{' '}
              <button type="button" onClick={() => { setIsRegister(false); setIsStaffRegister(true); }} className="text-brand-600 font-medium hover:underline">Register with invite code</button>
            </p>

          </form>
        )}
      </div>

      {/* Landing page Download card */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 shadow-xl flex flex-col items-center text-center self-start lg:self-center">
        <div className="inline-flex bg-indigo-500 text-white p-3.5 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
          <Smartphone className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold tracking-tight mb-2 text-slate-800 dark:text-slate-100">Get the SmartRoll App</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          Download the Android app to check in to your classes using QR codes.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          <a
            href={APK_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            Download APK
          </a>
          
          {/* Desktop Only QR Code */}
          <div className="hidden sm:block border border-slate-200 dark:border-slate-800 p-2 rounded-xl bg-white">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=96&data=${encodeURIComponent(APK_DOWNLOAD_URL)}`}
              alt="Scan to Download APK"
              className="w-24 h-24"
            />
          </div>
        </div>

        <div className="text-xs text-slate-400 dark:text-slate-500 mt-6 space-y-2">
          <p>Android only · Version {APK_VERSION} · ~{APK_SIZE_MB} MB</p>
          <button
            type="button"
            onClick={() => setShowInstallInstructions(true)}
            className="text-indigo-600 font-semibold hover:underline"
          >
            How to install →
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
function LecturerConsole({ user, activeTab, setActiveTab, settings, setSettings, showToast, apiFetch, academicPeriods, selectedPeriodId, setAcademicPeriods, setSelectedPeriodId, logout, darkMode, setDarkMode, setChangePasswordOpen }) {
  const [stats, setStats] = useState({ totalStudents: 0, totalSessions: 0, studentsBelowThreshold: 0, overallPercentage: 100, avgDuration: 0, earlyLeaversCount: 0 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [newSemester, setNewSemester] = useState('1');
  const [newIsCurrent, setNewIsCurrent] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [editYear, setEditYear] = useState('');
  const [editSemester, setEditSemester] = useState('1');
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [flaggedStudents, setFlaggedStudents] = useState([]);

  // Per-course context
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [trends, setTrends] = useState([]);

  // Modals / forms
  const [newCourseName, setNewCourseName] = useState('');
  const [inviteCodes, setInviteCodes] = useState([]);
  const [inviteRole, setInviteRole] = useState('ta');
  const [inviteCourseIds, setInviteCourseIds] = useState([]);
  const [inviteExpiresHours, setInviteExpiresHours] = useState('48');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [createCourseYear, setCreateCourseYear] = useState('2024/2025');
  const [createCourseSemester, setCreateCourseSemester] = useState('2');
  const [selectedCourseForSession, setSelectedCourseForSession] = useState('');
  const [sessionDuration, setSessionDuration] = useState(10);
  const [lateGracePeriod, setLateGracePeriod] = useState(10);
  const [sessionRadius, setSessionRadius] = useState(settings.gpsRadius || 200);
  const [capturingGps, setCapturingGps] = useState(false);
  const [csvEnrollList, setCsvEnrollList] = useState([]);
  const [enrollCourseId, setEnrollCourseId] = useState('');
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideStudentId, setOverrideStudentId] = useState('');
  const [overridePresent, setOverridePresent] = useState(true);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsOpen, setAuditLogsOpen] = useState(false);

  // Course Edit and Limits states
  const [newCourseTotalSessions, setNewCourseTotalSessions] = useState('');
  const [editingCourse, setEditingCourse] = useState(null);
  const [editCourseCode, setEditCourseCode] = useState('');
  const [editCourseName, setEditCourseName] = useState('');
  const [editCourseTotalSessions, setEditCourseTotalSessions] = useState('');


  // Active Live Session details
  const [activeSession, setActiveSession] = useState(null);
  const [liveAttendanceList, setLiveAttendanceList] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [checkoutQrCodeUrl, setCheckoutQrCodeUrl] = useState('');
  const [liveSessionSubMode, setLiveSessionSubMode] = useState('checkin');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [qrRotationTime, setQrRotationTime] = useState(settings.qrRotationMins);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const qrPollInterval = useRef(null);
  const sessionPollInterval = useRef(null);

  // Lecturer QR Card Scanner states
  const [lecturerScannerOpen, setLecturerScannerOpen] = useState(false);
  const lecturerScannerRef = useRef(null);
  const lecturerScannerInstance = useRef(null);

  // Metrics card student lists states
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [earlyLeaverStudents, setEarlyLeaverStudents] = useState([]);
  const [activeMetricModal, setActiveMetricModal] = useState(null); // 'enrolled' | 'flagged' | 'early_leavers' | null
  const [metricModalSearch, setMetricModalSearch] = useState('');



  useEffect(() => {
    if (selectedPeriodId) {
      loadCourses();
      loadSessions();
      if (selectedCourseId) {
        loadStats(selectedCourseId);
        loadTrends(selectedCourseId);
        loadFlaggedStudents(selectedCourseId);
      }
    }
  }, [selectedPeriodId, selectedCourseId]);

  useEffect(() => {
    setSelectedCourseId(null);
  }, [selectedPeriodId]);

  useEffect(() => {
    return () => {
      if (qrPollInterval.current) clearInterval(qrPollInterval.current);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'invites') {
      loadInviteCodes();
    }
  }, [activeTab]);

  const loadInviteCodes = async () => {
    try {
      const data = await apiFetch('/api/lecturer/invite-codes');
      setInviteCodes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    try {
      const body = {
        intended_role: inviteRole,
        expires_in_hours: parseInt(inviteExpiresHours)
      };
      if (inviteRole === 'ta') {
        if (inviteCourseIds.length === 0) {
          showToast('Please select at least one course for the TA invite.', 'error');
          return;
        }
        body.course_ids = inviteCourseIds;
      }
      const newCode = await apiFetch('/api/lecturer/invite-codes/generate', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      showToast('Invite code generated successfully!');
      setInviteCourseIds([]);
      loadInviteCodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteInvite = async (id) => {
    if (!confirm('Are you sure you want to revoke this invite code?')) return;
    try {
      await apiFetch(`/api/lecturer/invite-codes/${id}`, { method: 'DELETE' });
      showToast('Invite code revoked.');
      loadInviteCodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRevokeTA = async (id) => {
    if (!confirm('Are you sure you want to end all course access for this TA? They will no longer be able to manage attendance sessions.')) return;
    try {
      await apiFetch(`/api/lecturer/invite-codes/${id}/revoke`, { method: 'POST' });
      showToast('TA access revoked successfully.');
      loadInviteCodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddAcademicPeriod = async (e) => {
    e.preventDefault();
    if (!newYear) return showToast('Please enter an academic year.', 'error');
    try {
      const res = await apiFetch('/api/lecturer/academic-periods', {
        method: 'POST',
        body: JSON.stringify({
          academic_year: newYear,
          semester: parseInt(newSemester),
          is_current: newIsCurrent
        })
      });
      if (res.success) {
        showToast('Academic period added successfully.');
        const periods = await apiFetch('/api/auth/academic-periods');
        setAcademicPeriods(periods);
        if (newIsCurrent) {
          setSelectedPeriodId(res.academicPeriod.id);
        }
        setNewYear('');
        setNewSemester('1');
        setNewIsCurrent(false);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSetCurrentPeriod = async (id) => {
    try {
      const res = await apiFetch(`/api/lecturer/academic-periods/${id}/set-current`, {
        method: 'PUT'
      });
      if (res.success) {
        showToast('Active academic period updated.');
        const periods = await apiFetch('/api/auth/academic-periods');
        setAcademicPeriods(periods);
        setSelectedPeriodId(id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEditAcademicPeriod = async (e) => {
    e.preventDefault();
    if (!editYear) return showToast('Please enter an academic year.', 'error');
    try {
      const res = await apiFetch(`/api/lecturer/academic-periods/${editingPeriodId}`, {
        method: 'PUT',
        body: JSON.stringify({
          academic_year: editYear,
          semester: parseInt(editSemester)
        })
      });
      if (res.success) {
        showToast('Academic period updated successfully.');
        const periods = await apiFetch('/api/auth/academic-periods');
        setAcademicPeriods(periods);
        setEditingPeriodId(null);
        setEditYear('');
        setEditSemester('1');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteAcademicPeriod = async (id) => {
    if (!window.confirm('Are you sure you want to delete this academic period?')) return;
    try {
      const res = await apiFetch(`/api/lecturer/academic-periods/${id}`, {
        method: 'DELETE'
      });
      if (res.success) {
        showToast(res.message || 'Academic period deleted.');
        const periods = await apiFetch('/api/auth/academic-periods');
        setAcademicPeriods(periods);
        if (selectedPeriodId === id) {
          const current = periods.find(p => p.is_current) || periods[0];
          if (current) setSelectedPeriodId(current.id);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadStats = async (courseId) => {
    try {
      const data = await apiFetch(`/api/lecturer/dashboard-stats?course_id=${courseId}&min_threshold=${settings.minThreshold}`);
      setStats(data);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadFlaggedStudents = async (courseId) => {
    try {
      const data = await apiFetch(`/api/lecturer/courses/${courseId}/report`);
      const studentMap = {};
      data.forEach(row => {
        const id = row.academic_student_id;
        if (!studentMap[id]) {
          studentMap[id] = {
            name: row.name,
            academic_student_id: row.academic_student_id,
            level: row.level,
            attended: parseInt(row.attended_sessions) || 0,
            total: parseInt(row.total_sessions) || 0,
            early_leavers: parseInt(row.early_leaver_sessions) || 0
          };
        }
      });
      const students = Object.values(studentMap);
      setEnrolledStudents(students);

      const flaggedList = students.filter(s => {
        const attRate = s.total > 0 ? (s.attended / s.total) * 100 : 100;
        const earlyRate = s.attended > 0 ? (s.early_leavers / s.attended) * 100 : 0;
        return attRate < settings.minThreshold || earlyRate > settings.frequentEarlyLeaverThreshold;
      });
      setFlaggedStudents(flaggedList);

      const earlyLeaverList = students.filter(s => s.early_leavers > 0);
      setEarlyLeaverStudents(earlyLeaverList);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadTrends = async (courseId) => {
    try {
      const data = await apiFetch(`/api/lecturer/attendance-trends?course_id=${courseId}`);
      setTrends(data);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadCourses = async () => {
    try {
      const data = await apiFetch(`/api/lecturer/courses?academic_period_id=${selectedPeriodId}`);
      setCourses(data);
      if (data.length > 0) setSelectedCourseForSession(data[0].id);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadSessions = async () => {
    try {
      let url = `/api/lecturer/sessions?academic_period_id=${selectedPeriodId}`;
      if (selectedCourseId) {
        url += `&course_id=${selectedCourseId}`;
      }
      const data = await apiFetch(url);
      setSessions(data);
      const active = data.find(s => s.is_active);
      if (active) {
        setActiveSession(active);
        setActiveTab('live-session');
        pollQrStatus(active.id);
      }
    } catch (e) {
      console.warn(e.message);
    }
  };

  useEffect(() => {
    let timer;
    if (activeSession && secondsRemaining > 0) {
      timer = setInterval(() => {
        setSecondsRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeSession?.id, secondsRemaining === 0]);

  useEffect(() => {
    if (sessionPollInterval.current) {
      clearInterval(sessionPollInterval.current);
      sessionPollInterval.current = null;
    }

    if (activeSession && activeSession.is_active && activeSession.id) {
      sessionPollInterval.current = setInterval(async () => {
        try {
          const s = await apiFetch(`/api/sessions/${activeSession.id}/qr-status`);
          if (!s || !s.is_active) {
            setActiveSession(null);
            showToast('Session ended automatically', 'info');
            if (sessionPollInterval.current) {
              clearInterval(sessionPollInterval.current);
              sessionPollInterval.current = null;
            }
          }
        } catch (e) {
          console.warn('Session status poll error:', e.message);
        }
      }, 30000);
    }

    return () => {
      if (sessionPollInterval.current) {
        clearInterval(sessionPollInterval.current);
        sessionPollInterval.current = null;
      }
    };
  }, [activeSession?.id, activeSession?.is_active]);

  const createCourse = async (e) => {
    e.preventDefault();
    try {
      const matchedPeriod = academicPeriods.find(
        p => p.academic_year === createCourseYear && p.semester === parseInt(createCourseSemester)
      );
      const periodId = matchedPeriod ? matchedPeriod.id : selectedPeriodId;
      if (!periodId) return showToast('Please select a valid academic period', 'error');

      await apiFetch('/api/lecturer/courses', {
        method: 'POST',
        body: JSON.stringify({ 
          name: newCourseName, 
          code: newCourseCode, 
          academic_period_id: periodId,
          total_sessions: newCourseTotalSessions !== '' ? parseInt(newCourseTotalSessions) : null
        })
      });
      showToast('Course created successfully');
      setNewCourseName('');
      setNewCourseCode('');
      setNewCourseTotalSessions('');
      loadCourses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEditCourse = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/lecturer/courses/${editingCourse.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editCourseName,
          code: editCourseCode,
          total_sessions: editCourseTotalSessions !== '' ? parseInt(editCourseTotalSessions) : null
        })
      });
      showToast('Course updated successfully');
      setEditingCourse(null);
      setEditCourseName('');
      setEditCourseCode('');
      setEditCourseTotalSessions('');
      loadCourses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const startEditCourse = (course) => {
    setEditingCourse(course);
    setEditCourseCode(course.code);
    setEditCourseName(course.name);
    setEditCourseTotalSessions(course.total_sessions || '');
  };

  const deleteCourse = async (courseId) => {
    if (!window.confirm('Are you sure you want to delete this course? This will also delete all associated attendance logs and enrollments.')) return;
    try {
      await apiFetch(`/api/lecturer/courses/${courseId}`, {
        method: 'DELETE'
      });
      showToast('Course deleted successfully');
      loadCourses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLecturerScan = async (decodedStudentId) => {
    if (!decodedStudentId) return;
    try {
      await apiFetch(`/api/lecturer/sessions/${activeSession.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: decodedStudentId,
          is_present: true,
          attendance_status: 'present',
          reason: 'Scanned Student QR Card'
        })
      });
      showToast(`Student ${decodedStudentId} checked in successfully!`);
      const updatedList = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
      setLiveAttendanceList(updatedList.records || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const startLecturerCameraScan = () => {
    setLecturerScannerOpen(true);
    setTimeout(() => {
      if (!lecturerScannerRef.current) return;
      lecturerScannerInstance.current = new Html5QrcodeScanner(
        "lecturer-qr-reader-container",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      lecturerScannerInstance.current.render(async (decodedText) => {
        try {
          if (lecturerScannerInstance.current) {
            lecturerScannerInstance.current.clear();
          }
        } catch (e) {
          console.warn('Scanner clear error', e);
        }
        setLecturerScannerOpen(false);
        await handleLecturerScan(decodedText.trim());
      }, (error) => {
        // Silence noise
      });
    }, 250);
  };

  const handleCsvImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) {
        showToast('CSV file is empty or missing headers.', 'error');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      const parsed = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length === headers.length) {
          const item = {};
          headers.forEach((h, idx) => {
            item[h] = cols[idx];
          });
          parsed.push(item);
        }
      }

      const validated = parsed.map(item => {
        return {
          name: item.Name || item.name || '',
          student_id: item['Student ID'] || item['Reference Number'] || item['Ref Number'] || item.student_id || item.reference_number || item.ref_number || '',
          index_number: item['Index Number'] || item.index_number || '',
          level: item.Level || item.level || '',
          email: item.Email || item.email || ''
        };
      }).filter(s => s.name && s.student_id && s.level && s.email);

      if (validated.length === 0) {
        showToast('No valid student records found. Check headers: Name, Student ID (or Reference Number), Level, Email', 'error');
        return;
      }

      setCsvEnrollList(validated);
    };
    reader.readAsText(file);
  };

  const submitCsvEnrollment = async () => {
    try {
      const res = await apiFetch(`/api/lecturer/courses/${enrollCourseId}/bulk-enroll`, {
        method: 'POST',
        body: JSON.stringify({ students: csvEnrollList })
      });
      showToast(`Successfully enrolled ${res.enrolled.length} students!`);
      setCsvPreviewOpen(false);
      setCsvEnrollList([]);
      loadCourses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenOverrideModal = (studentId, isPresent, currentStatus) => {
    setOverrideStudentId(studentId);
    setOverridePresent(isPresent);
    setOverrideStatus(currentStatus || 'present');
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  const submitOverride = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/lecturer/sessions/${activeSession.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: overrideStudentId,
          is_present: overridePresent,
          attendance_status: overrideStatus,
          reason: overrideReason
        })
      });
      showToast('Attendance corrected with audit log successfully!');
      setOverrideModalOpen(false);
      const list = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
      setLiveAttendanceList(list.records || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const logs = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/audit-logs`);
      setAuditLogs(logs);
      setAuditLogsOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const startSession = async () => {
    const courseId = selectedCourseId;
    if (!courseId) return showToast('Please select a course', 'error');
    
    let locationName = 'Lecturer Live Location';
    let lat = null;
    let lng = null;

    setCapturingGps(true);
    showToast('Capturing live GPS location...', 'info');
    try {
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(new Error('GPS capture failed. Please check device permissions.')),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      lat = coords.lat;
      lng = coords.lng;
    } catch (err) {
      showToast(err.message, 'error');
      setCapturingGps(false);
      return;
    }
    setCapturingGps(false);

    try {
      const session = await apiFetch('/api/lecturer/sessions', {
        method: 'POST',
        body: JSON.stringify({
          course_id: courseId,
          duration_mins: sessionDuration || 10,
          qr_rotation_mins: qrRotationTime || 1,
          location_name: locationName,
          gps_lat: lat,
          gps_lng: lng,
          allowed_radius_meters: sessionRadius || 200,
          late_grace_period_minutes: lateGracePeriod || 10
        })
      });
      setActiveSession(session);
      setActiveTab('live-session');
      showToast('Session started successfully!');
      pollQrStatus(session.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Keep fetching session status (anti-sharing token auto-rotation indicator)
  const pollQrStatus = (sessionId) => {
    if (qrPollInterval.current) clearInterval(qrPollInterval.current);

    const fetchStatus = async () => {
      try {
        const status = await apiFetch(`/api/sessions/${sessionId}/qr-status`);
        setSecondsRemaining(status.seconds_remaining);
        setActiveSession(status);

        if (status.status === 'EXPIRED') {
          showToast('Session checking window closed.', 'info');
          clearInterval(qrPollInterval.current);
          setActiveSession(null);
          setActiveTab('sessions');
          loadSessions();
          return;
        }

        // Generate QR code on frontend using standard URL signature
        const appUrl = `${window.location.origin}/check-in?qr=${status.qr_token}`;
        const qrUrl = await QRCode.toDataURL(appUrl, { width: 400, margin: 2 });
        setQrCodeUrl(qrUrl);

        if (status.checkout_qr_token) {
          const checkoutAppUrl = `${window.location.origin}/check-out?qr=${status.checkout_qr_token}`;
          const outQrUrl = await QRCode.toDataURL(checkoutAppUrl, { width: 400, margin: 2 });
          setCheckoutQrCodeUrl(outQrUrl);
        }

        // Fetch attendance live lists
        const list = await apiFetch(`/api/lecturer/sessions/${sessionId}/live-attendance`);
        setLiveAttendanceList(list.records || []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchStatus();
    qrPollInterval.current = setInterval(fetchStatus, 3000);
  };

  // Toggle present/absent state manually for a student in live list
  const toggleAttendanceStatus = async (studentId, currentPresent) => {
    try {
      await apiFetch(`/api/lecturer/sessions/${activeSession.id}/manual-mark`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, is_present: !currentPresent })
      });
      showToast('Attendance updated successfully');
      // reload live list
      const list = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
      setLiveAttendanceList(list.records || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const activateCheckout = async () => {
    try {
      const res = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/activate-checkout`, {
        method: 'POST',
        body: JSON.stringify({
          checkout_window_minutes: settings.checkoutWindowMins,
          early_leaver_threshold_minutes: settings.earlyLeaverThreshold
        })
      });
      setActiveSession(res);
      showToast('Checkout window activated successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const manualCheckoutStudent = async (studentId) => {
    try {
      await apiFetch(`/api/sessions/${activeSession.id}/checkout/manual`, {
        method: 'POST',
        body: JSON.stringify({ student_ids: [studentId] })
      });
      showToast('Student checked out manually.');
      const list = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
      setLiveAttendanceList(list.records || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // CSV Bulk Mark Upload
  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      // Assume lines of Student ID
      const studentIds = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      try {
        const res = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/bulk-csv-mark`, {
          method: 'POST',
          body: JSON.stringify({ student_ids: studentIds })
        });
        showToast(res.message);
        // reload live list
        const list = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/live-attendance`);
        setLiveAttendanceList(list.records || []);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      {/* SIDEBAR NAVIGATION */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800/80 transition-all duration-300 flex flex-col justify-between z-30 shrink-0`}>
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          {/* Logo & Header */}
          <div className="flex items-center justify-between px-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-brand-600 text-white p-2.5 rounded-xl shadow-lg shadow-brand-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="font-bold text-lg leading-none tracking-tight">SmartRoll</h1>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Console</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Academic Period Selector inside Sidebar */}
          {!sidebarCollapsed && academicPeriods.length > 0 && (
            <div className="px-4 mb-6">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block mb-1">Academic Period</label>
              <select
                className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer font-medium"
                value={selectedPeriodId}
                onChange={e => setSelectedPeriodId(e.target.value)}
              >
                {academicPeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    Sem {p.semester} ({p.academic_year})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nav buttons */}
          <nav className="flex-1 px-3 space-y-1">
            {[
              { id: 'dashboard', label: selectedCourseId ? 'Dashboard' : 'My Courses', icon: Users },
              user.role === 'lecturer' && { id: 'courses', label: 'Manage Courses', icon: BookOpen },
              selectedCourseId && { id: 'sessions', label: 'Sessions', icon: Calendar },
              activeSession && { id: 'live-session', label: 'Live Active Session', icon: RefreshCw },
              user.role === 'lecturer' && selectedCourseId && { id: 'reports', label: 'Export Reports', icon: FileSpreadsheet },
              user.role === 'lecturer' && { id: 'invites', label: 'Invite & Access', icon: UserPlus },
              user.role === 'lecturer' && { id: 'settings', label: 'Settings', icon: Settings }
            ].filter(Boolean).map(tab => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition ${
                    isTabActive
                      ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/10'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <tab.icon className="w-5 h-5 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{tab.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Toggles Footer */}
        <div className="p-4 border-t border-slate-200/85 dark:border-slate-800/85 bg-slate-50/50 dark:bg-slate-900/50">
          {!sidebarCollapsed && (
            <div className="mb-4">
              <p className="font-semibold text-sm truncate">{user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user.role} {user.student_id ? `(${user.student_id})` : ''}</p>
            </div>
          )}
          <div className={`flex ${sidebarCollapsed ? 'flex-col items-center gap-3' : 'justify-between items-center'}`}>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Change Password"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN MAIN VIEW CONTENT CONTAINER */}
      <main className="flex-1 overflow-y-auto px-8 py-8">

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        selectedCourseId === null ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">My Courses</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Select a course to view detailed statistics and start attendance sessions.</p>
              </div>
            </div>

            {courses.length === 0 ? (
              <div className="text-center p-16 premium-card border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center">
                <BookOpen className="w-12 h-12 text-slate-400 mb-4" />
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No courses in this semester</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">Go to the "Manage Courses" tab to create courses for the selected semester.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {(() => {
                  const renderCourseGrid = (courseList) => (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {courseList.map(course => {
                        const levelMatch = course.code.match(/\d/);
                        const calculatedLevel = levelMatch ? levelMatch[0] + '00' : 'Undergrad';
                        
                        return (
                          <div key={course.id} className="premium-card p-6 flex flex-col justify-between hover:shadow-xl hover:border-brand-500/30 transition-all duration-300 group">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <span className="text-xs font-semibold bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 px-3 py-1 rounded-lg">
                                  {course.code}
                                </span>
                                <span className="text-xs font-medium text-slate-400">
                                  {calculatedLevel} Level
                                </span>
                              </div>
                              <h3 className="font-bold text-lg leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                {course.name}
                              </h3>
                            </div>
                            
                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
                              <div>
                                <p className="text-slate-400 text-xs">Enrolled</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300">{course.enrolled_count || 0} Students</p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-400 text-xs">Attendance</p>
                                <p className={`font-bold ${
                                  course.overall_attendance_rate < settings.minThreshold ? 'text-red-500' : 'text-emerald-500'
                                }`}>{course.overall_attendance_rate}%</p>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedCourseId(course.id)}
                              className="w-full mt-5 bg-slate-105 dark:bg-slate-800 hover:bg-brand-600 hover:text-white dark:hover:bg-brand-600 font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1"
                            >
                              View Dashboard <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );

                  const firstSemList = courses.filter(c => {
                    const match = c.code.trim().match(/(\d+)$/);
                    return match ? parseInt(match[1]) % 2 !== 0 : true;
                  });

                  const secondSemList = courses.filter(c => {
                    const match = c.code.trim().match(/(\d+)$/);
                    return match ? parseInt(match[1]) % 2 === 0 : false;
                  });

                  return (
                    <>
                      {firstSemList.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 border-b pb-2">First Semester Courses</h3>
                          {renderCourseGrid(firstSemList)}
                        </div>
                      )}
                      {secondSemList.length > 0 && (
                        <div className="space-y-4 pt-4">
                          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 border-b pb-2">Second Semester Courses</h3>
                          {renderCourseGrid(secondSemList)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Breadcrumb / Back button */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedCourseId(null)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition"
              >
                <ArrowLeft className="w-4 h-4" /> Back to My Courses
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <h2 className="text-xl font-bold tracking-tight">
                {courses.find(c => c.id === selectedCourseId)?.code} - {courses.find(c => c.id === selectedCourseId)?.name}
              </h2>
            </div>

            {/* Course-scoped stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <div 
                onClick={() => { setActiveMetricModal('enrolled'); setMetricModalSearch(''); }}
                className="premium-card p-6 flex items-center justify-between cursor-pointer hover:scale-[1.02] hover:shadow-md transition active:scale-[0.98]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-500">Total Enrolled</p>
                  <h3 className="text-3xl font-bold mt-1">{stats.totalStudents}</h3>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl text-blue-600 dark:text-blue-400">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <div 
                onClick={() => { setActiveMetricModal('flagged'); setMetricModalSearch(''); }}
                className="premium-card p-6 flex items-center justify-between cursor-pointer hover:scale-[1.02] hover:shadow-md transition active:scale-[0.98]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-500">Below Flag</p>
                  <h3 className="text-3xl font-bold mt-1 text-red-550">{stats.studentsBelowThreshold}</h3>
                </div>
                <div className="bg-red-50 dark:bg-red-950/40 p-4 rounded-2xl text-red-650 dark:text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
              <div className="premium-card p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500 font-medium">Total Sessions</p>
                  <h3 className="text-3xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">{stats.totalSessions}</h3>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-2xl text-indigo-650 dark:text-indigo-400">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
              <div className="premium-card p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500 font-medium">Overall Att.</p>
                  <h3 className="text-3xl font-bold mt-1">{stats.overallPercentage}%</h3>
                </div>
                <div className="bg-brand-50 dark:bg-brand-950/40 p-4 rounded-2xl text-brand-600 dark:text-brand-400">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <div className="premium-card p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500 font-medium">Avg Duration</p>
                  <h3 className="text-3xl font-bold mt-1 text-sky-600 dark:text-sky-400">{stats.avgDuration || 0}m</h3>
                </div>
                <div className="bg-sky-50 dark:bg-sky-950/40 p-4 rounded-2xl text-sky-600 dark:text-sky-400">
                  <Clock className="w-6 h-6" />
                </div>
              </div>
              <div 
                onClick={() => { setActiveMetricModal('early_leavers'); setMetricModalSearch(''); }}
                className="premium-card p-6 flex items-center justify-between cursor-pointer hover:scale-[1.02] hover:shadow-md transition active:scale-[0.98]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-550 font-medium">Early Leavers</p>
                  <h3 className="text-3xl font-bold mt-1 text-orange-550">{stats.earlyLeaversCount || 0}</h3>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/40 p-4 rounded-2xl text-orange-650 dark:text-orange-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Grid for Trend Chart & Launch Session */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Trend Chart (SVG) */}
              <div className="lg:col-span-2 premium-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold mb-1">Attendance Trend</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Attendance percentage over the last 10 sessions.</p>
                </div>
                
                {trends.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-450 text-sm">
                    No session trend data available yet.
                  </div>
                ) : (
                  <div className="relative w-full h-64">
                    {/* SVG Bar Chart */}
                    <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map((level, i) => {
                        const y = 170 - (level * 150) / 100;
                        return (
                          <g key={level}>
                            <line x1="40" y1={y} x2="480" y2={y} className="stroke-slate-100 dark:stroke-slate-800/80" strokeWidth="1" strokeDasharray="4 4" />
                            <text x="30" y={y + 4} className="text-[10px] font-medium fill-slate-400 text-right" textAnchor="end">{level}%</text>
                          </g>
                        );
                      })}
                      
                      {/* Bars */}
                      {trends.map((item, idx) => {
                        const barCount = trends.length;
                        const spacing = 400 / barCount;
                        const width = Math.min(24, spacing * 0.6);
                        const x = 50 + idx * spacing + (spacing - width) / 2;
                        const height = (item.attendance_rate * 150) / 100;
                        const y = 170 - height;
                        
                        return (
                          <g key={idx} className="group cursor-pointer">
                            {/* Bar with gradient fill */}
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              rx="4"
                              className="fill-brand-500 dark:fill-brand-600 opacity-85 hover:opacity-100 transition-opacity duration-200"
                            />
                            {/* Tooltip or rate label above bar */}
                            <text
                              x={x + width / 2}
                              y={y - 6}
                              className="text-[9px] font-bold fill-brand-600 dark:fill-brand-400 opacity-0 group-hover:opacity-100 transition-opacity text-center"
                              textAnchor="middle"
                            >
                              {Math.round(item.attendance_rate)}%
                            </text>
                            {/* X-axis label (date) */}
                            <text
                              x={x + width / 2}
                              y="188"
                              className="text-[9px] font-medium fill-slate-400"
                              textAnchor="middle"
                              transform={`rotate(-15, ${x + width / 2}, 188)`}
                            >
                              {new Date(item.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Base line */}
                      <line x1="40" y1="170" x2="480" y2="170" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Course-preselected Launch Session panel */}
              <div className="premium-card p-6 flex flex-col justify-between bg-gradient-to-br from-brand-600 to-indigo-700 text-white border-0 shadow-xl shadow-brand-500/10">
                <div>
                  <h3 className="text-lg font-bold">Launch Session</h3>
                  <p className="text-white/80 text-xs mt-1">Start a temporary checking session for this course using dynamic geofenced QR code validation.</p>
                  
                  <div className="space-y-4 mt-6">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Session Duration</label>
                      <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                        <Clock className="w-4 h-4 mr-2" />
                        <input
                          type="number"
                          placeholder="Duration (mins)"
                          className="bg-transparent text-white placeholder-white/50 focus:outline-none w-full text-sm font-semibold"
                          value={sessionDuration}
                          onChange={e => setSessionDuration(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">QR Code Rotation</label>
                      <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        <input
                          type="number"
                          placeholder="QR Rotation (mins)"
                          className="bg-transparent text-white placeholder-white/50 focus:outline-none w-full text-sm font-semibold"
                          value={qrRotationTime}
                          onChange={e => setQrRotationTime(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Geofence Radius</label>
                      <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                        <MapPin className="w-4 h-4 mr-2" />
                        <input
                          type="number"
                          placeholder="Radius (meters)"
                          className="bg-transparent text-white placeholder-white/50 focus:outline-none w-full text-sm font-semibold"
                          value={sessionRadius}
                          onChange={e => setSessionRadius(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Late Grace Period</label>
                      <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                        <Clock className="w-4 h-4 mr-2" />
                        <input
                          type="number"
                          placeholder="Grace Period (mins)"
                          className="bg-transparent text-white placeholder-white/50 focus:outline-none w-full text-sm font-semibold"
                          value={lateGracePeriod}
                          onChange={e => setLateGracePeriod(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={startSession}
                  disabled={capturingGps}
                  className="w-full mt-6 bg-white text-brand-600 font-bold py-3.5 rounded-xl hover:bg-slate-100 transition shadow-lg disabled:opacity-50 text-sm"
                >
                  {capturingGps ? 'Capturing GPS Location...' : 'Start Session Now'}
                </button>
              </div>
            </div>




          </div>
        )
      )}

      {/* MANAGE COURSES TAB */}
      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="premium-card p-6">
            <h3 className="text-lg font-bold mb-4">Add New Course</h3>
            <form onSubmit={createCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS-301"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={newCourseCode}
                  onChange={e => setNewCourseCode(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Course Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineering Principles"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none animate-all"
                  value={newCourseName}
                  onChange={e => setNewCourseName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Year</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2024/2025"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm font-medium dark:text-white"
                  value={createCourseYear}
                  onChange={e => setCreateCourseYear(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Semester</label>
                <select
                  value={createCourseSemester}
                  onChange={e => setCreateCourseSemester(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm font-medium dark:text-white"
                >
                  <option value="1" className="text-slate-900">Semester 1</option>
                  <option value="2" className="text-slate-900">Semester 2</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Total Semester Sessions (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 15"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={newCourseTotalSessions}
                  onChange={e => setNewCourseTotalSessions(e.target.value)}
                />
              </div>
              <button type="submit" className="w-full bg-brand-600 text-white font-semibold py-3 rounded-xl hover:bg-brand-700 transition">
                Create Course
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-bold">Enrolled Courses</h3>
            {courses.length === 0 ? (
              <div className="text-center p-12 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <BookOpen className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="text-slate-500 dark:text-slate-400">No courses created yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {courses.map(course => (
                  <div key={course.id} className="premium-card p-5 flex justify-between items-start">
                    <div>
                      <span className="text-xs font-semibold bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 px-2.5 py-1 rounded-lg">{course.code}</span>
                      <h4 className="font-bold text-base mt-2.5 leading-tight">{course.name}</h4>
                      <p className="text-xs text-slate-500 mt-1">{course.enrolled_count || 0} students enrolled</p>
                      
                      <button
                        onClick={() => { setEnrollCourseId(course.id); setCsvEnrollList([]); setCsvPreviewOpen(true); }}
                        className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 hover:text-brand-600 px-3 py-1.5 rounded-lg transition font-semibold mt-3 block w-max"
                      >
                        Import Roster (CSV)
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEditCourse(course)}
                        className="text-slate-500 hover:text-brand-650 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-lg transition"
                        title="Edit Course"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteCourse(course.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 p-2 rounded-lg transition"
                        title="Delete Course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SESSIONS TAB */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold">Session History & Logs</h3>
          <div className="overflow-hidden premium-card">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-bold uppercase">
                  <th className="p-4">Date</th>
                  <th className="p-4">Course</th>
                  <th className="p-4">Session Code</th>
                  <th className="p-4">Attendance Stats</th>
                  <th className="p-4">Avg Duration</th>
                  <th className="p-4">Early Leavers</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm">
                    <td className="p-4">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="p-4">
                      <p className="font-semibold">{s.course_code}</p>
                      <p className="text-[10px] text-slate-500">By: {s.creator_name || 'System'}</p>
                    </td>
                    <td className="p-4"><code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{s.session_code}</code></td>
                    <td className="p-4">
                      <div className="text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Checked In: {s.present_count || 0}</span>
                        {s.checked_out_count > 0 && <span className="text-emerald-600 font-medium ml-2">Checked Out: {s.checked_out_count}</span>}
                        {s.not_checked_out_count > 0 && <span className="text-orange-550 font-medium ml-2">Still In: {s.not_checked_out_count}</span>}
                      </div>
                    </td>
                    <td className="p-4 font-medium">{s.avg_duration_minutes || 0} mins</td>
                    <td className="p-4 text-orange-550 font-bold">{s.early_leavers_count || 0}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${s.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                          {s.is_active ? 'Active' : 'Closed'}
                        </span>
                        {s.is_active && (
                          <button
                            onClick={async () => {
                              if (!confirm('Are you sure you want to end this active session early?')) return;
                              try {
                                await apiFetch(`/api/lecturer/sessions/${s.id}/toggle`, {
                                  method: 'PUT',
                                  body: JSON.stringify({ is_active: false })
                                });
                                if (activeSession && activeSession.id === s.id) {
                                  clearInterval(qrPollInterval.current);
                                  setActiveSession({ ...activeSession, is_active: false, end_time: new Date().toISOString() });
                                }
                                loadSessions();
                              } catch (err) {
                                showToast(err.message, 'error');
                              }
                            }}
                            className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-650 px-2.5 py-1 rounded-xl font-semibold transition"
                          >
                            End
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LIVE SESSION TAB */}
      {activeTab === 'live-session' && activeSession && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="premium-card p-6 flex flex-col items-center justify-center text-center">
            {activeSession.is_active ? (
              <>
                {/* Sub-tab selection */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 w-full">
                  <button
                    onClick={() => setLiveSessionSubMode('checkin')}
                    className={`flex-1 pb-3 text-xs uppercase font-bold border-b-2 transition ${
                      liveSessionSubMode === 'checkin' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-400'
                    }`}
                  >
                    Check-in
                  </button>
                  <button
                    onClick={() => setLiveSessionSubMode('checkout')}
                    className={`flex-1 pb-3 text-xs uppercase font-bold border-b-2 transition ${
                      liveSessionSubMode === 'checkout' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-400'
                    }`}
                  >
                    Check-out
                  </button>
                </div>

                {liveSessionSubMode === 'checkin' ? (
                  <>
                    <h3 className="text-xl font-bold mb-2">Check-in QR Code</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">Rotates every {qrRotationTime} min to prevent sharing</p>

                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="Session QR Code" className="w-64 h-64 border border-slate-100 dark:border-slate-800 rounded-xl mb-4 bg-white" />
                    ) : (
                      <div className="w-64 h-64 border flex items-center justify-center mb-4">Loading QR Code...</div>
                    )}

                    <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-4 flex justify-between text-left text-sm mb-4">
                      <div>
                        <p className="text-slate-500 text-xs">Self Check-in Code</p>
                        <p className="font-bold text-lg text-brand-600">{activeSession.session_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500 text-xs">Time Remaining</p>
                        <p className="font-bold text-lg">{Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s</p>
                      </div>
                    </div>
                  </>
                ) : (
                  !activeSession.checkout_qr_token ? (
                    <div className="py-6 px-4 flex flex-col items-center justify-center text-center">
                      <AlertCircle className="w-12 h-12 text-indigo-500 mb-3 animate-pulse" />
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Check-out is Inactive</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5 leading-normal">
                        Students cannot check out yet. Activate to generate checkout QR code and session code.
                      </p>
                      <button
                        onClick={activateCheckout}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-3 rounded-xl text-xs transition shadow-lg w-full"
                      >
                        Activate Check-out Mode
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold mb-2">Check-out QR Code</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">Scan to record checkout timestamp</p>

                      {checkoutQrCodeUrl ? (
                        <img src={checkoutQrCodeUrl} alt="Checkout QR Code" className="w-64 h-64 border border-slate-100 dark:border-slate-800 rounded-xl mb-4 bg-white" />
                      ) : (
                        <div className="w-64 h-64 border flex items-center justify-center mb-4">Generating QR...</div>
                      )}

                      <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-4 flex justify-between text-left text-sm mb-4">
                        <div>
                          <p className="text-slate-500 text-xs">Checkout Code</p>
                          <p className="font-bold text-lg text-indigo-650">{activeSession.checkout_session_code}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-500 text-xs">Time Remaining</p>
                          <p className="font-bold text-lg">{Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s</p>
                        </div>
                      </div>
                    </>
                  )
                )}

                <div className="flex flex-col gap-2 w-full border-t border-slate-100 dark:border-slate-800 pt-4">
                  <button
                    onClick={startLecturerCameraScan}
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md"
                  >
                    <Camera className="w-4 h-4" />
                    Scan Student Cards
                  </button>
                  <div className="flex gap-2">
                    <label className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold py-3.5 rounded-xl transition cursor-pointer text-center text-sm">
                      <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                      Upload CSV Checkin
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/lecturer/sessions/${activeSession.id}/toggle`, {
                            method: 'PUT',
                            body: JSON.stringify({ is_active: false })
                          });
                          clearInterval(qrPollInterval.current);
                          setActiveSession({ ...activeSession, is_active: false, end_time: new Date().toISOString() });
                          showToast('Session ended');
                        } catch (e) {
                          showToast(e.message, 'error');
                        }
                      }}
                      className="bg-red-500 hover:bg-red-600 text-white font-semibold px-4 rounded-xl text-sm"
                    >
                      Close Session
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Session Ended Card */
              <div className="w-full py-8 text-slate-400 dark:text-slate-500">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
                  <Calendar className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Session Ended</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6">This checking session has been closed early by the lecturer.</p>
                <div className="w-full border-t border-slate-150 dark:border-slate-800 pt-4 text-left text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-xs font-semibold">Session Code</span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">{activeSession.session_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-xs font-semibold">End Time</span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">
                      {new Date(activeSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 premium-card p-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold">Attendance Live Roster</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total present: {liveAttendanceList.filter(l => l.is_present).length} / {liveAttendanceList.length}</p>
              </div>
              <div className="flex items-center gap-4 self-start sm:self-center">
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 bg-emerald-500 rounded-full animate-ping"></span>
                  <span className="text-xs font-semibold text-slate-400">Live Updating</span>
                </div>
                <button
                  onClick={fetchAuditLogs}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs px-3 py-1.5 rounded-lg transition font-semibold"
                >
                  View Audit Logs
                </button>
              </div>
            </div>

            {/* Roster tab list filter */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {[
                { id: 'all', label: `Checked In (${liveAttendanceList.filter(l => l.is_present).length})` },
                { id: 'checked_out', label: `Checked Out (${liveAttendanceList.filter(l => l.is_present && l.checkout_timestamp).length})` },
                { id: 'still_in', label: `Still In (${liveAttendanceList.filter(l => l.is_present && !l.checkout_timestamp).length})` },
                { id: 'absent', label: `Absent (${liveAttendanceList.filter(l => !l.is_present).length})` }
              ].map(subTab => (
                <button
                  key={subTab.id}
                  onClick={() => setRosterFilter(subTab.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition shrink-0 ${
                    rosterFilter === subTab.id
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {subTab.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-bold uppercase">
                    <th className="p-3">Student</th>
                    <th className="p-3">ID</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3 text-right">Status / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {liveAttendanceList.filter(item => {
                    if (rosterFilter === 'all') return item.is_present;
                    if (rosterFilter === 'checked_out') return item.is_present && item.checkout_timestamp;
                    if (rosterFilter === 'still_in') return item.is_present && !item.checkout_timestamp;
                    if (rosterFilter === 'absent') return !item.is_present;
                    return true;
                  }).map(item => {
                    const hasCheckedOut = item.checkout_timestamp !== null;
                    const durationStr = item.duration_minutes !== null ? `${item.duration_minutes}m` : '-';
                    const methodStr = hasCheckedOut ? `${item.method} / ${item.checkout_method}` : (item.method || '-');
                    
                    return (
                      <tr key={item.student_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm">
                        <td className="p-3 font-semibold">{item.name}</td>
                        <td className="p-3">{item.academic_student_id}</td>
                        <td className="p-3 text-slate-400 capitalize text-xs">{methodStr}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 font-medium">{durationStr}</td>
                        <td className="p-3 text-right space-x-2">
                          {item.is_present && (
                            <>
                              {item.attendance_status === 'late' && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold border inline-block" style={{ backgroundColor: '#FFFBEB', color: '#D97706', borderColor: '#D97706' }}>
                                  Late
                                </span>
                              )}
                              {item.attendance_status === 'early_leaver' && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 inline-block">
                                  Early leaver
                                </span>
                              )}
                              {item.attendance_status === 'present' && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-block">
                                  Present
                                </span>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleOpenOverrideModal(item.student_id, item.is_present, item.attendance_status)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
                          >
                            Correct
                          </button>
                          {!item.is_present ? (
                            <button
                              onClick={() => toggleAttendanceStatus(item.student_id, item.is_present)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-650 hover:bg-red-100 transition"
                            >
                              Absent
                            </button>
                          ) : (
                            <>
                              {hasCheckedOut ? (
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                  item.attendance_status === 'early_leaver' 
                                    ? 'bg-orange-150 dark:bg-orange-950/45 text-orange-700' 
                                    : 'bg-emerald-100 dark:bg-emerald-950/45 text-emerald-700'
                                }`}>
                                  {item.attendance_status === 'early_leaver' ? 'Early Leaver' : 'Checked Out'}
                                </span>
                              ) : (
                                <div className="inline-flex gap-2">
                                  {activeSession.checkout_qr_token && (
                                    <button
                                      onClick={() => manualCheckoutStudent(item.student_id)}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 hover:bg-indigo-100 transition"
                                    >
                                      Force Checkout
                                    </button>
                                  )}
                                  <button
                                    onClick={() => toggleAttendanceStatus(item.student_id, item.is_present)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-650 transition"
                                  >
                                    Present
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORTS / EXPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Generate & Export Report</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map(course => (
              <CourseReportCard key={course.id} course={course} apiFetch={apiFetch} showToast={showToast} settings={settings} />
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
          <div className="premium-card p-8">
            <h3 className="text-xl font-bold mb-2">System Attendance Rules</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Define automatic check-in criteria, threshold flags, and anti-fraud modules.</p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-1">Minimum Attendance Threshold</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    className="flex-1"
                    value={settings.minThreshold}
                    onChange={e => setSettings({ ...settings, minThreshold: parseInt(e.target.value) })}
                  />
                  <span className="font-bold text-lg">{settings.minThreshold}%</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Students falling below this threshold will be flagged in reports.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">QR Code Rotation Interval</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={settings.qrRotationMins}
                  onChange={e => setSettings({ ...settings, qrRotationMins: parseInt(e.target.value) })}
                >
                  <option value="1">Every 1 minute</option>
                  <option value="2">Every 2 minutes</option>
                  <option value="5">Every 5 minutes</option>
                  <option value="10">Every 10 minutes</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">Shorter duration helps avoid QR-code photo sharing fraud.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Early Leaver Threshold (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={settings.earlyLeaverThreshold}
                  onChange={e => setSettings({ ...settings, earlyLeaverThreshold: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-slate-500 mt-1">Students checking out before this duration from session end will be flagged as early leavers.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Checkout Window Available Time (Minutes before session ends)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={settings.checkoutWindowMins}
                  onChange={e => setSettings({ ...settings, checkoutWindowMins: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-slate-500 mt-1">Allows student self check-out this many minutes before class scheduled end time.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Frequent Early Leaver Flag Threshold (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={settings.frequentEarlyLeaverThreshold}
                  onChange={e => setSettings({ ...settings, frequentEarlyLeaverThreshold: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-slate-500 mt-1">Flag students checked out early for more than this percentage of their attended classes.</p>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <div>
                    <label className="block text-sm font-semibold">GPS On-Campus Verification</label>
                    <p className="text-xs text-slate-500">Enforce that student coordinates map within campus boundaries.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded text-brand-600"
                    checked={settings.gpsEnabled}
                    onChange={e => setSettings({ ...settings, gpsEnabled: e.target.checked })}
                  />
                </div>
              </div>

              <button
                onClick={() => showToast('Settings applied successfully')}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-xl transition"
              >
                Save Configuration
              </button>
            </div>
          </div>

          <div className="premium-card p-8 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold mb-2">Academic Semesters & Years</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Manage academic years and semesters. Set which academic period is active.</p>

              {/* List of Periods */}
              <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-1">
                {academicPeriods.map(p => {
                  const isEditing = editingPeriodId === p.id;
                  
                  if (isEditing) {
                    return (
                      <form key={p.id} onSubmit={handleEditAcademicPeriod} className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-brand-500 space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            required
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                            value={editYear}
                            onChange={e => setEditYear(e.target.value)}
                          />
                          <select
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                            value={editSemester}
                            onChange={e => setEditSemester(e.target.value)}
                          >
                            <option value="1">Sem 1</option>
                            <option value="2">Sem 2</option>
                          </select>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingPeriodId(null)}
                            className="text-[10px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2.5 py-1 rounded font-bold transition text-slate-800 dark:text-slate-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="text-[10px] bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1 rounded font-bold transition"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div key={p.id} className="flex justify-between items-center p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                      <div>
                        <p className="font-bold text-sm">Semester {p.semester}</p>
                        <p className="text-xs text-slate-500">{p.academic_year}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.is_current ? (
                          <span className="bg-emerald-500 text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Active</span>
                        ) : (
                          <button
                            onClick={() => handleSetCurrentPeriod(p.id)}
                            className="bg-brand-600 hover:bg-brand-700 text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider transition"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingPeriodId(p.id); setEditYear(p.academic_year); setEditSemester(String(p.semester)); }}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-xl transition text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteAcademicPeriod(p.id)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition text-red-500 hover:text-red-755"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add New Period Form */}
            <form onSubmit={handleAddAcademicPeriod} className="border-t border-slate-200/80 dark:border-slate-800/80 pt-6 space-y-4">
              <h4 className="font-bold text-sm">Create New Academic Period</h4>
              
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Academic Year</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2025/2026"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Semester</label>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    value={newSemester}
                    onChange={e => setNewSemester(e.target.value)}
                  >
                    <option value="1">Semester 1</option>
                    <option value="2">Semester 2</option>
                  </select>
                </div>

                <div className="flex items-center justify-end">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      className="h-4.5 w-4.5 rounded text-brand-600"
                      checked={newIsCurrent}
                      onChange={e => setNewIsCurrent(e.target.checked)}
                    />
                    Set Active
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition text-sm"
              >
                Add Academic Period
              </button>
            </form>
          </div>
        </div>
      )}

      {/* INVITES & ACCESS TAB */}
      {activeTab === 'invites' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
          <div className="premium-card p-8">
            <h3 className="text-xl font-bold mb-2">Generate Invite Code</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Create single-use registration codes for other lecturers or course teaching assistants.</p>

            <form onSubmit={handleGenerateInvite} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-1.5">Intended Role</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                    <input
                      type="radio"
                      name="inviteRole"
                      value="ta"
                      checked={inviteRole === 'ta'}
                      onChange={() => setInviteRole('ta')}
                      className="h-4 w-4 text-brand-600"
                    />
                    Teaching Assistant (TA)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                    <input
                      type="radio"
                      name="inviteRole"
                      value="lecturer"
                      checked={inviteRole === 'lecturer'}
                      onChange={() => setInviteRole('lecturer')}
                      className="h-4 w-4 text-brand-600"
                    />
                    Lecturer
                  </label>
                </div>
              </div>

              {inviteRole === 'ta' && (
                <div>
                  <label className="block text-sm font-semibold mb-2">Assign Courses (Required for TA)</label>
                  {courses.length === 0 ? (
                    <p className="text-xs text-red-500 font-medium">Please create courses first before generating a TA invite.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                      {courses.map(course => (
                        <div
                          key={course.id}
                          onClick={() => {
                            if (inviteCourseIds.includes(course.id)) {
                              setInviteCourseIds(inviteCourseIds.filter(cid => cid !== course.id));
                            } else {
                              setInviteCourseIds([...inviteCourseIds, course.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer border transition ${
                            inviteCourseIds.includes(course.id)
                              ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20'
                              : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-sm">{course.name}</p>
                            <p className="text-xs text-slate-500">{course.code}</p>
                          </div>
                          {inviteCourseIds.includes(course.id) && (
                            <Check className="w-4 h-4 text-brand-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-1.5">Expires In</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={inviteExpiresHours}
                  onChange={e => setInviteExpiresHours(e.target.value)}
                >
                  <option value="24">24 Hours</option>
                  <option value="48">48 Hours (Recommended)</option>
                  <option value="72">72 Hours</option>
                  <option value="168">1 Week</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-xl shadow-lg transition"
              >
                Generate Invite Code
              </button>
            </form>
          </div>

          <div className="premium-card p-8 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold mb-2">Active & Past Invite Codes</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 font-medium">Track redemption status and course permissions for generated links.</p>

              <div className="space-y-3 mb-6 max-h-[420px] overflow-y-auto pr-1">
                {inviteCodes.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No invite codes generated yet.</p>
                ) : (
                  inviteCodes.map(code => {
                    const isExpired = new Date(code.expires_at) < new Date();
                    return (
                      <div key={code.id} className="flex justify-between items-start p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200 uppercase tracking-widest">{code.code}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              code.intended_role === 'lecturer' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300' : 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300'
                            }`}>
                              {code.intended_role === 'lecturer' ? 'Lecturer' : 'TA'}
                            </span>
                          </div>
                          {code.intended_role === 'ta' && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5">
                              Assigned Courses: {(() => {
                                let cids = [];
                                try {
                                  cids = typeof code.course_ids === 'string' ? JSON.parse(code.course_ids) : code.course_ids;
                                } catch (e) {}
                                if (!Array.isArray(cids)) cids = [];
                                return courses
                                  .filter(c => cids.includes(c.id))
                                  .map(c => c.code)
                                  .join(', ') || 'None';
                              })()}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-1">
                            Expires: {new Date(code.expires_at).toLocaleString()}
                          </p>
                          {code.used && (
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
                              Redeemed by: {code.used_by_name || 'User ID ' + code.used_by}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {code.used ? (
                            <div className="flex items-center gap-2">
                              {code.intended_role === 'ta' && (
                                code.active_assignment_count > 0 ? (
                                  <button
                                    onClick={() => handleRevokeTA(code.id)}
                                    className="px-2.5 py-1 text-[10px] border border-red-200 dark:border-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition font-semibold"
                                  >
                                    Revoke Access
                                  </button>
                                ) : (
                                  <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                                    Access Revoked
                                  </span>
                                )
                              )}
                              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider" title={`Used by ${code.used_by_name || 'ID ' + code.used_by}`}>
                                Used
                              </span>
                            </div>
                          ) : isExpired ? (
                            <span className="bg-slate-200 text-slate-600 dark:bg-slate-700/60 dark:text-slate-400 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                              Expired
                            </span>
                          ) : (
                            <>
                              <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                                Unused
                              </span>
                              <button
                                onClick={() => handleDeleteInvite(code.id)}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition text-red-500 hover:text-red-755"
                                title="Revoke Invite"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* CSV Roster Preview Modal */}
      {csvPreviewOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
            <h3 className="text-lg font-bold mb-2">Import Student Roster</h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">Upload a CSV file containing students' Name, Student ID (or Index/Reference Number), Level, and Email.</p>
            
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center cursor-pointer hover:border-brand-500 transition mb-4 relative">
              <input
                type="file"
                accept=".csv"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleCsvImportFile}
              />
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Click or drag CSV file here to upload</p>
            </div>

            {csvEnrollList.length > 0 && (
              <div className="flex-1 overflow-y-auto mb-4 border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase">
                      <th className="p-3">Name</th>
                      <th className="p-3">Reference / Student ID</th>
                      <th className="p-3">Index Number</th>
                      <th className="p-3">Level</th>
                      <th className="p-3">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {csvEnrollList.map((s, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{s.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{s.student_id}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{s.index_number || 'N/A'}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{s.level}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{s.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setCsvPreviewOpen(false); setCsvEnrollList([]); }}
                className="bg-slate-100 dark:bg-slate-850 px-4 py-2.5 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={csvEnrollList.length === 0}
                onClick={submitCsvEnrollment}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editingCourse && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEditCourse} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-2">Edit Course</h3>
            <p className="text-slate-500 text-xs mb-4">Modify course details and expected semester sessions.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS-301"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={editCourseCode}
                  onChange={e => setEditCourseCode(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Course Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineering Principles"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={editCourseName}
                  onChange={e => setEditCourseName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Total Semester Sessions (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 15"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={editCourseTotalSessions}
                  onChange={e => setEditCourseTotalSessions(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="flex-1 bg-slate-105 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 py-3 rounded-xl text-sm font-semibold transition animate-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-semibold transition animate-all"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Override Form Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitOverride} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-2">Override Attendance</h3>
            <p className="text-slate-500 text-xs mb-4">Modify the student's attendance records. These changes will be logged in the audit log.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Presence Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOverridePresent(true)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${overridePresent ? 'bg-emerald-600 text-white' : 'bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-350'}`}
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverridePresent(false)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${!overridePresent ? 'bg-red-650 text-white' : 'bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-350'}`}
                  >
                    Absent
                  </button>
                </div>
              </div>

              {overridePresent && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Attendance Status Tag</label>
                  <select
                    value={overrideStatus}
                    onChange={e => setOverrideStatus(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-xs"
                  >
                    <option value="present">Present (On time)</option>
                    <option value="late">Late Check-in</option>
                    <option value="early_leaver">Early Leaver</option>
                    <option value="late_checkout">Late Checkout</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Override</label>
                <textarea
                  required
                  placeholder="e.g. Student's camera failed to scan QR"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-xs dark:text-white"
                  rows="3"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Audit History Logs Modal */}
      {auditLogsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Attendance Correction Audit Logs</h3>
              <button
                onClick={() => setAuditLogsOpen(false)}
                className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                Dismiss
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No manual corrections have been logged for this session.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase">
                      <th className="p-3">Student</th>
                      <th className="p-3">Correction Details</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Changed By</th>
                      <th className="p-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {auditLogs.map(log => {
                      const time = new Date(log.timestamp).toLocaleString();
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                            {log.student_name} <br/>
                            <span className="text-[10px] text-slate-450">({log.academic_student_id})</span>
                          </td>
                          <td className="p-3">
                            <span className="text-red-500 line-through mr-1 font-bold">{log.old_value}</span>
                            &rarr;
                            <span className="text-emerald-500 ml-1 font-bold">{log.new_value}</span>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 italic">{log.reason}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-semibold">{log.changed_by_name}</td>
                          <td className="p-3 text-right text-[10px] text-slate-400 font-medium">{time}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metric Students Detail Modal */}
      {activeMetricModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-lg">
                  {activeMetricModal === 'enrolled' && 'Enrolled Students'}
                  {activeMetricModal === 'flagged' && 'Flagged Students (Below Threshold)'}
                  {activeMetricModal === 'early_leavers' && 'Early Leavers'}
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  {activeMetricModal === 'enrolled' && `List of all ${enrolledStudents.length} students enrolled in this course.`}
                  {activeMetricModal === 'flagged' && `Students below the ${settings.minThreshold}% attendance or high early checkout threshold.`}
                  {activeMetricModal === 'early_leavers' && `Students who checked out early in one or more sessions.`}
                </p>
              </div>
              <button
                onClick={() => { setActiveMetricModal(null); setMetricModalSearch(''); }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-305 p-2 rounded-lg transition"
              >
                Close
              </button>
            </div>

            {/* Search filter input */}
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by student name, ID..."
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-sm font-medium"
                value={metricModalSearch}
                onChange={e => setMetricModalSearch(e.target.value)}
              />
            </div>

            {/* Students Table */}
            <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase">
                    <th className="p-3">Name</th>
                    <th className="p-3">Student / Ref ID</th>
                    <th className="p-3">Level</th>
                    <th className="p-3 text-center">Attended</th>
                    {activeMetricModal === 'early_leavers' ? (
                      <th className="p-3 text-center">Early Leaves</th>
                    ) : (
                      <th className="p-3 text-center">Attendance %</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(() => {
                    const list = 
                      activeMetricModal === 'enrolled' ? enrolledStudents :
                      activeMetricModal === 'flagged' ? flaggedStudents :
                      earlyLeaverStudents;

                    const filtered = list.filter(s => 
                      s.name.toLowerCase().includes(metricModalSearch.toLowerCase()) ||
                      s.academic_student_id.toLowerCase().includes(metricModalSearch.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-400">
                            No matching student records found.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map(s => {
                      const attRate = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 100;
                      return (
                        <tr key={s.academic_student_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs">
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{s.name}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{s.academic_student_id}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{s.level}</td>
                          <td className="p-3 text-center text-slate-700 dark:text-slate-300 font-medium">{s.attended} / {s.total}</td>
                          {activeMetricModal === 'early_leavers' ? (
                            <td className="p-3 text-center text-orange-550 font-bold">{s.early_leavers}</td>
                          ) : (
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                attRate < settings.minThreshold ? 'bg-red-50 text-red-650' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {attRate}%
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Lecturer Camera QR scanner for student cards */}
      {lecturerScannerOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Scan Student Card</h3>
              <button
                onClick={() => {
                  if (lecturerScannerInstance.current) lecturerScannerInstance.current.clear();
                  setLecturerScannerOpen(false);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <div id="lecturer-qr-reader-container" ref={lecturerScannerRef} className="overflow-hidden rounded-xl border-2 qr-scanner-box"></div>
          </div>
        </div>
      )}
    </main></div>
  );
}

// Subcomponent for reports
function CourseReportCard({ course, apiFetch, showToast, settings }) {
  const [loading, setLoading] = useState(false);

  const printQRCodes = async () => {
    try {
      const data = await apiFetch(`/api/lecturer/courses/${course.id}/report`);
      const uniqueStudentsMap = {};
      data.forEach(row => {
        uniqueStudentsMap[row.academic_student_id] = {
          name: row.name,
          student_id: row.academic_student_id,
          level: row.level
        };
      });
      const students = Object.values(uniqueStudentsMap);

      if (students.length === 0) {
        showToast('No students enrolled in this course to print.', 'error');
        return;
      }

      const studentCardsHtml = students.map(s => `
        <div class="card">
          <div class="name">${s.name}</div>
          <div class="id">ID: ${s.student_id} | Level: ${s.level}</div>
          <div id="qr-${s.student_id}" class="qr"></div>
        </div>
      `).join('');

      const qrScripts = students.map(s => `
        try {
          var typeNumber = 0;
          var errorCorrectionLevel = 'L';
          var qr = qrcode(typeNumber, errorCorrectionLevel);
          qr.addData("${s.student_id}");
          qr.make();
          document.getElementById("qr-${s.student_id}").innerHTML = qr.createImgTag(4);
        } catch (e) {
          console.error("Failed to generate QR for ${s.student_id}", e);
        }
      `).join('');

      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Personal QR Codes - ${course.code}</title>
            <style>
              body { font-family: sans-serif; padding: 20px; }
              .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
              .card { border: 2px solid #ccc; padding: 15px; border-radius: 10px; text-align: center; }
              .name { font-weight: bold; margin-bottom: 5px; }
              .id { font-size: 0.9em; color: #555; margin-bottom: 10px; }
              .qr { display: flex; justify-content: center; align-items: center; width: 150px; height: 150px; margin: 0 auto; }
              @media print {
                .no-print { display: none; }
              }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
          </head>
          <body>
            <h2>Personal QR Code Sheets - ${course.name} (${course.code})</h2>
            <button class="no-print" onclick="window.print()" style="padding: 10px 20px; margin-bottom: 20px; font-weight: bold; cursor: pointer; border-radius: 5px; border: 1px solid #999;">Print Now</button>
            <button class="no-print" id="download-zip-btn" onclick="downloadZip()" style="padding: 10px 20px; margin-bottom: 20px; margin-left: 10px; font-weight: bold; cursor: pointer; border-radius: 5px; border: 1px solid #4f46e5; background-color: #4f46e5; color: white;">Download all QR Codes (ZIP)</button>
            <div class="grid">
              ${studentCardsHtml}
            </div>
            <script>
              setTimeout(() => {
                ${qrScripts}
              }, 300);

              function downloadZip() {
                const btn = document.getElementById('download-zip-btn');
                btn.disabled = true;
                btn.innerText = 'Downloading...';
                const token = encodeURIComponent(localStorage.getItem('token') || '');
                window.location.href = '${window.location.origin}/api/lecturer/courses/${course.id}/download-qrs-zip?token=' + token;
                setTimeout(() => {
                  btn.disabled = false;
                  btn.innerText = 'Download all QR Codes (ZIP)';
                }, 3000);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const downloadCSV = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/lecturer/courses/${course.id}/report`);
      
      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += 'Student Name,Student ID,Level,Session Date,Session Code,Check-in Time,Check-out Time,Duration (mins),Status,Overall Attendance Rate,Overall Early Leaver %\n';
      
      data.forEach(row => {
        const rate = row.total_sessions > 0 ? Math.round((row.attended_sessions / row.total_sessions) * 100) : 100;
        const earlyLeaverRate = row.attended_sessions > 0 ? Math.round((row.early_leaver_sessions / row.attended_sessions) * 100) : 0;
        const checkinStr = row.checkin_time ? new Date(row.checkin_time).toLocaleTimeString() : 'N/A';
        const checkoutStr = row.checkout_time ? new Date(row.checkout_time).toLocaleTimeString() : 'N/A';
        const durationStr = row.duration_minutes !== null ? row.duration_minutes : 'N/A';
        const statusStr = row.attendance_status || 'N/A';
        csvContent += `"${row.name}","${row.academic_student_id}","${row.level}","${row.session_date ? new Date(row.session_date).toLocaleDateString() : 'N/A'}","${row.session_code || 'N/A'}","${checkinStr}","${checkoutStr}",${durationStr},"${statusStr}",${rate}%,${earlyLeaverRate}%\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `report-${course.code}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported ${course.code} CSV Report successfully`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-card p-6 flex justify-between items-center">
      <div>
        <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 px-2 py-1 rounded font-semibold">{course.code}</span>
        <h4 className="font-bold text-base mt-2">{course.name}</h4>
      </div>
      <div className="flex gap-2">
        <button
          onClick={printQRCodes}
          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold transition"
        >
          <Printer className="w-4 h-4" />
          Print QRs
        </button>
        <button
          onClick={downloadCSV}
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold transition"
        >
          <Download className="w-4 h-4" />
          {loading ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// STUDENT PORTAL CONSOLE
// -------------------------------------------------------------
function StudentConsole({ user, settings, showToast, apiFetch, queueOfflineRequest }) {
  const [courses, setCourses] = useState([]);
  const [history, setHistory] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);


  // Checkout additions
  const [isCheckoutAction, setIsCheckoutAction] = useState(false);
  const [checkoutStatusDetails, setCheckoutStatusDetails] = useState(null);

  const scannerRef = useRef(null);
  const scannerInstance = useRef(null);

  useEffect(() => {
    loadStudentData();
    window.addEventListener('focus', loadStudentData);
    return () => {
      window.removeEventListener('focus', loadStudentData);
    };
  }, []);

  const loadStudentData = async () => {
    try {
      const courseData = await apiFetch('/api/student/courses');
      setCourses(courseData);
      
      const historyData = await apiFetch('/api/student/history');
      setHistory(historyData);
    } catch (e) {
      setCourses([
        { id: 1, name: 'Introduction to Computer Science', code: 'CS-101', attended: 4, total_sessions: 5 },
        { id: 2, name: 'Software Engineering Principles', code: 'CS-301', attended: 2, total_sessions: 5 }
      ]);
    }
  };

  // Find check-in without check-out (only active if the session itself is still active)
  const activeCheckin = history.find(log => 
    log.is_present && 
    !log.checkout_timestamp &&
    log.is_active &&
    (new Date() - new Date(log.timestamp)) < 4 * 60 * 60 * 1000 // Checked in within last 4 hours
  );

  const getCoordinates = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        () => resolve(null),
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  };

  const startCameraScan = async (isCheckout = false) => {
    setIsCheckoutAction(isCheckout);
    setScannerOpen(true);
    setTimeout(() => {
      if (!scannerRef.current) return;
      scannerInstance.current = new Html5QrcodeScanner(
        "qr-reader-container",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerInstance.current.render(async (decodedText) => {
        try {
          scannerInstance.current.clear();
        } catch (e) {
          console.warn('Scanner clear error', e);
        }
        setScannerOpen(false);
        
        let token = decodedText;
        try {
          if (decodedText.startsWith('http://') || decodedText.startsWith('https://')) {
            const url = new URL(decodedText);
            token = url.searchParams.get('qr') || decodedText;
          }
        } catch (e) {
          console.warn('URL parsing error, using raw decodedText', e);
        }

        if (!token) return showToast('Invalid QR Code format scanned', 'error');

        if (isCheckout) {
          handleQrCheckOut(token);
        } else {
          handleQrCheckIn(token);
        }
      }, (error) => {
        // Silence console scanner debug errors
      });
    }, 500);
  };

  const handleQrCheckIn = async (qrToken) => {
    setCheckingIn(true);
    const geo = await getCoordinates();
    const payload = {
      qr_token: qrToken,
      lat: geo?.lat,
      lng: geo?.lng,
      accuracy: geo?.accuracy
    };

    if (!navigator.onLine) {
      queueOfflineRequest('/api/student/check-in/qr', payload);
      setCheckingIn(false);
      return;
    }

    try {
      const response = await apiFetch('/api/student/check-in/qr', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(response.message);
      loadStudentData();
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        queueOfflineRequest('/api/student/check-in/qr', payload);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleQrCheckOut = async (qrToken) => {
    if (!activeCheckin) return showToast('No active check-in found.', 'error');
    setCheckingIn(true);
    const payload = {
      method: 'qr',
      qr_token: qrToken
    };

    if (!navigator.onLine) {
      queueOfflineRequest(`/api/sessions/${activeCheckin.session_id}/checkout`, payload);
      setCheckingIn(false);
      return;
    }

    try {
      const response = await apiFetch(`/api/sessions/${activeCheckin.session_id}/checkout`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(response.message);
      setCheckoutStatusDetails(response.record);
      loadStudentData();
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        queueOfflineRequest(`/api/sessions/${activeCheckin.session_id}/checkout`, payload);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCodeCheckIn = async (e) => {
    if (e) e.preventDefault();
    setCheckingIn(true);
    const geo = await getCoordinates();
    const payload = {
      session_code: sessionCode,
      lat: geo?.lat,
      lng: geo?.lng,
      accuracy: geo?.accuracy
    };

    if (!navigator.onLine) {
      queueOfflineRequest('/api/student/check-in/code', payload);
      setSessionCode('');
      setCodeOpen(false);
      setCheckingIn(false);
      return;
    }

    try {
      const response = await apiFetch('/api/student/check-in/code', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(response.message);
      setSessionCode('');
      setCodeOpen(false);
      loadStudentData();
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        queueOfflineRequest('/api/student/check-in/code', payload);
        setSessionCode('');
        setCodeOpen(false);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCodeCheckOut = async (e) => {
    if (e) e.preventDefault();
    if (!activeCheckin) return showToast('No active check-in found.', 'error');
    setCheckingIn(true);
    const payload = {
      method: 'code',
      session_code: sessionCode
    };

    if (!navigator.onLine) {
      queueOfflineRequest(`/api/sessions/${activeCheckin.session_id}/checkout`, payload);
      setSessionCode('');
      setCodeOpen(false);
      setCheckingIn(false);
      return;
    }

    try {
      const response = await apiFetch(`/api/sessions/${activeCheckin.session_id}/checkout`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(response.message);
      setSessionCode('');
      setCodeOpen(false);
      setCheckoutStatusDetails(response.record);
      loadStudentData();
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        queueOfflineRequest(`/api/sessions/${activeCheckin.session_id}/checkout`, payload);
        setSessionCode('');
        setCodeOpen(false);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setCheckingIn(false);
    }
  };


  const submitCodeForm = (e) => {
    if (isCheckoutAction) {
      handleCodeCheckOut(e);
    } else {
      handleCodeCheckIn(e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Alert if any course falls below threshold */}
      {courses.some(c => c.total_sessions > 0 && Math.round((c.attended / c.total_sessions) * 100) < settings.minThreshold) && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-800 dark:text-red-400 text-sm">Attendance Warning</h4>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">One or more of your courses is currently below the required minimum threshold of {settings.minThreshold}%. Please attend subsequent classes.</p>
          </div>
        </div>
      )}

      {/* Main Check-in / Check-out Hub */}
      {!activeCheckin ? (
        <div className="premium-card p-6 text-white border-0 shadow-lg shadow-brand-500/20 flex flex-col items-center justify-center text-center" style={{ background: 'linear-gradient(to bottom right, #2563eb, #4f46e5)' }}>
          <h3 className="text-xl font-bold">Class Attendance Panel</h3>
          <p className="text-white/80 text-xs mt-1">Verify attendance by checking in or checking out using QR codes or numeric codes.</p>
          
          <div className="flex gap-4 w-full mt-6">
            <button
              onClick={() => startCameraScan(false)}
              disabled={checkingIn}
              className="flex-1 bg-white hover:bg-slate-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg text-sm"
              style={{ color: '#2563eb' }}
            >
              <Camera className="w-4 h-4" style={{ color: '#2563eb' }} />
              Scan QR Code
            </button>
            <button
              onClick={() => { setIsCheckoutAction(false); setCodeOpen(true); }}
              disabled={checkingIn}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 border border-white/20 transition text-sm"
            >
              <Keyboard className="w-4 h-4" />
              Enter Code
            </button>
          </div>

        </div>
      ) : (
        <div className="premium-card p-6 text-white border-0 shadow-lg shadow-indigo-500/20 flex flex-col items-center justify-center text-center" style={{ background: 'linear-gradient(to bottom right, #4f46e5, #312e81)' }}>
          <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-1 rounded-full uppercase tracking-wider mb-2">Checked In</span>
          <h3 className="text-xl font-bold">{activeCheckin.course_code} - {activeCheckin.course_name}</h3>
          <p className="text-white/80 text-xs mt-1">Check-in recorded at {new Date(activeCheckin.timestamp).toLocaleTimeString()}</p>
          
          {activeCheckin.checkout_qr_token ? (
            <div className="flex gap-4 w-full mt-6">
              <button
                onClick={() => startCameraScan(true)}
                disabled={checkingIn}
                className="flex-1 bg-white hover:bg-slate-105 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg text-sm"
                style={{ color: '#312e81' }}
              >
                <Camera className="w-4 h-4" style={{ color: '#312e81' }} />
                Scan Checkout QR
              </button>
              <button
                onClick={() => { setIsCheckoutAction(true); setCodeOpen(true); }}
                disabled={checkingIn}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 border border-white/20 transition text-sm"
              >
                <Keyboard className="w-4 h-4" />
                Enter Checkout Code
              </button>
            </div>
          ) : (
            <div className="mt-6 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs w-full">
              Waiting for the lecturer to open the check-out window...
            </div>
          )}
        </div>
      )}

      {/* Checkout Success Result Modal */}
      {checkoutStatusDetails && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl flex flex-col items-center justify-center text-center text-sm">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 animate-bounce" />
          <h4 className="font-bold text-emerald-800 dark:text-emerald-400">Successfully Checked Out</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Duration: <span className="font-bold text-slate-800 dark:text-slate-100">{checkoutStatusDetails.duration_minutes} minutes</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Attendance Quality Status: <span className="font-bold capitalize text-emerald-600">{checkoutStatusDetails.attendance_status}</span>
          </p>
          <button
            onClick={() => setCheckoutStatusDetails(null)}
            className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Camera QR scanner box overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">{isCheckoutAction ? 'Scan Checkout QR' : 'Scan Check-in QR'}</h3>
              <button
                onClick={() => {
                  if (scannerInstance.current) scannerInstance.current.clear();
                  setScannerOpen(false);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <div id="qr-reader-container" ref={scannerRef} className="overflow-hidden rounded-xl border-2 qr-scanner-box"></div>
          </div>
        </div>
      )}



      {/* Code check-in/out overlay */}
      {codeOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitCodeForm} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-2">{isCheckoutAction ? 'Enter Checkout Code' : 'Enter Session Code'}</h3>
            <p className="text-slate-500 text-xs mb-4">Provided by the lecturer at the check-out window.</p>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-center font-bold text-lg tracking-wider mb-4"
              placeholder={isCheckoutAction ? "e.g. OUT-1001" : "e.g. ATT-1001"}
              value={sessionCode}
              onChange={e => setSessionCode(e.target.value.toUpperCase())}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCodeOpen(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checkingIn}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                {checkingIn ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Verifying...</span>
                  </>
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </form>
        </div>
      )}






      {/* Courses Progress list */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Course Attendance Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map(c => {
            const pct = c.total_sessions > 0 ? Math.round((c.attended / c.total_sessions) * 100) : 100;
            const isFlagged = pct < settings.minThreshold;
            return (
              <div key={c.id} className="premium-card p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 px-2 py-1 rounded font-semibold">{c.code}</span>
                    <h4 className="font-bold text-sm mt-2">{c.name}</h4>
                  </div>
                  <span className={`text-sm font-bold ${isFlagged ? 'text-red-500' : 'text-emerald-500'}`}>{pct}%</span>
                </div>
                
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isFlagged ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
                
                <p className="text-xs text-slate-500">Attended {c.attended} of {c.total_sessions} total sessions</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Student history logs */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Your Verification Logs</h3>
        <div className="premium-card overflow-hidden">
          {history.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">No verification logs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-bold uppercase">
                    <th className="p-3">Course</th>
                    <th className="p-3">Check-in</th>
                    <th className="p-3">Check-out</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((log, idx) => {
                    const checkinTime = new Date(log.timestamp).toLocaleString();
                    const checkoutTime = log.checkout_timestamp ? new Date(log.checkout_timestamp).toLocaleTimeString() : 'N/A';
                    const durationStr = log.duration_minutes !== null ? `${log.duration_minutes} mins` : '-';
                    const statusStr = log.attendance_status || 'present';
                    
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm">
                        <td className="p-3">
                          <p className="font-semibold">{log.course_name}</p>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">{log.course_code}</span>
                        </td>
                        <td className="p-3 text-xs text-slate-500">{checkinTime} ({log.method})</td>
                        <td className="p-3 text-xs text-slate-500">{checkoutTime}</td>
                        <td className="p-3 font-semibold">{durationStr}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                            statusStr === 'early_leaver' ? 'bg-orange-100 text-orange-700' :
                            statusStr === 'late_checkout' ? 'bg-indigo-105 text-indigo-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {statusStr.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
