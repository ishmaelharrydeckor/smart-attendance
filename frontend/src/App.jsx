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
  AlertCircle
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Mock/Default configurations (Stored in LocalStorage to preserve settings)
const DEFAULT_SETTINGS = {
  minThreshold: 75,
  qrRotationMins: 1,
  gpsRadius: 200,
  gpsEnabled: false
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

  // Global Toast Notification
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  const API_BASE = import.meta.env.VITE_API_URL || '';

  // Helper fetch wrapper to include token headers
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server request failed');
    }
    return response.json();
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans`}>
      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-bounce">
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
      {user && (
        <nav className="sticky top-0 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 text-white p-2.5 rounded-xl shadow-lg shadow-brand-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none tracking-tight">Antigravity Roll</h1>
              <span className="text-xs text-slate-500 dark:text-slate-400">Smart Attendance System</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? '☀️' : '🌙'}
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
        <AuthScreen onAuthSuccess={(t, u) => { setToken(t); setUser(u); showToast(`Welcome back, ${u.name}!`); }} showToast={showToast} apiFetch={apiFetch} />
      ) : user.role === 'lecturer' ? (
        <LecturerConsole
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          settings={settings}
          setSettings={setSettings}
          showToast={showToast}
          apiFetch={apiFetch}
        />
      ) : (
        <StudentConsole
          user={user}
          settings={settings}
          showToast={showToast}
          apiFetch={apiFetch}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// AUTHENTICATION SCREEN (LOGIN & REGISTER)
// -------------------------------------------------------------
function AuthScreen({ onAuthSuccess, showToast, apiFetch }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentId, setStudentId] = useState('');
  const [level, setLevel] = useState('100');
  const [loginId, setLoginId] = useState('');
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isRegister) {
      // Fetch available courses so student can select them
      apiFetch('/api/lecturer/courses')
        .then(setCourses)
        .catch(() => {
          // If auth isn't active yet, use mock fallback list
          setCourses([
            { id: 1, name: 'Introduction to Computer Science', code: 'CS-101' },
            { id: 2, name: 'Data Structures and Algorithms', code: 'CS-201' },
            { id: 3, name: 'Software Engineering Principles', code: 'CS-301' }
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

  const toggleCourseSelect = (id) => {
    if (selectedCourses.includes(id)) {
      setSelectedCourses(selectedCourses.filter(cid => cid !== id));
    } else {
      setSelectedCourses([...selectedCourses, id]);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex bg-brand-500 text-white p-3.5 rounded-2xl shadow-lg shadow-brand-500/30 mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{isRegister ? 'Student Registration' : 'Sign in to your portal'}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Smart Attendance Management System</p>
        </div>

        {isRegister ? (
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
                  onChange={e => setLevel(e.target.value)}
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
              <input
                type="password"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Select Enrolled Courses</label>
              <div className="space-y-2 max-h-32 overflow-y-auto border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                {courses.map(course => (
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
                ))}
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
              <button type="button" onClick={() => setIsRegister(false)} className="text-brand-600 font-medium hover:underline">Sign in</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email or Student ID</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="lecturer@university.edu or STU001"
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
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
              <button type="button" onClick={() => setIsRegister(true)} className="text-brand-600 font-medium hover:underline">Register here</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// LECTURER PORTAL CONSOLE
// -------------------------------------------------------------
const LECTURE_ROOMS = [
  { name: 'Engineering Auditorium', lat: 6.67316, lng: -1.56540 },
  { name: 'New Engineering Building (NEB)', lat: 6.67370, lng: -1.56480 },
  { name: 'Old Engineering Block (OEB)', lat: 6.67280, lng: -1.56590 },
  { name: 'Petroleum Building Lecture Theatre', lat: 6.67410, lng: -1.56420 },
  { name: 'Chemical Engineering Building Hall', lat: 6.67220, lng: -1.56520 }
];

function LecturerConsole({ user, activeTab, setActiveTab, settings, setSettings, showToast, apiFetch }) {
  const [stats, setStats] = useState({ totalStudents: 0, presentToday: 0, absentToday: 0, overallPercentage: 100 });
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [flagged, setFlagged] = useState([]);

  // Modals / forms
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [selectedCourseForSession, setSelectedCourseForSession] = useState('');
  const [sessionDuration, setSessionDuration] = useState(10);
  const [selectedRoomIndex, setSelectedRoomIndex] = useState(0);

  // Active Live Session details
  const [activeSession, setActiveSession] = useState(null);
  const [liveAttendanceList, setLiveAttendanceList] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrRotationTime, setQrRotationTime] = useState(settings.qrRotationMins);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const qrPollInterval = useRef(null);

  useEffect(() => {
    loadStats();
    loadCourses();
    loadSessions();
  }, []);

  const loadStats = async () => {
    try {
      const data = await apiFetch('/api/lecturer/dashboard-stats');
      setStats(data);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadCourses = async () => {
    try {
      const data = await apiFetch('/api/lecturer/courses');
      setCourses(data);
      if (data.length > 0) setSelectedCourseForSession(data[0].id);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await apiFetch('/api/lecturer/sessions');
      setSessions(data);
    } catch (e) {
      console.warn(e.message);
    }
  };

  const createCourse = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/lecturer/courses', {
        method: 'POST',
        body: JSON.stringify({ name: newCourseName, code: newCourseCode })
      });
      showToast('Course created successfully');
      setNewCourseName('');
      setNewCourseCode('');
      loadCourses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const startSession = async () => {
    if (!selectedCourseForSession) return showToast('Please select a course', 'error');
    const room = LECTURE_ROOMS[selectedRoomIndex];
    try {
      const session = await apiFetch('/api/lecturer/sessions', {
        method: 'POST',
        body: JSON.stringify({
          course_id: selectedCourseForSession,
          duration_mins: sessionDuration,
          qr_rotation_mins: qrRotationTime,
          location_name: room?.name,
          gps_lat: room?.lat,
          gps_lng: room?.lng
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

        if (status.status === 'EXPIRED') {
          showToast('Session checking window closed.', 'info');
          clearInterval(qrPollInterval.current);
          setActiveSession(null);
          loadSessions();
          return;
        }

        // Generate QR code on frontend using standard URL signature
        const appUrl = `${window.location.origin}/check-in?qr=${status.qr_token}`;
        const qrUrl = await QRCode.toDataURL(appUrl, { width: 400, margin: 2 });
        setQrCodeUrl(qrUrl);

        // Fetch attendance live lists
        const list = await apiFetch(`/api/lecturer/sessions/${sessionId}/live-attendance`);
        setLiveAttendanceList(list);
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
      setLiveAttendanceList(list);
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
        setLiveAttendanceList(list);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Tab Switchers */}
      <div className="flex gap-2 overflow-x-auto pb-4 border-b border-slate-200 dark:border-slate-800 mb-8">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Users },
          { id: 'courses', label: 'Manage Courses', icon: BookOpen },
          { id: 'sessions', label: 'Sessions', icon: Calendar },
          activeSession && { id: 'live-session', label: 'Live Active Session', icon: RefreshCw },
          { id: 'reports', label: 'Export Reports', icon: FileSpreadsheet },
          { id: 'settings', label: 'Settings', icon: Settings }
        ].filter(Boolean).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition shrink-0 ${
              activeTab === tab.id
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/10'
                : 'bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="premium-card p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Total Enrolled</p>
                <h3 className="text-3xl font-bold mt-1">{stats.totalStudents}</h3>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl text-blue-600 dark:text-blue-400">
                <Users className="w-6 h-6" />
              </div>
            </div>
            <div className="premium-card p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Present Today</p>
                <h3 className="text-3xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{stats.presentToday}</h3>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
            <div className="premium-card p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Absent Today</p>
                <h3 className="text-3xl font-bold mt-1 text-red-500">{stats.absentToday}</h3>
              </div>
              <div className="bg-red-50 dark:bg-red-950/40 p-4 rounded-2xl text-red-600 dark:text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
            <div className="premium-card p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Overall Attendance</p>
                <h3 className="text-3xl font-bold mt-1">{stats.overallPercentage}%</h3>
              </div>
              <div className="bg-brand-50 dark:bg-brand-950/40 p-4 rounded-2xl text-brand-600 dark:text-brand-400">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Quick Session starter */}
          <div className="premium-card p-8 bg-gradient-to-br from-brand-600 to-indigo-700 text-white border-0 shadow-lg shadow-brand-500/10">
            <h3 className="text-xl font-bold">Start a New Attendance Session</h3>
            <p className="text-white/80 text-sm mt-1">Select a course to generate a dynamic time-limited QR-code and self-checkin code.</p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mt-6">
              <select
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white outline-none"
                value={selectedCourseForSession}
                onChange={e => setSelectedCourseForSession(e.target.value)}
              >
                <option value="" className="text-slate-900">Select Course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id} className="text-slate-900">{c.code} - {c.name}</option>
                ))}
              </select>
              <select
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white outline-none"
                value={selectedRoomIndex}
                onChange={e => setSelectedRoomIndex(parseInt(e.target.value))}
              >
                {LECTURE_ROOMS.map((room, idx) => (
                  <option key={idx} value={idx} className="text-slate-900">{room.name}</option>
                ))}
              </select>
              <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                <Clock className="w-4 h-4 mr-2" />
                <input
                  type="number"
                  placeholder="Duration (mins)"
                  className="bg-transparent text-white focus:outline-none w-full"
                  value={sessionDuration}
                  onChange={e => setSessionDuration(parseInt(e.target.value) || 10)}
                />
              </div>
              <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                <input
                  type="number"
                  placeholder="QR Rotation (mins)"
                  className="bg-transparent text-white focus:outline-none w-full"
                  value={qrRotationTime}
                  onChange={e => setQrRotationTime(parseInt(e.target.value) || 1)}
                />
              </div>
              <button
                onClick={startSession}
                className="bg-white text-brand-600 font-bold px-6 py-3.5 rounded-xl hover:bg-slate-100 transition shadow-lg"
              >
                Launch Session
              </button>
            </div>
          </div>
        </div>
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none"
                  value={newCourseName}
                  onChange={e => setNewCourseName(e.target.value)}
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
                  <th className="p-4">Present Students</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm">
                    <td className="p-4">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="p-4 font-semibold">{s.course_code}</td>
                    <td className="p-4"><code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{s.session_code}</code></td>
                    <td className="p-4">{s.present_count || 0} present</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${s.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                        {s.is_active ? 'Active' : 'Closed'}
                      </span>
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

            <div className="flex gap-2 w-full">
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
                    setActiveSession(null);
                    showToast('Session ended');
                    setActiveTab('sessions');
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

          <div className="md:col-span-2 premium-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Attendance Live Roster ({liveAttendanceList.filter(l => l.is_present).length} / {liveAttendanceList.length})</h3>
              <div className="flex gap-2">
                <span className="h-3.5 w-3.5 bg-emerald-500 rounded-full animate-ping"></span>
                <span className="text-xs font-semibold text-slate-400">Live Updating</span>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-bold uppercase">
                    <th className="p-3">Student</th>
                    <th className="p-3">ID</th>
                    <th className="p-3">Level</th>
                    <th className="p-3">Method</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {liveAttendanceList.map(item => (
                    <tr key={item.student_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm">
                      <td className="p-3 font-semibold">{item.name}</td>
                      <td className="p-3">{item.academic_student_id}</td>
                      <td className="p-3">{item.level}</td>
                      <td className="p-3 text-slate-400 capitalize">{item.method || '-'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => toggleAttendanceStatus(item.student_id, item.is_present)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            item.is_present
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700'
                              : 'bg-red-50 dark:bg-red-950/30 text-red-600'
                          }`}
                        >
                          {item.is_present ? 'Present' : 'Absent'}
                        </button>
                      </td>
                    </tr>
                  ))}
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
        <div className="max-w-xl premium-card p-8">
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
      )}
    </div>
  );
}

// Subcomponent for reports
function CourseReportCard({ course, apiFetch, showToast, settings }) {
  const [loading, setLoading] = useState(false);

  const downloadCSV = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/lecturer/courses/${course.id}/report`);
      
      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += 'Student Name,Student ID,Level,Sessions Attended,Total Sessions,Attendance Rate,Flagged Status\n';
      
      data.forEach(row => {
        const rate = row.total_sessions > 0 ? Math.round((row.attended_sessions / row.total_sessions) * 100) : 100;
        const status = rate < settings.minThreshold ? 'FLAGGED' : 'OK';
        csvContent += `"${row.name}","${row.academic_student_id}","${row.level}",${row.attended_sessions},${row.total_sessions},${rate}%,${status}\n`;
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
      <button
        onClick={downloadCSV}
        disabled={loading}
        className="bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold transition"
      >
        <Download className="w-4 h-4" />
        {loading ? 'Exporting...' : 'Export CSV'}
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// STUDENT PORTAL CONSOLE
// -------------------------------------------------------------
function StudentConsole({ user, settings, showToast, apiFetch }) {
  const [courses, setCourses] = useState([]);
  const [history, setHistory] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  const scannerRef = useRef(null);
  const scannerInstance = useRef(null);

  useEffect(() => {
    loadStudentData();
  }, []);

  const loadStudentData = async () => {
    try {
      const courseData = await apiFetch('/api/student/courses');
      setCourses(courseData);
      
      const historyData = await apiFetch('/api/student/history');
      setHistory(historyData);
    } catch (e) {
      // Offline fallback/mock if DB query fails during local load check
      setCourses([
        { id: 1, name: 'Introduction to Computer Science', code: 'CS-101', attended: 4, total_sessions: 5 },
        { id: 2, name: 'Software Engineering Principles', code: 'CS-301', attended: 2, total_sessions: 5 }
      ]);
    }
  };

  // Geo coordinate extractor
  const getCoordinates = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  // Launch camera scan
  const startCameraScan = async () => {
    setScannerOpen(true);
    setTimeout(() => {
      if (!scannerRef.current) return;
      scannerInstance.current = new Html5QrcodeScanner(
        "qr-reader-container",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerInstance.current.render(async (decodedText) => {
        // Stop scanning
        scannerInstance.current.clear();
        setScannerOpen(false);
        
        // Extract token
        const url = new URL(decodedText);
        const token = url.searchParams.get('qr');
        if (!token) return showToast('Invalid QR Code format scanned', 'error');

        // Send check-in request
        handleQrCheckIn(token);
      }, (error) => {
        // Silence console scanner debug errors
      });
    }, 500);
  };

  const handleQrCheckIn = async (qrToken) => {
    setCheckingIn(true);
    try {
      const geo = await getCoordinates();
      const response = await apiFetch('/api/student/check-in/qr', {
        method: 'POST',
        body: JSON.stringify({
          qr_token: qrToken,
          lat: geo?.lat,
          lng: geo?.lng
        })
      });
      showToast(response.message);
      loadStudentData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCodeCheckIn = async (e) => {
    e.preventDefault();
    setCheckingIn(true);
    try {
      const geo = await getCoordinates();
      const response = await apiFetch('/api/student/check-in/code', {
        method: 'POST',
        body: JSON.stringify({
          session_code: sessionCode,
          lat: geo?.lat,
          lng: geo?.lng
        })
      });
      showToast(response.message);
      setSessionCode('');
      setCodeOpen(false);
      loadStudentData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCheckingIn(false);
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

      {/* Main Check-in Hub */}
      <div className="premium-card p-6 bg-gradient-to-br from-brand-600 to-indigo-800 text-white border-0 shadow-lg shadow-brand-500/20 flex flex-col items-center justify-center text-center">
        <h3 className="text-xl font-bold">Class Check-in Panel</h3>
        <p className="text-white/80 text-xs mt-1">Verify presence using QR code scanning or numeric check-in codes.</p>
        
        <div className="flex gap-4 w-full mt-6">
          <button
            onClick={startCameraScan}
            disabled={checkingIn}
            className="flex-1 bg-white hover:bg-slate-100 text-brand-600 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg"
          >
            <Camera className="w-4 h-4" />
            Scan QR Code
          </button>
          <button
            onClick={() => setCodeOpen(true)}
            disabled={checkingIn}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 border border-white/20 transition"
          >
            <Keyboard className="w-4 h-4" />
            Enter Code
          </button>
        </div>
      </div>

      {/* Camera QR scanner box overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Scan Lecturer Screen QR</h3>
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
            <div id="qr-reader-container" className="overflow-hidden rounded-xl border-2 qr-scanner-box"></div>
          </div>
        </div>
      )}

      {/* Code check-in overlay */}
      {codeOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCodeCheckIn} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-2">Enter Session Code</h3>
            <p className="text-slate-500 text-xs mb-4">Provided by the lecturer at the beginning of the lecture.</p>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:ring-2 focus:ring-brand-500 outline-none text-center font-bold text-lg tracking-wider mb-4"
              placeholder="e.g. ATT-1001"
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
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-semibold"
              >
                Verify
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
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((log, idx) => (
                <div key={idx} className="p-4 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold">{log.course_name}</p>
                    <p className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()} ({log.method} check-in)</p>
                  </div>
                  <span className="text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 px-2.5 py-1 rounded-lg">Verified</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
