// Render free tier spins down after 15 minutes of inactivity. The first API request after sleep takes 30-60 seconds.
// Set up a free uptime monitor at https://uptimerobot.com checking https://smart-attendance-gf6k.onrender.com/api/health every 10 minutes to keep it awake.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://smart-attendance-gf6k.onrender.com';

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    if (!response.ok) {
      throw new Error(`API Request failed with status ${response.status}`);
    }
    throw new Error('Invalid JSON response from server');
  }

  if (!response.ok) {
    throw new Error(data.error || 'API Request failed');
  }

  return data;
}
