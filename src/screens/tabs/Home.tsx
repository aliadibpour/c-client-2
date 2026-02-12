import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Text,
  FlatList,
  StyleSheet,
  View,
  DeviceEventEmitter,
  ActivityIndicator,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../components/tabs/home/MessageItem";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeHeader, { pepe } from "../../components/tabs/home/HomeHeader";
import { Buffer } from "buffer";
import uuid from 'react-native-uuid';
import { fetchWithRetry } from "../../hooks";

// ---- CONFIG (tuned for speed / stability) ----
const BATCH_SIZE = 5;
const MAX_PREFETCH_BATCHES = 1;         // کمتر prefetch تا فشار TD کم شود
const PER_GROUP_CONCURRENCY = 2;        // گروه‌های کوچکتر
const TD_CONCURRENCY = 12;              // افزایش نسبت به قبل برای throughput بهتر
let POLL_INTERVAL_MS = 1000;           // polling کندتر تا صف آرام بماند
const MAX_OPENED_CHATS = 15;
const TD_WARMUP_CALL_TIMEOUT_MS = 7000;

// Persisted recent search cache key and TTL
const RECENT_SEARCH_PERSIST_KEY = 'recent_search_cache_v1';
const RECENT_SEARCH_TTL_MS = 700000 * 80 * 100000000;
const SEARCH_MIN_INTERVAL_MS_MANAGED = 800;
const MAX_SEARCH_CONCURRENCY_MANAGED = 2;

// storage keys
const STORAGE_KEYS = {
  MESSAGE_CACHE: "home_message_cache_v1",
  CHATINFO_CACHE: "home_chatinfo_cache_v1",
};

// batching window for DeviceEventEmitter updates
const BATCH_WINDOW_MS = 80;

// ------------------
// Utility helpers
// ------------------
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function limitConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const results: R[] = [];
  let i = 0;
  const workers: Promise<void>[] = [];
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        const r = await fn(items[idx]);
        results[idx] = r as any;
      } catch (err) {
        results[idx] = null as any;
      }
    }
  }
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function promiseTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('TDLIB_TIMEOUT'));
    }, ms);
    p.then((v) => {
      if (done) return; done = true; clearTimeout(t); resolve(v);
    }).catch((e) => {
      if (done) return; done = true; clearTimeout(t); reject(e);
    });
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [timestamp, setTimestamp] = useState(Math.floor(Date.now() / 1000));

  const [activeTab, setActiveTab] = useState<any>();
  useEffect(() => {
    const a = async () => {
      const teams: any = await AsyncStorage.getItem("teams");
      const parsed = JSON.parse(teams || "null");
      setActiveTab(pepe(parsed?.team1));
    };
    a();
  }, []);

  const [hasNewMessage, setHasNewMessage] = useState<boolean>(false);

  // refs to avoid stale closures
  const activeTabRef = useRef<string | undefined>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const [messages, setMessages] = useState<any[]>([]);
  const messagesRef = useRef<any[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const alreadyViewed = useRef<Set<number>>(new Set());

  // metadata from server
  const datasRef = useRef<{ chatId: string; messageId: string; channel: string }[]>([]);

  // batching/pagination
  const [currentBatchIdx, setCurrentBatchIdx] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // caches
  const messageCacheRef = useRef<Map<string, any>>(new Map());
  const chatInfoRef = useRef<Map<number, any>>(new Map());

  // prefetch
  const prefetchRef = useRef<Map<string, any[]>>(new Map());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());

  // opened chats LRU
  const openedChats = useRef<Map<number, number>>(new Map());
  const openingChatsRef = useRef<Set<number>>(new Set());

  // semaphore queue for TdLib calls
  const tdQueueRef = useRef<(() => void)[]>([]);
  const tdActiveCountRef = useRef<number>(0);

  // polling & timers
  const pollingIntervalRef = useRef<any>(null);
  const persistTimerRef = useRef<any>(null);

  // ------------------
  // tdReady + warmup flags
  // ------------------
  const tdReadyRef = useRef<boolean>(false);
  const tdWarmupInFlightRef = useRef<boolean>(false);

  // message index ref for O(1) lookups (key = `${chatId}:${messageId}`)
  const msgIndexRef = useRef<Map<string, number>>(new Map());

  // batching DeviceEventEmitter queue
  const updateQueueRef = useRef<any[]>([]);
  const updateFlushTimerRef = useRef<number | null>(null);

  // FlatList ref so we can scroll to top after reset
  const listRef = useRef<FlatList<any> | null>(null);

  // Search-related refs (new managed approach)
  const activeTabGenRef = useRef<number>(0);

  // legacy promise map (kept for compatibility but not used as primary)
  const searchPublicChatPromiseRef = useRef<Map<string, Promise<number | null>>>(new Map());

  const STAGGER_BASE_MS = 20;
  const STAGGER_WINDOW_MS = 80;

  const ADAPTIVE_THROTTLE_MS = 1500;
  const ADAPTIVE_STAGGER_MULTIPLIER = 3;
  const ADAPTIVE_CONCURRENCY_REDUCTION = 1;
  const adaptiveThrottleUntilRef = useRef<number>(0);

  // new managed search queue refs
  const searchQueueRef = useRef<Array<() => void>>([]);
  const searchActiveCountRef = useRef(0);
  const searchInFlightPromisesRef = useRef<Map<string, Promise<number | null>>>(new Map());
  const lastSearchAtRef = useRef<number>(0);
  const globalAdaptiveThrottleUntilRef = useRef<number>(0);

  // --- New: search rate-limit
  const searchTimestampsRef = useRef<number[]>([]);
  const searchInFlightRef = useRef<boolean>(false);

  // --- New: recent-search cache
  const RECENT_SEARCH_LIMIT = 110;
  const recentSearchCacheRef = useRef<Map<string, number | null>>(new Map());
  const recentSearchOrderRef = useRef<string[]>([]);

  // persisted recent search cache
  const recentSearchPersistedRef = useRef<Record<string, any> | null>(null);

  // ------------------
  // NEW refs for queue control / back-pressure
  // ------------------
  const loadMoreInFlightRef = useRef(false);
  const queueThrottledRef = useRef(false);
  const tdWaitersRef = useRef<Array<() => void>>([]);

  // thresholds — قابل تنظیم
  const QUEUE_HIGH_WATER = 32;     // وقتی از این عبور کردیم، throttle میکنیم
  const QUEUE_CRITICAL_WATER = 128; // خیلی بزرگ شد: reject یا delay سنگین
  const QUEUE_MAX = 64; // max queued tasks before rejecting non-priority

  // ------------------
  // Smart tdEnqueue (semaphore + queue + back-pressure)
  // ------------------
  const tryStartQueued = useCallback(() => {
    try {
      while (tdActiveCountRef.current < TD_CONCURRENCY && tdQueueRef.current.length) {
        const next = tdQueueRef.current.shift();
        if (!next) break;
        try {
          next(); // run will increment tdActiveCountRef itself
        } catch (e) { console.warn('[tdEnqueue] queued task start failed', e); }
      }
    } catch (e) {
      console.warn('[tdEnqueue] tryStartQueued failed', e);
    }
  }, []);

  const tdEnqueue = useCallback((fn: () => Promise<any>, opts: any = { timeoutMs: TD_WARMUP_CALL_TIMEOUT_MS, priority: false }) => {
    return new Promise<any>((resolve, reject) => {
      const run = async () => {
        // run() increments and executes the fn
        tdActiveCountRef.current += 1;
        try {
          const r = await promiseTimeout(fn(), opts.timeoutMs);
          resolve(r);
        } catch (err) {
          // bubble up
          reject(err);
        } finally {
          tdActiveCountRef.current -= 1;
          // start queued tasks if capacity
          tryStartQueued();
          // notify waiters
          if (tdQueueRef.current.length < QUEUE_HIGH_WATER && tdWaitersRef.current.length) {
            const waiters = tdWaitersRef.current.splice(0, tdWaitersRef.current.length);
            waiters.forEach(w => { try { w(); } catch(e){} });
          }
          if (tdQueueRef.current.length < Math.floor(QUEUE_HIGH_WATER * 0.8)) {
            queueThrottledRef.current = false;
          }
        }
      };

      const qlen = tdQueueRef.current.length;
      // mark throttle state
      if (qlen >= QUEUE_HIGH_WATER && !queueThrottledRef.current) {
        queueThrottledRef.current = true;
        console.warn('[tdEnqueue] queue exceeded high water, enabling throttle qlen=', qlen);
      }

      // critical: reject non-priority producers if queue is enormous
      if (qlen >= QUEUE_MAX && !opts.priority) {
        console.warn('[tdEnqueue] rejecting enqueue because queue is full qlen=', qlen);
        reject(new Error('TDLIB_QUEUE_FULL'));
        return;
      }

      // if capacity now, run immediately
      if (tdActiveCountRef.current < TD_CONCURRENCY && tdQueueRef.current.length === 0) {
        run();
        return;
      }

      // otherwise enqueue (priority to front)
      if (opts.priority) tdQueueRef.current.unshift(run);
      else tdQueueRef.current.push(run);

      console.log('[tdEnqueue] pushed to queue newLen=', tdQueueRef.current.length);
      // try to start queued tasks (in case activeCount decreased between checks)
      setTimeout(tryStartQueued, 0);
    });
  }, [tryStartQueued]);

  const tdCall = useCallback(
    async (method: string, ...args: any[]) => {
      const attemptCall = async (retries = 2): Promise<any> => {
        try {
          const res = await (TdLib as any)[method](...args);
          return res;
        } catch (err) {
          console.warn(`[tdCall] ${method} failed, retries=${retries}`, err);
          if (retries > 0) {
            await delay(150);
            return attemptCall(retries - 1);
          }
          throw err;
        }
      };
      return tdEnqueue(() => attemptCall(), { timeoutMs: TD_WARMUP_CALL_TIMEOUT_MS, priority: false });
    },
    [tdEnqueue]
  );

  // faster variant for user-visible getMessage: shorter timeout and priority
  const tdCallFast = useCallback(
    async (method: string, ...args: any[]) => {
      const attemptCall = async (retries = 1): Promise<any> => {
        try {
          const res = await (TdLib as any)[method](...args);
          return res;
        } catch (err) {
          if (retries > 0) {
            await delay(120);
            return attemptCall(retries - 1);
          }
          throw err;
        }
      };
      // priority true so loadMore gets ahead in queue
      return tdEnqueue(() => attemptCall(), { timeoutMs: 2500, priority: true });
    },
    [tdEnqueue]
  );

  const fetchFeedInitial = useCallback(
    (tab: string, uuid: string, ts: number) => {
      const url =
        `https://cornerlive.ir/feed-message?team=${encodeURIComponent(tab)}&uuid=${encodeURIComponent(uuid)}` +
        `&activeTab=${encodeURIComponent(tab)}&timestamp=${ts.toString()}`;
      return fetchWithRetry(url, { retries: 3, timeout: 8000, backoffBase: 400, fetchOptions: {} });
    }, []);

  const fetchFeedMore = useCallback(
    (tab: string, uuid: string, ts: number) => {
      const url =
        `https://cornerlive.ir/feed-message?team=${encodeURIComponent(tab)}&uuid=${encodeURIComponent(uuid)}` +
        `&activeTab=${encodeURIComponent(tab)}&timestamp=${ts.toString()}`;
      return fetchWithRetry(url, { retries: 2, timeout: 7000, backoffBase: 300, fetchOptions: {} });
    }, []);

  // persist caches (debounced)
  const persistCachesDebounced = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const messagesObj: Record<string, any> = {};
        for (const [k, v] of messageCacheRef.current.entries()) messagesObj[k] = v;
        await AsyncStorage.setItem(STORAGE_KEYS.MESSAGE_CACHE, JSON.stringify(messagesObj));
      } catch (e) { console.warn('[persist] message cache save failed', e); }
      try {
        const chatObj: Record<string, any> = {};
        for (const [k, v] of chatInfoRef.current.entries()) chatObj[String(k)] = v;
        await AsyncStorage.setItem(STORAGE_KEYS.CHATINFO_CACHE, JSON.stringify(chatObj));
      } catch (e) { console.warn('[persist] chatinfo cache save failed', e); }
    }, 800);
  }, []);

  // load persisted caches on mount
  const loadPersistedCaches = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGE_CACHE);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k of Object.keys(o)) messageCacheRef.current.set(k, o[k]);
      }
    } catch (e) { console.warn('[loadPersistedCaches] message cache failed', e); }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHATINFO_CACHE);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k of Object.keys(o)) chatInfoRef.current.set(+k, o[k]);
      }
    } catch (e) { console.warn('[loadPersistedCaches] chatinfo cache failed', e); }

    // load persisted recent-search cache
    try {
      const raw = await AsyncStorage.getItem(RECENT_SEARCH_PERSIST_KEY);
      recentSearchPersistedRef.current = raw ? JSON.parse(raw) : {};
    } catch (e) { recentSearchPersistedRef.current = {}; }
  }, []);

  const mk = (chatId: number | string | undefined, messageId: number | string) => `${chatId ?? "ch"}:${messageId}`;
  const prefetchKey = (tab: string, batchIdx: number) => `${tab}:${batchIdx}`;

  // ===================
  // withUuid / dedupe
  // ===================
  const withUuid = useCallback((msg: any) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.__uuid) return msg;

    if (msg.chatId != null && msg.id != null) {
      const uu = `${msg.chatId}-${msg.id}`;
      return { ...msg, __uuid: uu };
    }
    const uu = String(uuid.v4());
    return { ...msg, __uuid: uu };
  }, []);

  const dedupeByUuid = useCallback((items: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      if (!it.__uuid) {
        if (it.chatId != null && it.id != null) it.__uuid = `${it.chatId}-${it.id}`;
        else it.__uuid = String(uuid.v4());
      }
      if (!seen.has(it.__uuid)) {
        seen.add(it.__uuid);
        out.push(it);
      }
    }
    return out;
  }, []);

  // LRU touch openedChat
  const touchOpenedChat = useCallback((chatId: number) => {
    openedChats.current.delete(chatId);
    openedChats.current.set(chatId, Date.now());
    while (openedChats.current.size > MAX_OPENED_CHATS) {
      const firstKey = openedChats.current.keys().next().value;
      if (firstKey !== undefined) {
        const removing = firstKey;
        openedChats.current.delete(removing);
      } else break;
    }
  }, [tdCall]);

  // get and cache chat info
  const getAndCacheChatInfo = useCallback(
    async (chatId: number) => {
      if (!chatId) return null;
      if (chatInfoRef.current.has(chatId)) return chatInfoRef.current.get(chatId);
      try {
        const res: any = await tdCall("getChat", chatId);
        const chat = JSON.parse(res.raw);
        const info: any = { title: chat.title };
        if (chat.photo?.minithumbnail?.data) {
          try {
            const buffer = Buffer.from(chat.photo.minithumbnail.data);
            info.minithumbnailUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
          } catch (e) {}
        }
        const photo = chat.photo?.small;
        if (photo?.local?.isDownloadingCompleted && photo?.local?.path) info.photoUri = `file://${photo.local.path}`;
        else if (photo?.id) info.fileId = photo.id;
        chatInfoRef.current.set(chatId, info);
        persistCachesDebounced();
        return info;
      } catch (err) {
        console.warn('[getAndCacheChatInfo] failed for', chatId, err);
        return null;
      }
    }, [tdCall, persistCachesDebounced]
  );

  // ensureRepliesForMessages: fetch missing replied messages in parallel up to limited concurrency
  const ensureRepliesForMessages = useCallback(
    async (msgs: any[]) => {
      if (!msgs || msgs.length === 0) return msgs;
      const myGen = activeTabGenRef.current;

      const toFetchMap = new Map<string, { chatId: number | string; messageId: number | string }>();
      for (const m of msgs) {
        const r = m.replyTo || m.replyToMessage || m.reply_to_message || null;
        let rid = r?.id ?? r?.messageId ?? r?.message_id ?? null;
        let chatId = r?.chatId ?? r?.chat?.id ?? r?.chat_id ?? null;
        if (!rid && (m.reply_to_message_id || m.replyToMessageId || m.replyTo?.message_id)) {
          rid = m.reply_to_message_id || m.replyToMessageId || (m.replyTo && m.replyTo.message_id);
        }
        if (!chatId) chatId = m.chatId ?? m.chat?.id ?? null;
        if (!rid || !chatId) continue;
        const key = mk(chatId, rid);
        if (!messageCacheRef.current.has(key) && !toFetchMap.has(key)) {
          toFetchMap.set(key, { chatId, messageId: rid });
        }
      }

      const toFetch = Array.from(toFetchMap.values());
      if (toFetch.length > 0) {
        // keep concurrency modest so we don't saturate TD
        await limitConcurrency(
          toFetch,
          Math.min(4, TD_CONCURRENCY),
          async (t) => {
            try {
              if (myGen !== activeTabGenRef.current) return null;
              const res: any = await tdCall("getMessage", Number(t.chatId), Number(t.messageId));
              if (myGen !== activeTabGenRef.current) return null;
              const parsed = JSON.parse(res.raw);
              const k2 = mk(parsed.chatId ?? t.chatId, parsed.id);
              const stored = withUuid(parsed);
              messageCacheRef.current.set(k2, stored);
              return stored;
            } catch (e) {
              console.warn('[ensureReplies] getMessage failed', e);
              return null;
            }
          }
        );
        persistCachesDebounced();
      }

      const enriched = msgs.map((m) => {
        const r = m.replyTo || m.replyToMessage || m.reply_to_message || null;
        let rid = r?.id ?? r?.messageId ?? r?.message_id ?? null;
        let chatId = r?.chatId ?? r?.chat?.id ?? r?.chat_id ?? null;
        if (!rid && (m.reply_to_message_id || m.replyToMessageId || m.replyTo?.message_id)) {
          rid = m.reply_to_message_id || m.replyToMessageId || (m.replyTo && m.replyTo.message_id);
        }
        if (!chatId) chatId = m.chatId ?? m.chat?.id ?? null;
        if (rid && chatId) {
          const key = mk(chatId, rid);
          const cached = messageCacheRef.current.get(key);
          if (cached) {
            return { ...m, replyToMessage: cached };
          }
        }
        return m;
      });

      return enriched;
    }, [tdCall, persistCachesDebounced, withUuid]
  );

  // ------------------
  // Persisted recent-search cache helpers
  // ------------------
  async function saveRecentSearchCachePersisted(obj: Record<string, any>) {
    try { await AsyncStorage.setItem(RECENT_SEARCH_PERSIST_KEY, JSON.stringify(obj)); } catch (e) { console.warn('[persistSearchCache] failed', e); }
  }

  function normChannelKey(chan: string) {
    return (chan || '').trim().toLowerCase().replace(/^@/, '');
  }

  function getPersistedCachedChannel(chan: string): number | null | undefined {
    const map = recentSearchPersistedRef.current;
    if (!map) return undefined;
    const key = normChannelKey(chan);
    const entry = map[key];
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      delete map[key];
      saveRecentSearchCachePersisted(map).catch(() => {});
      return undefined;
    }
    return entry.value ?? null;
  }
  function setPersistedCachedChannel(chan: string, val: number | null) {
    const map = recentSearchPersistedRef.current || {};
    const key = normChannelKey(chan);
    map[key] = { value: val, expiresAt: Date.now() + RECENT_SEARCH_TTL_MS };
    recentSearchPersistedRef.current = map;
    saveRecentSearchCachePersisted(map).catch(() => {});
  }

  function addToRecentSearch(channel: string, chatId: number | null) {
    try {
      const key = normChannelKey(channel);
      const map = recentSearchCacheRef.current;
      const order = recentSearchOrderRef.current;
      if (map.has(key)) {
        const idx = order.indexOf(key);
        if (idx !== -1) order.splice(idx, 1);
      }
      order.push(key);
      map.set(key, chatId);
      while (order.length > RECENT_SEARCH_LIMIT) {
        const oldest = order.shift();
        if (oldest) map.delete(oldest);
      }
    } catch (e) {}
  }

  // helper to extract retry_after from errors
  function extractRetryAfterSeconds(err: any): number | null {
    try {
      if (!err) return null;
      if (typeof err.retry_after === 'number') return err.retry_after;
      if (typeof err.error_description === 'string') {
        const m = err.error_description.match(/retry_after[:=]\s*(\d+)/i);
        if (m) return Number(m[1]);
      }
      if (typeof err.message === 'string') {
        const m = err.message.match(/(?:FLOOD_WAIT[:_ ]?)(\d+)/i) || err.message.match(/retry_after[:=]\s*(\d+)/i);
        if (m) return Number(m[1]);
      }
      if (typeof err === 'string') {
        const m = err.match(/(?:FLOOD_WAIT[:_ ]?)(\d+)/i) || err.match(/retry_after[:=]\s*(\d+)/i);
        if (m) return Number(m[1]);
      }
    } catch (e) {}
    return null;
  }

  function processSearchQueue() {
    // global throttle from FLOOD_WAIT
    if (Date.now() < globalAdaptiveThrottleUntilRef.current) {
      const wait = Math.max(800, globalAdaptiveThrottleUntilRef.current - Date.now() + 50);
      setTimeout(processSearchQueue, wait);
      return;
    }

    if (searchActiveCountRef.current >= MAX_SEARCH_CONCURRENCY_MANAGED) return;

    const task = searchQueueRef.current.shift();
    if (!task) return;

    searchActiveCountRef.current += 1;

    const now = Date.now();
    const sinceLast = now - lastSearchAtRef.current;
    const gap = Math.max(0, SEARCH_MIN_INTERVAL_MS_MANAGED - sinceLast);

    setTimeout(() => {
      lastSearchAtRef.current = Date.now();
      (async () => {
        try {
          await task();
        } finally {
          searchActiveCountRef.current -= 1;
          setTimeout(processSearchQueue, SEARCH_MIN_INTERVAL_MS_MANAGED);
        }
      })();
    }, gap);
  }

  async function searchPublicChatManaged(channel: string, genAtCall: number): Promise<number | null> {
    const key = normChannelKey(channel);
    if (!key) return null;

    const persisted = getPersistedCachedChannel(key);
    if (persisted !== undefined) return persisted;

    if (recentSearchCacheRef.current.has(key)) return recentSearchCacheRef.current.get(key) ?? null;

    const existing = searchInFlightPromisesRef.current.get(key);
    if (existing) return existing;

    const p = new Promise<number | null>((resolve) => {
      const task = async () => {
        let attempt = 0;
        const MAX_ATTEMPTS = 1;
        while (attempt < MAX_ATTEMPTS) {
          attempt++;
          if (genAtCall !== activeTabGenRef.current) { resolve(null); return; }

          try {
            const res: any = await tdCall('searchPublicChat', key);
            const fid = res?.id || res?.chat?.id || res?.chatId || (typeof res === 'number' ? res : undefined);
            const fidNum = fid ? Number(fid) : null;
            recentSearchCacheRef.current.set(key, fidNum);
            addToRecentSearch(key, fidNum);
            setPersistedCachedChannel(key, fidNum);
            resolve(fidNum);
            return;
          } catch (err: any) {
            const retrySec = extractRetryAfterSeconds(err);
            if (retrySec && retrySec > 0) {
              globalAdaptiveThrottleUntilRef.current = Math.max(globalAdaptiveThrottleUntilRef.current, Date.now() + retrySec * 1000);
              console.warn('[searchPublicChatManaged] observed retry_after, pausing all searches until', new Date(globalAdaptiveThrottleUntilRef.current));
              resolve(null);
              setTimeout(processSearchQueue, (retrySec * 1000) + 50);
              return;
            }
            const backoffMs = Math.min(5000, 200 * Math.pow(2, attempt));
            await delay(backoffMs + Math.floor(Math.random() * 150));
          }
        }

        recentSearchCacheRef.current.set(key, null);
        addToRecentSearch(key, null);
        setPersistedCachedChannel(key, null);
        resolve(null);
      };

      searchInFlightPromisesRef.current.set(key, p);
      searchQueueRef.current.push(task);
      setTimeout(processSearchQueue, 0);
    });

    searchInFlightPromisesRef.current.set(key, p);
    p.then(() => { setTimeout(() => searchInFlightPromisesRef.current.delete(key), 0); }).catch(() => { setTimeout(() => searchInFlightPromisesRef.current.delete(key), 0); });
    return p;
  }

  async function resolveChannelToChatId(channel: string, genAtCall: number): Promise<number | null | undefined> {
    if (!channel) return undefined;
    try {
      const key = normChannelKey(channel);
      const persisted = getPersistedCachedChannel(key);
      if (persisted !== undefined) return persisted;
      if (recentSearchCacheRef.current.has(key)) {
        return recentSearchCacheRef.current.get(key) ?? null;
      }
      const r = await searchPublicChatManaged(channel, genAtCall);
      return r;
    } catch (e) {
      console.warn('[resolveChannelToChatId] failed', e);
      return undefined;
    }
  }

  // ------------------
  // loadBatch (uses resolveChannelToChatId)
  // ------------------
  const loadBatch = useCallback(
    async (batchIdx: number) => {
      const myGen = activeTabGenRef.current;
      const now = Date.now();
      const isThrottled = adaptiveThrottleUntilRef.current > now;
      const effectiveStaggerWindow = isThrottled ? STAGGER_WINDOW_MS * ADAPTIVE_STAGGER_MULTIPLIER : STAGGER_WINDOW_MS;
      const effectivePerGroupConcurrency = isThrottled ? Math.max(1, PER_GROUP_CONCURRENCY - ADAPTIVE_CONCURRENCY_REDUCTION) : PER_GROUP_CONCURRENCY;

      const start = batchIdx * BATCH_SIZE;
      const metas = datasRef.current.slice(start, start + BATCH_SIZE);
      if (!metas.length) return [];

      const results: any[] = [];
      const toFetch: any[] = [];

      for (const m of metas) {
        const key = mk(m.chatId ?? m.channel, m.messageId);
        const cached = messageCacheRef.current.get(key);
        if (cached) results.push(cached);
        else toFetch.push(m);
      }

      if (toFetch.length === 0) return results;

      // Batch-resolve unique channels first to reduce serial calls
      const uniqueChannels = Array.from(new Set(toFetch.filter(t => t.channel).map(t => normChannelKey(t.channel))));
      const channelMap = new Map<string, number | null | undefined>();
      if (uniqueChannels.length) {
        await limitConcurrency(uniqueChannels, Math.min(3, uniqueChannels.length), async (ch) => {
          try {
            const rid = await resolveChannelToChatId(ch, myGen);
            channelMap.set(ch, rid as any);
          } catch (e) { channelMap.set(ch, undefined); }
          return null;
        });
      }

      const groups: Record<string, any[]> = {};
      for (const t of toFetch) {
        const gKey = t.chatId ? `c:${t.chatId}` : `ch:${t.channel}`;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(t);
      }

      for (const gKey of Object.keys(groups)) {
        if (myGen !== activeTabGenRef.current) return [];

        const group = groups[gKey];
        let resolvedChatId: number | undefined;
        const sample = group[0];

        if (sample.channel) {
          try {
            const cachedResolved = channelMap.get(normChannelKey(sample.channel));
            if (typeof cachedResolved === 'number') resolvedChatId = Number(cachedResolved);
          } catch (e) { /* ignore */ }
        }

        if (!resolvedChatId && sample.chatId) resolvedChatId = Number(sample.chatId);

        if (resolvedChatId) {
          try {
            if (!openedChats.current.has(resolvedChatId) && !openingChatsRef.current.has(resolvedChatId)) {
              openingChatsRef.current.add(resolvedChatId);
              try {
                if (myGen !== activeTabGenRef.current) { openingChatsRef.current.delete(resolvedChatId); }
                else {
                  openedChats.current.set(resolvedChatId, Date.now());
                }
              } catch (e) { /* ignore */ } finally { openingChatsRef.current.delete(resolvedChatId); }
            } else {
              touchOpenedChat(resolvedChatId);
            }
          } catch (e) { /* ignore */ }
        }

        const perItemStagger = Math.floor(effectiveStaggerWindow / Math.max(1, group.length));
        group.forEach((g, idx) => { (g as any)._stagger = Math.min(effectiveStaggerWindow, idx * perItemStagger || 0); });

        const fetched = await limitConcurrency(
          group,
          effectivePerGroupConcurrency,
          async (meta) => {
            if (myGen !== activeTabGenRef.current) return null;
            const kk = mk(meta.chatId ?? meta.channel, meta.messageId);
            const c = messageCacheRef.current.get(kk);
            if (c) return c;
            try {
              const s = (meta as any)._stagger || Math.floor(Math.random() * STAGGER_BASE_MS);
              if (s) await delay(s);

              if (myGen !== activeTabGenRef.current) return null;

              let cidToUse = resolvedChatId || (meta.chatId ? Number(meta.chatId) : undefined);
              if (!cidToUse && meta.channel) {
                const pre = channelMap.get(normChannelKey(meta.channel));
                if (typeof pre === 'number') cidToUse = Number(pre);
                else {
                  try {
                    const resolvedPerItem = await resolveChannelToChatId(meta.channel, myGen);
                    if (typeof resolvedPerItem === 'number' && resolvedPerItem) cidToUse = Number(resolvedPerItem);
                  } catch (e) { /* ignore */ }
                }
              }

              if (cidToUse) {
                if (myGen !== activeTabGenRef.current) return null;
                // use fast prioritized call first
                try {
                  const r: any = await tdCallFast('getMessage', Number(cidToUse), Number(meta.messageId));
                  if (myGen !== activeTabGenRef.current) return null;
                  const parsed = JSON.parse(r.raw);
                  const k2 = mk(parsed.chatId || cidToUse, parsed.id);
                  const stored = withUuid(parsed);
                  messageCacheRef.current.set(k2, stored);
                  return stored;
                } catch (fastErr) {
                  // fallback once
                  console.warn('[loadBatch] tdCallFast failed, falling back to tdCall', fastErr);
                  try {
                    const r2: any = await tdCall('getMessage', Number(cidToUse), Number(meta.messageId));
                    if (myGen !== activeTabGenRef.current) return null;
                    const parsed2 = JSON.parse(r2.raw);
                    const k22 = mk(parsed2.chatId || cidToUse, parsed2.id);
                    const stored2 = withUuid(parsed2);
                    messageCacheRef.current.set(k22, stored2);
                    return stored2;
                  } catch (e) {
                    console.warn('[loadBatch] getMessage both fast+fallback failed', e);
                    return null;
                  }
                }
              } else {
                return null;
              }
            } catch (e) { console.warn('[loadBatch group fetch] failed', e); return null; }
          }
        );

        for (const f of fetched) if (f) results.push(f);

        // small delay between groups to avoid spikes
        await delay(20);
      }

      persistCachesDebounced();

      const ordered = metas
        .map((m) => results.find((r) => String(r.id) === String(m.messageId) && (!m.chatId || String(r.chatId) === String(m.chatId))))
        .filter(Boolean);

      return ordered;
    }, [tdCall, touchOpenedChat, persistCachesDebounced, withUuid, tdCallFast]
  );

  // prefetch next batches staggered
  const prefetchNextBatches = useCallback(
    async (fromBatchIdx: number) => {
      const tab = activeTabRef.current || activeTab;
      for (let i = 1; i <= MAX_PREFETCH_BATCHES; i++) {
        const idx = fromBatchIdx + i;
        const key = prefetchKey(tab as string, idx);
        if (prefetchRef.current.has(key) || prefetchInFlightRef.current.has(key)) continue;
        const start = idx * BATCH_SIZE;
        if (start >= datasRef.current.length) break;
        prefetchInFlightRef.current.add(key);

        const myGen = activeTabGenRef.current;
        (async (batchIndex, waitMs, keyLocal, genAtStart) => {
          await delay(waitMs);
          try {
            if (genAtStart !== activeTabGenRef.current) { prefetchInFlightRef.current.delete(keyLocal); return; }
            const msgs = await loadBatch(batchIndex);
            if (genAtStart !== activeTabGenRef.current) { prefetchInFlightRef.current.delete(keyLocal); return; }
            if (msgs && msgs.length) {
              const enriched = await ensureRepliesForMessages(msgs);
              if (genAtStart !== activeTabGenRef.current) { prefetchInFlightRef.current.delete(keyLocal); return; }
              prefetchRef.current.set(keyLocal, enriched);
            }
          } catch (e) { /* ignore */ }
          prefetchInFlightRef.current.delete(keyLocal);
        })(idx, i * 300, key, myGen);
      }
    }, [loadBatch, ensureRepliesForMessages]
  );

  // appendNextBatch uses prefetch if available
  const appendNextBatch = useCallback(
    async (nextBatchIdx: number) => {
      const tab = activeTabRef.current || activeTab;
      const key = prefetchKey(tab as string, nextBatchIdx);
      const pref = prefetchRef.current.get(key);
      let loaded: any[] = [];
      if (pref) {
        const exist = new Set(messagesRef.current.map((m: any) => `${m.chatId}:${m.id}`));
        const toAppend = pref.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
        if (toAppend.length) {
          setMessages((prev) => dedupeByUuid([...prev, ...toAppend.map(withUuid)]));
        }
        prefetchRef.current.delete(key);
        loaded = pref;
      } else {
        const newLoaded = await loadBatch(nextBatchIdx);
        const enriched = await ensureRepliesForMessages(newLoaded);
        const exist = new Set(messagesRef.current.map((m: any) => `${m.chatId}:${m.id}`));
        const toAppend = enriched.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
        if (toAppend.length) {
          setMessages((prev) => dedupeByUuid([...prev, ...toAppend.map(withUuid)]));
        }
        loaded = enriched;
      }

      const chatIds = Array.from(new Set(loaded.map((m) => m.chatId).filter(Boolean)));
      await limitConcurrency(
        chatIds,
        2,
        async (cid) => { await getAndCacheChatInfo(+cid); return null; }
      );

      return loaded.length;
    }, [loadBatch, getAndCacheChatInfo, ensureRepliesForMessages, withUuid, dedupeByUuid]
  );

  const getStoredUserInfo = useCallback(async (): Promise<{ uuid?: string; activeTab?: string }> => {
    try {
      const raw = await AsyncStorage.getItem("userId-corner");
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.uuid) return { uuid: String(parsed.uuid), activeTab: parsed.activeTab ? String(parsed.activeTab) : undefined };
        }
      } catch (e) {}
      const str = raw as string;
      const currentTab = activeTabRef.current;
      if (currentTab && str.endsWith(currentTab)) {
        const uuid = str.slice(0, str.length - currentTab.length);
        return { uuid, activeTab: currentTab };
      }
      return { uuid: str };
    } catch (e) { console.warn('[getStoredUserInfo] failed', e); return {}; }
  }, []);

  // notifyServerBatchReached bookkeeping
  const sentBatchesMapRef = useRef<Map<string, Set<number>>>(new Map());
  function hasSentBatchForTab(tab: string, batchIdx: number) {
    const key = tab || '__GLOBAL__';
    const s = sentBatchesMapRef.current.get(key);
    return !!s && s.has(batchIdx);
  }
  function markSentBatchForTab(tab: string, batchIdx: number) {
    const key = tab || '__GLOBAL__';
    let s = sentBatchesMapRef.current.get(key);
    if (!s) { s = new Set<number>(); sentBatchesMapRef.current.set(key, s); }
    s.add(batchIdx);
  }

  const notifyServerBatchReached = useCallback(async (batchIdx: number, tab?: string) => {
    const currentTab = (typeof tab === 'string' && tab.length > 0) ? tab : (activeTabRef.current || '');
    try {
      if (hasSentBatchForTab(currentTab, batchIdx)) return;
      const start = batchIdx * BATCH_SIZE;
      const metas = datasRef.current.slice(start, start + BATCH_SIZE);
      if (!metas.length) return;
      const ids: string[] = metas.map((m) => `${m.messageId}`);
      const parsed = await getStoredUserInfo();
      if (!parsed?.uuid) return;
      const params = new URLSearchParams();
      params.append("uuid", parsed.uuid);
      ids.forEach((id) => params.append("messageIds", id));
      params.append("activeTab", currentTab);
      await fetch(`https://cornerlive.ir/feed-message/seen-message?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      markSentBatchForTab(currentTab, batchIdx);
    } catch (err) {
      console.warn('[notify] failed', err);
    }

    try {
      if ((Date.now() / 1000) - timestamp < 3 * 60 || batchIdx < 4) return;
      const newMessages = await fetch(`https://cornerlive.ir/feed-message/new-messages?timestamp=${timestamp}&team=${currentTab}`)
      const hasNewMessage = await newMessages.json();
      if (newMessages) setHasNewMessage(hasNewMessage);
    } catch (error) { console.error(error); }
  }, [getStoredUserInfo, timestamp]);

  // Listener to capture first tdlib-update (for debugging)
  useEffect(() => {
    const onFirst = (event: any) => {
      try {
        const update = typeof event.raw === "string" ? JSON.parse(event.raw) : event.raw;
        console.log('[tdlib-update] first update received at', Date.now(), 'updateType=', update?.type || update);
      } catch (e) { console.warn('[tdlib-update] parse failed', e); }
      try { subscription?.remove(); } catch (e) {}
    };
    const subscription = DeviceEventEmitter.addListener('tdlib-update', onFirst);
    return () => subscription.remove();
  }, []);

  // Rebuild msgIndexRef each time messages changes (O(n) but cheap)
  useEffect(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      const key = `${String(m.chatId ?? 'ch')}:${String(m.id ?? m.messageId)}`;
      map.set(key, i);
    }
    msgIndexRef.current = map;
  }, [messages]);

  // ------------------
  // Batched DeviceEventEmitter handler (fast path)
  // ------------------
  const flushUpdateQueue = useCallback(async () => {
    if (!updateQueueRef.current.length) return;
    const items = updateQueueRef.current.splice(0, updateQueueRef.current.length);
    if (updateFlushTimerRef.current) { clearTimeout(updateFlushTimerRef.current); updateFlushTimerRef.current = null; }

    const interactionUpdates: Array<{ chatId?: string | number, messageId: any, interactionInfo: any }> = [];
    const fullMessages: any[] = [];

    for (const ev of items) {
      try {
        const raw = typeof ev.raw === "string" ? JSON.parse(ev.raw) : ev.raw;
        const t = raw?.type || raw?.updateType || null;

        if (t === 'UpdateMessageInteractionInfo' && raw.data) {
          const data = raw.data;
          interactionUpdates.push({ chatId: data.chatId ?? data.chat?.id, messageId: data.messageId ?? data.id, interactionInfo: data.interactionInfo });
          continue;
        }

        if (raw?.message) {
          fullMessages.push(raw.message);
          continue;
        }

        if (t === 'UpdateNewMessage' && raw?.message) {
          fullMessages.push(raw.message);
          continue;
        }
      } catch (e) {
        console.warn('[flushUpdateQueue] parse failed', e);
      }
    }

    if (interactionUpdates.length > 0) {
      setMessages(prev => {
        if (!prev || prev.length === 0) return prev;
        const next = [...prev];
        let changed = false;
        for (const u of interactionUpdates) {
          if (u.chatId != null) {
            const key = `${String(u.chatId)}:${String(u.messageId)}`;
            const idx = msgIndexRef.current.get(key);
            if (idx !== undefined && next[idx]) {
              const existing = next[idx];
              const merged = { ...existing, interactionInfo: { ...existing.interactionInfo, ...u.interactionInfo } };
              next[idx] = merged;
              const cacheKey = mk(u.chatId, u.messageId);
              const cached = messageCacheRef.current.get(cacheKey);
              if (cached) { cached.interactionInfo = merged.interactionInfo; messageCacheRef.current.set(cacheKey, cached); }
              changed = true;
            }
          } else {
            const idx = next.findIndex(m => String(m.id) === String(u.messageId));
            if (idx !== -1) {
              const existing = next[idx];
              const merged = { ...existing, interactionInfo: { ...existing.interactionInfo, ...u.interactionInfo } };
              next[idx] = merged;
              const cacheKey = mk(existing.chatId, existing.id);
              const cached = messageCacheRef.current.get(cacheKey);
              if (cached) { cached.interactionInfo = merged.interactionInfo; messageCacheRef.current.set(cacheKey, cached); }
              changed = true;
            }
          }
        }
        if (changed) {
          persistCachesDebounced();
          return next;
        }
        return prev;
      });
    }

    if (fullMessages.length > 0) {
      setMessages(prev => {
        const next = [...prev];
        let changed = false;
        for (const fm of fullMessages) {
          const chatId = fm.chatId ?? fm.chat?.id;
          const key = `${String(chatId ?? 'ch')}:${String(fm.id)}`;
          const idx = msgIndexRef.current.get(key);
          const stored = withUuid(fm);
          messageCacheRef.current.set(mk(chatId, fm.id), stored);
          if (idx !== undefined) {
            next[idx] = { ...next[idx], ...stored };
            changed = true;
          } else {
            next.unshift(stored);
            changed = true;
          }
        }
        if (changed) {
          persistCachesDebounced();
          return next;
        }
        return prev;
      });
    }
  }, [withUuid, persistCachesDebounced, mk]);

  useEffect(() => {
    const handler = (event: any) => {
      try {
        const t = typeof event.raw === 'string' ? (() => { try { return JSON.parse(event.raw)?.type; } catch { return null; } })() : (event.raw?.type || null);
        if (t && !['UpdateMessageInteractionInfo', 'UpdateMessage', 'UpdateNewMessage'].includes(t)) {
          return;
        }
      } catch (e) { }

      updateQueueRef.current.push(event);
      if (updateFlushTimerRef.current == null) {
        updateFlushTimerRef.current = (setTimeout(() => {
          updateFlushTimerRef.current = null;
          flushUpdateQueue().catch(e => console.warn('[flushUpdateQueue] error', e));
        }, BATCH_WINDOW_MS) as any) as number;
      }
    };

    const sub = DeviceEventEmitter.addListener('tdlib-update', handler);
    return () => {
      try { sub.remove(); } catch (e) {}
      if (updateFlushTimerRef.current) { clearTimeout(updateFlushTimerRef.current); updateFlushTimerRef.current = null; }
      updateQueueRef.current = [];
    };
  }, [flushUpdateQueue]);

  // ------------------
  // INITIAL LOAD
  // ------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadPersistedCaches();
        if (!activeTab) {
          setInitialLoading(false);
          return;
        }

        setInitialLoading(true);
        setInitialError(false);
        const parsed = await getStoredUserInfo();
        const parsedUuid = parsed.uuid;
        if (!parsedUuid) { setInitialLoading(false); return; }
        const serverTab = activeTabRef.current || activeTab;
        const res = await fetchFeedInitial(serverTab as string, parsedUuid, timestamp);
        const datass: { chatId: string; messageId: string; channel: string }[] = await res.json();
        if (!mounted) return;
        const datas = datass.sort((a, b) => +b.messageId - +a.messageId).slice(0, 200);
        datasRef.current = datas;
        prefetchRef.current.clear();
        prefetchInFlightRef.current.clear();
        setMessages([]);
        setCurrentBatchIdx(0);
        const first = await loadBatch(0);
        if (!mounted) return;
        const enrichedFirst = await ensureRepliesForMessages(first);
        if (!mounted) return;
        setMessages(dedupeByUuid(enrichedFirst.map(withUuid)));
        setCurrentBatchIdx(0);
        const chatIds = Array.from(new Set(enrichedFirst.map((m) => m.chatId).filter(Boolean)));
        await limitConcurrency(chatIds, 2, async (cid) => { await getAndCacheChatInfo(+cid); return null; });
        notifyServerBatchReached(0, serverTab).catch(() => { });
        prefetchNextBatches(0);
        setInitialLoading(false);
      } catch (err) {
        console.warn('[initialLoad] failed', err);
        setInitialError(true);
        setInitialLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [activeTab, loadBatch, getAndCacheChatInfo, prefetchNextBatches, loadPersistedCaches, notifyServerBatchReached, ensureRepliesForMessages, withUuid, fetchFeedInitial]);

  // ------------------
  // POLLING VISIBLE (paused during loadMore or heavy queue)
  // ------------------
  const pollVisibleMessages = useCallback(() => {
    if (loadMoreInFlightRef.current) return;
    if (queueThrottledRef.current) return;
    if (!visibleIds.length) return;

    const toUpdate: Array<{ msg: any; id: number }> = [];
    for (const id of visibleIds) {
      // use index map for fast lookup
      const idx = msgIndexRef.current.get(String(id));
      // fallback: scan messagesRef
      const msg = messagesRef.current.find(m => m.id === id) ?? null;
      if (!msg) continue;
      toUpdate.push({ msg, id });
    }

    limitConcurrency(
      toUpdate,
      Math.min(TD_CONCURRENCY, 6),
      async ({ msg, id }) => {
        try {
          // use fast call for visible polling
          const raw: any = await tdCallFast("getMessage", msg.chatId, msg.id);
          const full = JSON.parse(raw.raw);
          const enrichedArray = await ensureRepliesForMessages([full]);
          const enrichedFull = enrichedArray[0] || full;
          const key = mk(full.chatId || msg.chatId, full.id);
          const stored = withUuid(enrichedFull);
          messageCacheRef.current.set(key, stored);
          persistCachesDebounced();
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = withUuid({ ...next[idx], ...stored });
            return dedupeByUuid(next);
          });
        } catch (e:any) { console.warn('[pollVisibleMessages] getMessage failed', e); }
      }
    ).catch(() => {});
  }, [visibleIds, tdCallFast, persistCachesDebounced, ensureRepliesForMessages, withUuid, dedupeByUuid]);

  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (isFocused && visibleIds.length > 0) {
      pollingIntervalRef.current = setInterval(pollVisibleMessages, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isFocused, visibleIds, pollVisibleMessages]);

  // ------------------
  // onViewable changed - batch viewMessages by chat
  // ------------------
  const visibleIdsRef = useRef<number[]>([]);
  const onViewRef = useCallback(
    ({ viewableItems }: any) => {
      if (!viewableItems || viewableItems.length === 0) {
        setVisibleIds([]);
        visibleIdsRef.current = [];
        return;
      }
      const sorted = [...viewableItems].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const ids = sorted.map((vi: any) => vi.item.id);
      setVisibleIds(ids);
      visibleIdsRef.current = ids;

      const chatMap = new Map<number, number[]>();
      for (const vi of sorted) {
        const msg = vi.item;
        if (!msg || !msg.chatId || !msg.id) continue;
        const arr = chatMap.get(msg.chatId) || [];
        arr.push(msg.id);
        chatMap.set(msg.chatId, arr);
      }

    }, [tdCall]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        setVisibleIds([]);
        try { visibleIdsRef.current.forEach((id) => DeviceEventEmitter.emit("pause-video", { messageId: id })); } catch (e) { console.warn('[useFocusEffect] pause-video emit failed', e); }
        visibleIdsRef.current = [];
      };
    }, [])
  );

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  const activeDownloads = useMemo(() => {
    if (!visibleIds.length) return [];
    const centerVisibleIndex = Math.floor(visibleIds.length / 2);
    const currentMessageId = visibleIds[centerVisibleIndex];
    const currentIndex = messages.findIndex((msg) => msg.id === currentMessageId);
    if (currentIndex === -1) return [];
    const selected: number[] = [];
    for (let offset = -2; offset <= 2; offset++) {
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < messages.length) selected.push(messages[idx].id);
    }
    return selected;
  }, [visibleIds, messages]);

  useEffect(() => {
    (async () => {
      const currentChatIds = new Set<number>();
      for (const id of activeDownloads) {
        const msg = messages.find((m) => m.id === id);
        if (!msg || !msg.chatId) continue;
        const chatId = msg.chatId;
        currentChatIds.add(chatId);
        if (!openedChats.current.has(chatId)) {
          // optionally open chat
        } else touchOpenedChat(chatId);
      }
    })();
  }, [activeDownloads, messages, tdCall, touchOpenedChat]);

  // ------------------
  // INTEGRATED FIX: resetAndFetchInitial
  // ------------------
  const resetAndFetchInitial = useCallback(async (opts: { tab?: string } = {}) => {
    const tab = opts.tab ?? (activeTabRef.current || activeTab);
    try {
      prefetchRef.current.clear();
      prefetchInFlightRef.current.clear();
      datasRef.current = [];
      setMessages([]);
      setCurrentBatchIdx(0);
      setVisibleIds([]);
      alreadyViewed.current.clear();
      setHasNewMessage(false);

      try {
        const key = tab || '__GLOBAL__';
        if (sentBatchesMapRef.current.has(key)) sentBatchesMapRef.current.delete(key);
      } catch (e) { console.warn('[reset] clearing sentBatchesMap failed', e); }

      const newTs = Math.floor(Date.now() / 1000);
      setTimestamp(newTs);

      setInitialLoading(true);
      setInitialError(false);

      const parsed = await getStoredUserInfo();
      if (!parsed?.uuid) {
        setInitialLoading(false);
        return;
      }

      const res = await fetchFeedInitial(tab as string, parsed.uuid, newTs);
      const datass: { chatId: string; messageId: string; channel: string }[] = await res.json();
      const datas = Array.isArray(datass) ? datass.sort((a: any, b: any) => +b.messageId - +a.messageId).slice(0, 200) : [];
      datasRef.current = datas;

      const first = await loadBatch(0);
      const enrichedFirst = await ensureRepliesForMessages(first);
      setMessages(dedupeByUuid(enrichedFirst.map(withUuid)));
      setCurrentBatchIdx(0);

      const chatIds = Array.from(new Set(enrichedFirst.map((m) => m.chatId).filter(Boolean)));
      await limitConcurrency(chatIds, 2, async (cid) => { await getAndCacheChatInfo(+cid); return null; });

      notifyServerBatchReached(0, tab).catch(() => {});
      prefetchNextBatches(0);

      try { listRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch (e) { }
    } catch (err) {
      console.warn('[resetAndFetchInitial] failed', err);
      setInitialError(true);
    } finally {
      setInitialLoading(false);
    }
  }, [activeTab, getStoredUserInfo, fetchFeedInitial, loadBatch, ensureRepliesForMessages, withUuid, dedupeByUuid, getAndCacheChatInfo, notifyServerBatchReached, prefetchNextBatches]);

  // ------------------
  // infinite scroll / load more
  // ------------------
  const isLoadingMoreRef = useRef(false);
  const appendAndAdvance = useCallback(
    async (nextBatchIdx: number) => {
      try {
        const tab = activeTabRef.current || activeTab;
        const key = prefetchKey(tab as string, nextBatchIdx);
        const pref = prefetchRef.current.get(key);
        if (pref) {
          const exist = new Set(messagesRef.current.map((m: any) => `${m.chatId}:${m.id}`));
          const toAppend = pref.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
          if (toAppend.length) setMessages((prev) => dedupeByUuid([...prev, ...toAppend.map(withUuid)]));
          prefetchRef.current.delete(key);
        } else {
          await appendNextBatch(nextBatchIdx);
        }
        setCurrentBatchIdx(nextBatchIdx);
        notifyServerBatchReached(nextBatchIdx, tab as string).catch(() => {});
        prefetchNextBatches(nextBatchIdx);
      } catch (err) { console.warn('[appendAndAdvance] failed', err); }
    }, [appendNextBatch, prefetchNextBatches, notifyServerBatchReached]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    loadMoreInFlightRef.current = true; // block polling while loading more
    setLoadingMore(true);
    try {
      if (!datasRef.current || datasRef.current.length === 0) {
        console.log('[loadMore] datasRef empty; performing full refresh via resetAndFetchInitial');
        await resetAndFetchInitial();
        setLoadingMore(false);
        isLoadingMoreRef.current = false;
        loadMoreInFlightRef.current = false;
        return;
      }

      const nextBatchIdx = currentBatchIdx + 1;
      const start = nextBatchIdx * BATCH_SIZE;
      if (start >= datasRef.current.length) {
        const parsed = await getStoredUserInfo();
        if (!parsed?.uuid) {
          setLoadingMore(false);
          isLoadingMoreRef.current = false;
          loadMoreInFlightRef.current = false;
          return;
        }
        const tab = activeTabRef.current || activeTab;
        try {
          const res = await fetchFeedMore(tab as string, parsed.uuid, timestamp);
          const newDatas: { chatId: string; messageId: string; channel: string }[] = await res.json();
          if (!newDatas || newDatas.length === 0) {
            setLoadingMore(false);
            isLoadingMoreRef.current = false;
            loadMoreInFlightRef.current = false;
            return;
          }
          const combined = [...datasRef.current, ...newDatas];
          const unique = combined.filter((d, idx, arr) => arr.findIndex((x) => x.chatId === d.chatId && x.messageId === d.messageId) === idx);
          datasRef.current = unique;
          await appendAndAdvance(nextBatchIdx);
        } catch (err) {
          console.warn('[loadMore] fetch failed', err);
          setLoadingMore(false);
          isLoadingMoreRef.current = false;
          loadMoreInFlightRef.current = false;
          return;
        }
      } else {
        await appendAndAdvance(nextBatchIdx);
      }
    } catch (e) { console.warn('[loadMore] outer failed', e); }
    finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
      loadMoreInFlightRef.current = false;
    }
  }, [currentBatchIdx, appendAndAdvance, getStoredUserInfo, fetchFeedMore, timestamp, resetAndFetchInitial]);

  const onEndReached = useCallback(() => { loadMore(); }, [loadMore]);

  // renderItem (pass chatInfo)
  const renderItem = useCallback(
    ({ item }: any) => {
      if (!item) return null;
      const chatInfo = chatInfoRef.current.get(item.chatId);
      const isVisible = visibleIds.includes(item.id);
      const isActiveDownload = activeDownloads.includes(item.id);
      return <MessageItem data={item} isVisible={isVisible} activeDownload={isActiveDownload} chatInfo={chatInfo} />;
    }, [visibleIds, activeDownloads]
  );

  // header animation preserved
  const DEFAULT_HEADER = 70;
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(DEFAULT_HEADER);
  const translateY = useRef(new Animated.Value(0)).current;
  const lastYRef = useRef(0);
  const isHiddenRef = useRef(false);
  const EXTRA_HIDE = 2;
  const hideHeader = () => {
    if (isHiddenRef.current) return;
    const target = -(measuredHeaderHeight + EXTRA_HIDE);
    Animated.timing(translateY, { toValue: target, duration: 180, useNativeDriver: true }).start(() => { isHiddenRef.current = true; });
  };
  const showHeader = () => {
    if (!isHiddenRef.current) return;
    Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => { isHiddenRef.current = false; });
  };

  // optimized onScroll (cheap throttle using requestAnimationFrame)
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastYRef.current;
    lastYRef.current = y;
    if (Math.abs(delta) < 0.5) return;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      if (Math.abs(delta) >= 40) {
        if (delta > 0) hideHeader(); else showHeader();
      } else {
        if (y <= 5) showHeader();
      }
      if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
    });
  };

  const setActiveTabAndSync = useCallback((tab: string) => {
    activeTabGenRef.current += 1;
    adaptiveThrottleUntilRef.current = Date.now() + ADAPTIVE_THROTTLE_MS;
    console.log('[setActiveTabAndSync] bumped gen & activated adaptive throttle until', adaptiveThrottleUntilRef.current);

    activeTabRef.current = tab;
    setActiveTab(tab);
    prefetchRef.current.clear();
    prefetchInFlightRef.current.clear();
    datasRef.current = [];
    setMessages([]);
    setCurrentBatchIdx(0);
    setVisibleIds([]);
    alreadyViewed.current.clear();
    isLoadingMoreRef.current = false;
    setLoadingMore(false);
    try {
      const key = tab || '__GLOBAL__';
      if (sentBatchesMapRef.current.has(key)) sentBatchesMapRef.current.delete(key);
    } catch (e) { console.warn('[setActiveTabAndSync] clear sent batches failed', e); }
  }, []);

  // ------------------
  // onRefresh now uses resetAndFetchInitial to fully reset state
  // ------------------
  const onRefresh = useCallback(async () => {
    try {
      await resetAndFetchInitial();
    } catch (e) {
      console.warn('[onRefresh] resetAndFetchInitial failed', e);
    }
  }, [resetAndFetchInitial]);

  const handleTryAgain = () => { setInitialError(false); setInitialLoading(true); };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && Math.abs(h - measuredHeaderHeight) > 0.5) {
            setMeasuredHeaderHeight(h);
            translateY.setValue(0);
          }
        }}
        style={[styles.animatedHeader, { transform: [{ translateY }] }]}>
        <View style={{ flex: 1, backgroundColor: "transparent", overflow: "hidden" }} pointerEvents="box-none">
          <HomeHeader activeTab={activeTab} setActiveTab={setActiveTabAndSync} hasNewMessage={hasNewMessage} onRefresh={onRefresh} />
        </View>
      </Animated.View>

      <View style={{ flex: 1 }}>
        {!messages.length ? (
          <ActivityIndicator size="large" color="#ddd" style={{ marginTop: 110 }} />
        ) : (
          <FlatList
            ref={(r:any) => (listRef.current = r)}
            style={{ paddingHorizontal: 6.5 }}
            data={messages}
            keyExtractor={(item, index) => item?.__uuid ?? `${item?.chatId ?? 'ch'}:${String(item?.id ?? item?.messageId ?? index)}`}
            renderItem={renderItem}
            onViewableItemsChanged={onViewRef}
            viewabilityConfig={viewConfigRef.current}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={15}
            contentContainerStyle={{ paddingTop: measuredHeaderHeight + insets.top, paddingBottom: 20 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={<View style={{ justifyContent: "center", alignItems: "center", paddingVertical: 20 }}><ActivityIndicator color="#888" size="small" /></View>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  animatedHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 50,
  },
});
