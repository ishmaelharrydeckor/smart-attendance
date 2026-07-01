import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../utils/api';

export type QueuedRequest = {
  id: string;
  endpoint: string;
  method: 'POST';
  payload: Record<string, any>;
  queuedAt: string;
  attempts: number;
};

export type QueueResult =
  | { status: 'submitted'; data: any }
  | { status: 'queued'; id: string }
  | { status: 'failed'; error: string };

const QUEUE_KEY = 'smartroll_offline_queue';

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueLength, setQueueLength] = useState<number>(0);
  const isOnlineRef = useRef<boolean>(true);

  // Monitor network state
  useEffect(() => {
    // Initial fetch
    NetInfo.fetch().then((state) => {
      const online = state.isConnected !== false;
      setIsOnline(online);
      isOnlineRef.current = online;
    });

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false;
      const wasOffline = !isOnlineRef.current;
      
      setIsOnline(online);
      isOnlineRef.current = online;

      if (wasOffline && online) {
        // Trigger auto-flush on reconnect after 2-second delay
        setTimeout(() => {
          if (isOnlineRef.current) {
            flushQueue();
          }
        }, 2000);
      }
    });

    return () => unsubscribe();
  }, []);

  // Update queueLength on mount & clean up
  useEffect(() => {
    getQueue().then((q) => {
      setQueueLength(q.length);
      if (q.length > 0 && isOnlineRef.current) {
        flushQueue();
      }
    });
  }, []);

  const getQueue = async (): Promise<QueuedRequest[]> => {
    try {
      const data = await AsyncStorage.getItem(QUEUE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed as QueuedRequest[];
        }
      }
    } catch (e) {
      console.warn('Error reading offline queue:', e);
    }
    return [];
  };

  const saveQueue = async (queue: QueuedRequest[]) => {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      setQueueLength(queue.length);
    } catch (e) {
      console.warn('Error saving offline queue:', e);
    }
  };

  const clearQueue = async () => {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
      setQueueLength(0);
    } catch (e) {
      console.warn('Error clearing offline queue:', e);
    }
  };

  const enqueue = async (request: Omit<QueuedRequest, 'id' | 'queuedAt' | 'attempts'>): Promise<QueueResult> => {
    const newRequest: QueuedRequest = {
      ...request,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };

    if (isOnlineRef.current) {
      try {
        const responseData = await apiFetch(newRequest.endpoint, {
          method: newRequest.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRequest.payload),
        });
        return { status: 'submitted', data: responseData };
      } catch (err: any) {
        // Handle network race conditions (failed to connect despite NetInfo reporting online)
        const isNetworkError =
          err.message?.includes('Network request failed') ||
          err.message?.includes('Failed to fetch') ||
          err.message?.includes('type error') ||
          err.status === 0 ||
          !err.status;

        if (isNetworkError) {
          const queue = await getQueue();
          queue.push(newRequest);
          await saveQueue(queue);
          return { status: 'queued', id: newRequest.id };
        } else {
          // Permanent API error (4xx) - reject immediately
          return { status: 'failed', error: err.message || 'API request failed' };
        }
      }
    } else {
      // Offline: queue request
      const queue = await getQueue();
      queue.push(newRequest);
      await saveQueue(queue);
      return { status: 'queued', id: newRequest.id };
    }
  };

  const flushQueue = async () => {
    let queue = await getQueue();
    if (queue.length === 0) return;

    const remainingQueue: QueuedRequest[] = [];
    let stopFlushing = false;

    for (const req of queue) {
      if (stopFlushing) {
        remainingQueue.push(req);
        continue;
      }

      req.attempts += 1;
      if (req.attempts >= 5) {
        // Drop after 5 failed attempts silently
        console.warn(`Dropping request ${req.id} after maximum attempts.`);
        continue;
      }

      try {
        await apiFetch(req.endpoint, {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.payload),
        });
        // Success: do not add to remainingQueue (removed from queue)
      } catch (err: any) {
        const status = err.status || 0;
        const isNetworkError =
          err.message?.includes('Network request failed') ||
          err.message?.includes('Failed to fetch') ||
          err.message?.includes('type error') ||
          status === 0;

        if (isNetworkError || (status >= 500 && status < 600)) {
          // Network or server error: keep in queue, stop flushing subsequent items
          remainingQueue.push(req);
          stopFlushing = true;
        } else {
          // Client error (4xx): remove from queue (never succeeds)
          const errorMsg = err.message || '';
          const isQrExpiry = errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('invalid');
          if (isQrExpiry && req.endpoint.includes('/check-in/qr')) {
            Alert.alert(
              'Check-in Sync Failed',
              'Your QR check-in could not be submitted — the code expired while you were offline. Please ask your lecturer to manually mark you present, or use the session code next time for reliable offline check-in.'
            );
          }
          console.warn(`Dropping request ${req.id} due to client error:`, err.message);
        }
      }
    }

    await saveQueue(remainingQueue);
  };

  const clearStaleQueueItems = async (newSessionId: number) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const queue: QueuedRequest[] = JSON.parse(raw);
      const filtered = queue.filter(item => {
        const payload = item.payload as any;
        return Number(payload.session_id) === Number(newSessionId) || !payload.session_id;
      });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
      setQueueLength(filtered.length);
    } catch (e) {
      console.warn('Failed to clear stale queue items:', e);
    }
  };

  return {
    isOnline,
    queueLength,
    enqueue,
    flushQueue,
    clearQueue,
    clearStaleQueueItems,
  };
}
