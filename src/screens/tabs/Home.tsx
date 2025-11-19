// HomeScreen.tsx
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

// ---- CONFIG ----
const BATCH_SIZE = 5;
const MAX_PREFETCH_BATCHES = 2;
const PER_GROUP_CONCURRENCY = 3; // used inside loadBatch for group concurrency
const TD_CONCURRENCY = 6; // global limit for TdLib calls
const POLL_INTERVAL_MS = 3000;
const MAX_OPENED_CHATS = 12; // LRU cap for opened chats

// Warmup config (tune for your app; keep small for best UX)
const TD_WARMUP_ENABLED = true;
const TD_WARMUP_WAIT_MS_BEFORE_FETCH = 2000; // wait up to this ms for warmup before doing initial network fetch
const TD_WARMUP_CALL_TIMEOUT_MS = 7000; // tdCall timeout used by default

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
  const messageCacheRef = useRef<Map<string, any>>(new Map()); // key: `${chatId}:${messageId}`
  const chatInfoRef = useRef<Map<number, any>>(new Map());

  // prefetch
  const prefetchRef = useRef<Map<string, any[]>>(new Map());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());

  // opened chats LRU
  const openedChats = useRef<Map<number, number>>(new Map()); // chatId -> lastTouchedTimestamp
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

  // *** NEW: FlatList ref so we can scroll to top after reset
  const listRef = useRef<FlatList<any> | null>(null);

  // ------------------
  // New: generation + search promise-cache + stagger config (burst control)
  // ------------------
  const activeTabGenRef = useRef<number>(0); // bump on tab change to cancel older in-flight work
  const searchPublicChatPromiseRef = useRef<Map<string, Promise<number | null>>>(new Map());
  const STAGGER_BASE_MS = 30;
  const STAGGER_WINDOW_MS = 120;

  // ------------------
  // Stable tdEnqueue + tdCall with extra logging
  // ------------------
  const tdEnqueue = useCallback((fn: () => Promise<any>, opts = { timeoutMs: TD_WARMUP_CALL_TIMEOUT_MS }) => {
    return new Promise<any>((resolve, reject) => {
      const run = async () => {
        tdActiveCountRef.current += 1;
        //console.log(`[tdEnqueue] start active=${tdActiveCountRef.current} queueLen=${tdQueueRef.current.length} timeoutMs=${opts.timeoutMs}`);
        try {
          const r = await promiseTimeout(fn(), opts.timeoutMs);
          //console.log('[tdEnqueue] resolved, active now=', tdActiveCountRef.current);
          resolve(r);
        } catch (err) {
          console.warn('[tdEnqueue] error', err);
          reject(err);
        } finally {
          tdActiveCountRef.current -= 1;
          const next = tdQueueRef.current.shift();
          if (next) {
            try { next(); } catch (e) { console.warn('[tdEnqueue] next() failed', e); }
          }
          //console.log('[tdEnqueue] done active=', tdActiveCountRef.current, 'queueLen=', tdQueueRef.current.length);
        }
      };

      if (tdActiveCountRef.current < TD_CONCURRENCY) run();
      else {
        tdQueueRef.current.push(run);
        console.log('[tdEnqueue] pushed to queue newLen=', tdQueueRef.current.length);
      }
    });
  }, []);

  const tdCall = useCallback(
    async (method: string, ...args: any[]) => {
      const attemptCall = async (retries = 2): Promise<any> => {
        try {
          //console.log(`[tdCall] calling ${method} args=${JSON.stringify(args)} retriesLeft=${retries}`);
          const res = await (TdLib as any)[method](...args);
          //console.log(`[tdCall] ${method} succeeded`);
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
      return tdEnqueue(() => attemptCall(), { timeoutMs: TD_WARMUP_CALL_TIMEOUT_MS });
    },
    [tdEnqueue]
  );

  // ------------------
  // fetch helpers
  // ------------------
  async function fetchWithRetry(url: string, opts: any = {}) {
    const {
      retries = 2,
      timeout = 8000,
      backoffBase = 300,
      fetchOptions = {},
      acceptNonOk = false,
    } = opts;

    let attempt = 0;
    while (true) {
      attempt++;
      const controller = new AbortController();
      const signal = controller.signal;
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(url, { signal, ...fetchOptions });
        clearTimeout(timer);

        if (!res.ok && !acceptNonOk) {
          const text = await res.text().catch(() => null);
          const err: any = new Error(`HTTP ${res.status} ${res.statusText}${text ? " - " + text : ""}`);
          err.status = res.status;
          throw err;
        }

        return res;
      } catch (err: any) {
        clearTimeout(timer);
        if (attempt > retries) {
          throw err;
        }
        const backoff = backoffBase * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 200);
        await delay(backoff + jitter);
      }
    }
  }

  const fetchFeedInitial = useCallback(
    (tab: string, uuid: string, ts: number) => {
      const url =
        `https://cornerlive.ir:9000/feed-message?team=${encodeURIComponent(tab)}&uuid=${encodeURIComponent(uuid)}` +
        `&activeTab=${encodeURIComponent(tab)}&timestamp=${ts.toString()}`;
      return fetchWithRetry(url, { retries: 3, timeout: 8000, backoffBase: 400, fetchOptions: {} });
    }, []);

  const fetchFeedMore = useCallback(
    (tab: string, uuid: string, ts: number) => {
      const url =
        `https://cornerlive.ir:9000/feed-message?team=${encodeURIComponent(tab)}&uuid=${encodeURIComponent(uuid)}` +
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
  }, []);

  const mk = (chatId: number | string | undefined, messageId: number | string) => `${chatId ?? "ch"}:${messageId}`;
  const prefetchKey = (tab: string, batchIdx: number) => `${tab}:${batchIdx}`;

  // ===================
  // withUuid / dedupe
  // ===================
  const withUuid = useCallback((msg: any) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.__uuid) return msg;

    // DO NOT coerce IDs to Number here — keep strings to avoid precision loss.
    // If numeric conversion is required for tdCall, convert at call-site only.

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
        // close in background with tdEnqueue to avoid blocking
        tdCall("closeChat", removing).catch((e: any) => console.warn('[touchOpenedChat] closeChat failed', e));
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

  // ensureRepliesForMessages: fetch missing replied messages in parallel up to TD_CONCURRENCY
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
        await limitConcurrency(
          toFetch,
          TD_CONCURRENCY,
          async (t) => {
            try {
              // generation check: abort if tab changed
              if (myGen !== activeTabGenRef.current) return null;
              // convert to Number only here where tdCall expects a number
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
  // New helper: resolveChannelToChatId with in-flight promise cache (prevent duplicate searchPublicChat)
  // ------------------
  async function resolveChannelToChatId(channel: string, genAtCall: number): Promise<number | null> {
    if (!channel) return null;
    const existing = searchPublicChatPromiseRef.current.get(channel);
    if (existing) return existing;
    const p = (async () => {
      try {
        if (genAtCall !== activeTabGenRef.current) return null;
        const r: any = await tdCall('searchPublicChat', channel).catch(() => null);
        if (genAtCall !== activeTabGenRef.current) return null;
        const fid = r?.id || r?.chat?.id || r?.chatId || (typeof r === 'number' ? r : undefined);
        return fid ? Number(fid) : null;
      } finally {
        setTimeout(() => { searchPublicChatPromiseRef.current.delete(channel); }, 0);
      }
    })();
    searchPublicChatPromiseRef.current.set(channel, p);
    return p;
  }

  // loadBatch improved: try to resolve chat ids in parallel per group and reuse
  const loadBatch = useCallback(
    async (batchIdx: number) => {
      const myGen = activeTabGenRef.current;
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

      const groups: Record<string, any[]> = {};
      for (const t of toFetch) {
        const gKey = t.chatId ? `c:${t.chatId}` : `ch:${t.channel}`;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(t);
      }

      for (const gKey of Object.keys(groups)) {
        // abort early if tab changed
        if (myGen !== activeTabGenRef.current) return [];

        const group = groups[gKey];
        let resolvedChatId: number | undefined;
        const sample = group[0];

        // attempt to resolve chat id once per group (non-blocking if fails)
        if (sample.channel) {
          try {
            const r: any = await resolveChannelToChatId(sample.channel, myGen);
            if (myGen !== activeTabGenRef.current) return [];
            if (r) resolvedChatId = Number(r);
          } catch (e) { /* ignore - continue */ }
        }
        if (!resolvedChatId && sample.chatId) resolvedChatId = Number(sample.chatId);

        if (resolvedChatId) {
          try {
            if (!openedChats.current.has(resolvedChatId) && !openingChatsRef.current.has(resolvedChatId)) {
              openingChatsRef.current.add(resolvedChatId);
              try {
                if (myGen !== activeTabGenRef.current) { openingChatsRef.current.delete(resolvedChatId); }
                else {
                  await tdCall('openChat', resolvedChatId);
                  openedChats.current.set(resolvedChatId, Date.now());
                }
              } catch (e) { /* ignore */ } finally { openingChatsRef.current.delete(resolvedChatId); }
            } else {
              touchOpenedChat(resolvedChatId);
            }
          } catch (e) { /* ignore */ }
        }

        // prepare stagger for this group
        const perItemStagger = Math.floor(STAGGER_WINDOW_MS / Math.max(1, group.length));
        group.forEach((g, idx) => { (g as any)._stagger = Math.min(STAGGER_WINDOW_MS, idx * perItemStagger || 0); });

        const fetched = await limitConcurrency(
          group,
          PER_GROUP_CONCURRENCY,
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
                try {
                  const r2: any = await resolveChannelToChatId(meta.channel, myGen);
                  if (myGen !== activeTabGenRef.current) return null;
                  if (r2) cidToUse = Number(r2);
                } catch (e) { /* ignore */ }
              }

              if (cidToUse) {
                if (myGen !== activeTabGenRef.current) return null;
                const r: any = await tdCall('getMessage', Number(cidToUse), Number(meta.messageId));
                if (myGen !== activeTabGenRef.current) return null;
                const parsed = JSON.parse(r.raw);
                const k2 = mk(parsed.chatId || cidToUse, parsed.id);
                const stored = withUuid(parsed);
                messageCacheRef.current.set(k2, stored);
                return stored;
              } else {
                return null;
              }
            } catch (e) { console.warn('[loadBatch group fetch] failed', e); return null; }
          }
        );

        for (const f of fetched) if (f) results.push(f);

        // small yield
        await delay(0);
      }

      persistCachesDebounced();

      const ordered = metas
        .map((m) => results.find((r) => String(r.id) === String(m.messageId) && (!m.chatId || String(r.chatId) === String(m.chatId))))
        .filter(Boolean);

      return ordered;
    }, [tdCall, touchOpenedChat, persistCachesDebounced, withUuid]
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

        // capture generation for this prefetch
        const myGen = activeTabGenRef.current;
        (async (batchIndex, waitMs, keyLocal, genAtStart) => {
          await delay(waitMs);
          try {
            // abort if tab changed during wait
            if (genAtStart !== activeTabGenRef.current) { prefetchInFlightRef.current.delete(keyLocal); return; }
            const msgs = await loadBatch(batchIndex);
            // abort if tab changed after load
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
      await fetch(`https://cornerlive.ir:9000/feed-message/seen-message?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      markSentBatchForTab(currentTab, batchIdx);
    } catch (err) {
      console.warn('[notify] failed', err);
    }

    try {
      if ((Date.now() / 1000) - timestamp < 3 * 60 || batchIdx < 4) return;
      const newMessages = await fetch(`https://cornerlive.ir:9000/feed-message/new-messages?timestamp=${timestamp}&team=${currentTab}`)
      const hasNewMessage = await newMessages.json();
      if (newMessages) setHasNewMessage(hasNewMessage);
    } catch (error) { console.error(error); }
  }, [getStoredUserInfo, timestamp]);

  // ------------------
  // TDLib warmup
  // ------------------
  async function tryTdWarmup() {
    if (!TD_WARMUP_ENABLED) return false;
    if (tdWarmupInFlightRef.current) return tdReadyRef.current;
    tdWarmupInFlightRef.current = true;
    try {
      console.log('[td-warmup] starting warmup');
      // Try a few lightweight methods in order; any success => mark ready
      try {
        const r = await tdCall('getMe').catch(() => null);
        if (r) { console.log('[td-warmup] getMe ok'); tdReadyRef.current = true; return true; }
      } catch (e) { console.warn('[td-warmup] getMe threw', e); }
      try {
        const r = await tdCall('getAuthorizationState').catch(() => null);
        if (r) { console.log('[td-warmup] getAuthorizationState ok'); tdReadyRef.current = true; return true; }
      } catch (e) { console.warn('[td-warmup] getAuthorizationState threw', e); }
      try {
        const r = await tdCall('getChats', 0, 1).catch(() => null);
        if (r) { console.log('[td-warmup] getChats ok'); tdReadyRef.current = true; return true; }
      } catch (e) { console.warn('[td-warmup] getChats threw', e); }
      console.warn('[td-warmup] warmup calls did not succeed (yet)');
      return false;
    } finally {
      tdWarmupInFlightRef.current = false;
    }
  }

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

        // Some TD updates may be UpdateNewMessage style with message payload at root
        if (t === 'UpdateNewMessage' && raw?.message) {
          fullMessages.push(raw.message);
          continue;
        }

        // ignore other update types (cheap filter)
      } catch (e) {
        console.warn('[flushUpdateQueue] parse failed', e);
      }
    }

    // Apply interaction updates: minimal in-place merges
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

    // Apply full messages (merge or prepend)
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
            next.unshift(stored); // newest-first assumed
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

    // telemetry: how many flushed
    console.log(`[td-flush] flushed items=${items.length} interactions=${interactionUpdates.length} fullMsgs=${fullMessages.length}`);
  }, [withUuid, persistCachesDebounced, mk]);

  useEffect(() => {
    const handler = (event: any) => {
      // cheap filter to avoid JSON.parse work if not needed
      try {
        const t = typeof event.raw === 'string' ? (() => { try { return JSON.parse(event.raw)?.type; } catch { return null; } })() : (event.raw?.type || null);
        if (t && !['UpdateMessageInteractionInfo', 'UpdateMessage', 'UpdateNewMessage'].includes(t)) {
          // ignore unrelated updates right away
          return;
        }
      } catch (e) { /* ignore parse error and push through */ }

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
  // INITIAL LOAD (with wait for td warmup up to TD_WARMUP_WAIT_MS_BEFORE_FETCH)
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

        // Kick off warmup in background and also wait a short bounded time for it
        const warmupPromise = tryTdWarmup();
        if (TD_WARMUP_ENABLED) {
          // wait up to configured ms for warmup to succeed
          const timed = Promise.race([
            warmupPromise,
            new Promise((res) => setTimeout(() => res(false), TD_WARMUP_WAIT_MS_BEFORE_FETCH)),
          ]);
          const ok = await timed;
          console.log('[initialLoad] tdWarmup ok=', ok);
          // We DO NOT block longer than the configured wait — to preserve UX/perf.
        } else {
          console.log('[initialLoad] tdWarmup disabled');
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
  // POLLING VISIBLE
  // ------------------
  const pollVisibleMessages = useCallback(() => {
    if (!visibleIds.length) return;

    const toUpdate: Array<{ msg: any; id: number }> = [];
    for (const id of visibleIds) {
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) continue;
      toUpdate.push({ msg, id });
    }

    limitConcurrency(
      toUpdate,
      TD_CONCURRENCY,
      async ({ msg, id }) => {
        try {
          const raw: any = await tdCall("getMessage", msg.chatId, msg.id);
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
  }, [visibleIds, tdCall, persistCachesDebounced, ensureRepliesForMessages, withUuid, dedupeByUuid]);

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

      // group view messages by chat and call viewMessages once per chat
      const chatMap = new Map<number, number[]>();
      for (const vi of sorted) {
        const msg = vi.item;
        if (!msg || !msg.chatId || !msg.id) continue;
        const arr = chatMap.get(msg.chatId) || [];
        arr.push(msg.id);
        chatMap.set(msg.chatId, arr);
      }

      for (const [chatId, idsArr] of chatMap.entries()) {
        if (!alreadyViewed.current.has(idsArr[0])) { // cheap guard: mark by first id only
          tdCall("viewMessages", chatId, idsArr, false)
            .then(() => idsArr.forEach((i) => alreadyViewed.current.add(i)))
            .catch((e:any) => console.warn('[onViewRef] viewMessages failed', e));
        }
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

  // activeDownloads selection unchanged but optimized
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
          try { await tdCall("openChat", chatId); openedChats.current.set(chatId, Date.now()); } catch (e:any) { console.warn('[activeDownloads] openChat failed', e); }
        } else touchOpenedChat(chatId);
        tdCall("viewMessages", chatId, [msg.id], false).catch((e:any) => console.warn('[activeDownloads] viewMessages failed', e));
      }
    })();
  }, [activeDownloads, messages, tdCall, touchOpenedChat]);

  // ------------------
  // INTEGRATED FIX: resetAndFetchInitial
  // ------------------
  const resetAndFetchInitial = useCallback(async (opts: { tab?: string } = {}) => {
    const tab = opts.tab ?? (activeTabRef.current || activeTab);
    try {
      // clear UI/state/prefetch caches
      prefetchRef.current.clear();
      prefetchInFlightRef.current.clear();
      datasRef.current = [];
      setMessages([]);
      setCurrentBatchIdx(0);
      setVisibleIds([]);
      alreadyViewed.current.clear();
      setHasNewMessage(false);

      // clear sent-batches bookkeeping for this tab so notifyServerBatchReached will run
      try {
        const key = tab || '__GLOBAL__';
        if (sentBatchesMapRef.current.has(key)) sentBatchesMapRef.current.delete(key);
      } catch (e) { console.warn('[reset] clearing sentBatchesMap failed', e); }

      // update timestamp used for server queries
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

      // load first batch & populate messages
      const first = await loadBatch(0);
      const enrichedFirst = await ensureRepliesForMessages(first);
      setMessages(dedupeByUuid(enrichedFirst.map(withUuid)));
      setCurrentBatchIdx(0);

      // prime chat infos
      const chatIds = Array.from(new Set(enrichedFirst.map((m) => m.chatId).filter(Boolean)));
      await limitConcurrency(chatIds, 2, async (cid) => { await getAndCacheChatInfo(+cid); return null; });

      // notify server & prefetch next
      notifyServerBatchReached(0, tab).catch(() => {});
      prefetchNextBatches(0);

      // optional: scroll to top so user sees newest messages
      try { listRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch (e) { /* ignore */ }
    } catch (err) {
      console.warn('[resetAndFetchInitial] failed', err);
      setInitialError(true);
    } finally {
      setInitialLoading(false);
    }
  }, [activeTab, getStoredUserInfo, fetchFeedInitial, loadBatch, ensureRepliesForMessages, withUuid, dedupeByUuid, getAndCacheChatInfo, notifyServerBatchReached, prefetchNextBatches]);

  // ------------------
  // infinite scroll / load more
  // - small defensive change: if datasRef is empty, trigger a fresh reset fetch
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
    setLoadingMore(true);
    try {
      // Defensive: if we have no datas metadata, perform a full reset/fetch so loadMore can continue later
      if (!datasRef.current || datasRef.current.length === 0) {
        console.log('[loadMore] datasRef empty; performing full refresh via resetAndFetchInitial');
        await resetAndFetchInitial();
        setLoadingMore(false);
        isLoadingMoreRef.current = false;
        return;
      }

      const nextBatchIdx = currentBatchIdx + 1;
      const start = nextBatchIdx * BATCH_SIZE;
      if (start >= datasRef.current.length) {
        const parsed = await getStoredUserInfo();
        if (!parsed?.uuid) {
          setLoadingMore(false);
          isLoadingMoreRef.current = false;
          return;
        }
        const tab = activeTabRef.current || activeTab;
        try {
          const res = await fetchFeedMore(tab as string, parsed.uuid, timestamp);
          const newDatas: { chatId: string; messageId: string; channel: string }[] = await res.json();
          if (!newDatas || newDatas.length === 0) {
            setLoadingMore(false);
            isLoadingMoreRef.current = false;
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
          return;
        }
      } else {
        await appendAndAdvance(nextBatchIdx);
      }
    } catch (e) { console.warn('[loadMore] outer failed', e); }
    finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [currentBatchIdx, appendAndAdvance, getStoredUserInfo, fetchFeedMore, timestamp, resetAndFetchInitial]);

  const onEndReached = useCallback(() => { loadMore(); }, [loadMore]);

  // cleanup openedChats on blur/unmount
  useFocusEffect(
    useCallback(() => {
      return () => {
        const promises = Array.from(openedChats.current.keys()).map((chatId) => tdCall("closeChat", chatId).catch((e:any) => console.warn('[cleanup] closeChat failed', e)));
        Promise.all(promises).then(() => openedChats.current.clear());
      };
    }, [tdCall])
  );

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
    if (scrollRafRef.current) return; // drop intermediate frames
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
    // bump generation so in-flight work for previous tab aborts quickly
    activeTabGenRef.current += 1;

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
        style={[styles.animatedHeader, { transform: [{ translateY }] }]}
      >
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
            style={{ paddingHorizontal: 12.5 }}
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
  animatedHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 999, elevation: 50 },
});
