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

// ---- CONFIG ----
const BATCH_SIZE = 5;
const MAX_PREFETCH_BATCHES = 2;
const PER_GROUP_CONCURRENCY = 3; // used inside loadBatch for group concurrency
const TD_CONCURRENCY = 6; // global limit for TdLib calls
const POLL_INTERVAL_MS = 3000;
const MAX_OPENED_CHATS = 12; // LRU cap for opened chats

// storage keys
const STORAGE_KEYS = {
  MESSAGE_CACHE: "home_message_cache_v1",
  CHATINFO_CACHE: "home_chatinfo_cache_v1",
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [activeTab, setActiveTab] = useState(pepe("برای شما"));
  // keep a ref to always read latest activeTab from callbacks/closures
  const activeTabRef = useRef<string>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const [messages, setMessages] = useState<any[]>([]);
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
  const messageCacheRef = useRef<Map<string, any>>(new Map()); // key: `${chatId}:${messageId}` or `${channel}:${messageId}`
  const chatInfoRef = useRef<Map<number, any>>(new Map());

  // prefetch
  const prefetchRef = useRef<Map<number, any[]>>(new Map());
  const prefetchInFlightRef = useRef<Set<number>>(new Set());

  // opened chats LRU (Map maintains insertion order)
  const openedChats = useRef<Map<number, number>>(new Map()); // chatId -> lastTouchedTimestamp

  // semaphore queue for TdLib calls
  const tdQueueRef = useRef<(() => void)[]>([]);
  const tdActiveCountRef = useRef<number>(0);

  // polling interval lifecycle
  const pollingIntervalRef = useRef<any>(null);
  const persistTimerRef = useRef<any>(null);

  // ---------- utilities ----------
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // simple concurrency helper for arrays (used to limit concurrency when mapping arrays)
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

  // tdEnqueue: run function through semaphore
  const tdEnqueue = useCallback((fn: () => Promise<any>) => {
    return new Promise<any>((resolve, reject) => {
      const run = async () => {
        tdActiveCountRef.current += 1;
        try {
          const r = await fn();
          resolve(r);
        } catch (err) {
          reject(err);
        } finally {
          tdActiveCountRef.current -= 1;
          const next = tdQueueRef.current.shift();
          if (next) next();
        }
      };

      if (tdActiveCountRef.current < TD_CONCURRENCY) run();
      else tdQueueRef.current.push(run);
    });
  }, []);

  // TdLib call wrapper with retries via semaphore
  const tdCall = useCallback(
    async (method: string, ...args: any[]) => {
      const attemptCall = async (retries = 2): Promise<any> => {
        try {
          return await (TdLib as any)[method](...args);
        } catch (err) {
          if (retries > 0) {
            await delay(150);
            return attemptCall(retries - 1);
          }
          throw err;
        }
      };
      return tdEnqueue(() => attemptCall());
    },
    [tdEnqueue]
  );

  // persist caches (debounced)
  const persistCachesDebounced = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const messagesObj: Record<string, any> = {};
        for (const [k, v] of messageCacheRef.current.entries()) messagesObj[k] = v;
        await AsyncStorage.setItem(STORAGE_KEYS.MESSAGE_CACHE, JSON.stringify(messagesObj));
      } catch (e) {}
      try {
        const chatObj: Record<string, any> = {};
        for (const [k, v] of chatInfoRef.current.entries()) chatObj[String(k)] = v;
        await AsyncStorage.setItem(STORAGE_KEYS.CHATINFO_CACHE, JSON.stringify(chatObj));
      } catch (e) {}
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
    } catch (e) {}
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHATINFO_CACHE);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k of Object.keys(o)) chatInfoRef.current.set(+k, o[k]);
      }
    } catch (e) {}
  }, []);

  // helper: message key
  const mk = (chatId: number | string | undefined, messageId: number | string) => `${chatId ?? "ch"}:${messageId}`;

  // LRU touch openedChat
  const touchOpenedChat = useCallback((chatId: number) => {
    openedChats.current.delete(chatId);
    openedChats.current.set(chatId, Date.now());
    // evict if over cap
    while (openedChats.current.size > MAX_OPENED_CHATS) {
      const firstKey = openedChats.current.keys().next().value;
      if (firstKey !== undefined) {
        const removing = firstKey;
        // best-effort close
        tdCall("closeChat", removing).catch(() => {});
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
        else if (photo?.id) info.fileId = photo.id; // MessageHeader can trigger download if wants
        chatInfoRef.current.set(chatId, info);
        persistCachesDebounced();
        return info;
      } catch (err) {
        return null;
      }
    },
    [tdCall, persistCachesDebounced]
  );

  // -----------------------------
  // ensureRepliesForMessages
  // find reply targets for given messages, fetch missing ones (cached), and return enriched array
  // -----------------------------
  const ensureRepliesForMessages = useCallback(
    async (msgs: any[]) => {
      if (!msgs || msgs.length === 0) return msgs;
      // collect unique reply targets
      const toFetchMap = new Map<string, { chatId: number | string; messageId: number | string }>();
      for (const m of msgs) {
        // Detect possible reply metadata shapes:
        // m.replyTo / m.replyToMessage / m.reply_to_message (normalized)
        // sometimes the message contains reply_to_message_id or reply_to.message_id
        const r = m.replyTo || m.replyToMessage || m.reply_to_message || null;
        let rid = r?.id ?? r?.messageId ?? r?.message_id ?? null;
        let chatId = r?.chatId ?? r?.chat?.id ?? r?.chat_id ?? null;

        // fallback: TDLib sometimes stores reply_to_message_id on the parent message
        if (!rid && (m.reply_to_message_id || m.replyToMessageId || m.replyTo?.message_id)) {
          rid = m.reply_to_message_id || m.replyToMessageId || (m.replyTo && m.replyTo.message_id);
        }

        // If chatId missing, use message's chatId (most replies are within same chat)
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
              const res: any = await tdCall("getMessage", Number(t.chatId), Number(t.messageId));
              const parsed = JSON.parse(res.raw);
              const k2 = mk(parsed.chatId ?? t.chatId, parsed.id);
              // store parsed into cache
              messageCacheRef.current.set(k2, parsed);
              return parsed;
            } catch (e) {
              // ignore per-message errors
              return null;
            }
          }
        );
        persistCachesDebounced();
      }

      // now enrich original msgs with replyToMessage if available in cache
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
            // attach in a consistent property
            return { ...m, replyToMessage: cached };
          }
        }
        return m;
      });

      return enriched;
    },
    [tdCall, persistCachesDebounced]
  );

  // loadBatch: group by chat to reduce openChat churn
  const loadBatch = useCallback(
    async (batchIdx: number) => {
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

      // group toFetch by chat/channel
      const groups: Record<string, any[]> = {};
      for (const t of toFetch) {
        const gKey = t.chatId ? `c:${t.chatId}` : `ch:${t.channel}`;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(t);
      }

      for (const gKey of Object.keys(groups)) {
        const group = groups[gKey];
        // ensure open chat once per group (best-effort)
        let resolvedChatId: number | undefined;
        const sample = group[0];
        if (sample.chatId) {
          resolvedChatId = +sample.chatId;
          try {
            if (!openedChats.current.has(resolvedChatId)) {
              await tdCall("openChat", resolvedChatId);
              openedChats.current.set(resolvedChatId, Date.now());
            } else touchOpenedChat(resolvedChatId);
          } catch (e) {}
        } else if (sample.channel) {
          try {
            const r: any = await tdCall("searchPublicChat", sample.channel);
            const fid = r?.id || r?.chat?.id || r?.chatId || +r;
            if (fid) {
              resolvedChatId = fid;
              if (!openedChats.current.has(fid)) {
                await tdCall("openChat", fid);
                openedChats.current.set(fid, Date.now());
              } else touchOpenedChat(fid);
            }
          } catch (e) {}
        }

        const fetched = await limitConcurrency(
          group,
          PER_GROUP_CONCURRENCY,
          async (meta) => {
            const kk = mk(meta.chatId ?? meta.channel, meta.messageId);
            const c = messageCacheRef.current.get(kk);
            if (c) return c;
            try {
              const cidToUse = resolvedChatId || (meta.chatId ? +meta.chatId : undefined);
              if (cidToUse) {
                const r: any = await tdCall("getMessage", +cidToUse, +meta.messageId);
                const parsed = JSON.parse(r.raw);
                const k2 = mk(parsed.chatId || cidToUse, parsed.id);
                messageCacheRef.current.set(k2, parsed);
                return parsed;
              } else {
                // fallback: search per-meta
                const r: any = await tdCall("searchPublicChat", meta.channel);
                const fid = r?.id || r?.chat?.id || r?.chatId || +r;
                if (fid) {
                  if (!openedChats.current.has(fid)) {
                    await tdCall("openChat", fid);
                    openedChats.current.set(fid, Date.now());
                  } else touchOpenedChat(fid);
                  const rr: any = await tdCall("getMessage", fid, +meta.messageId);
                  const parsed = JSON.parse(rr.raw);
                  const k2 = mk(parsed.chatId || fid, parsed.id);
                  messageCacheRef.current.set(k2, parsed);
                  return parsed;
                }
                return null;
              }
            } catch (e) {
              return null;
            }
          }
        );

        for (const f of fetched) if (f) results.push(f);
      }

      persistCachesDebounced();

      // order results in same order as metas
      const ordered = metas
        .map((m) => results.find((r) => String(r.id) === String(m.messageId) && (!m.chatId || String(r.chatId) === String(m.chatId))))
        .filter(Boolean);

      return ordered;
    },
    [tdCall, touchOpenedChat, persistCachesDebounced]
  );

  // prefetch next batches with stagger (now ensures replies for prefetched)
  const prefetchNextBatches = useCallback(
    async (fromBatchIdx: number) => {
      for (let i = 1; i <= MAX_PREFETCH_BATCHES; i++) {
        const idx = fromBatchIdx + i;
        if (prefetchRef.current.has(idx) || prefetchInFlightRef.current.has(idx)) continue;
        const start = idx * BATCH_SIZE;
        if (start >= datasRef.current.length) break;
        prefetchInFlightRef.current.add(idx);
        (async (batchIndex, waitMs) => {
          await delay(waitMs);
          try {
            const msgs = await loadBatch(batchIndex);
            if (msgs && msgs.length) {
              const enriched = await ensureRepliesForMessages(msgs);
              prefetchRef.current.set(batchIndex, enriched);
            }
          } catch (e) {}
          prefetchInFlightRef.current.delete(batchIndex);
        })(idx, i * 300);
      }
    },
    [loadBatch, ensureRepliesForMessages]
  );

  // appendNextBatch (uses prefetch if available) — ensures replies before appending
  const appendNextBatch = useCallback(
    async (nextBatchIdx: number) => {
      const pref = prefetchRef.current.get(nextBatchIdx);
      let loaded: any[] = [];
      if (pref) {
        const exist = new Set(messages.map((m: any) => `${m.chatId}:${m.id}`));
        const toAppend = pref.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
        if (toAppend.length) setMessages((prev) => [...prev, ...toAppend]);
        prefetchRef.current.delete(nextBatchIdx);
        loaded = pref;
      } else {
        const newLoaded = await loadBatch(nextBatchIdx);
        const enriched = await ensureRepliesForMessages(newLoaded);
        const exist = new Set(messages.map((m: any) => `${m.chatId}:${m.id}`));
        const toAppend = enriched.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
        if (toAppend.length) setMessages((prev) => [...prev, ...toAppend]);
        loaded = enriched;
      }

      // warm chatInfo for appended messages
      const chatIds = Array.from(new Set(loaded.map((m) => m.chatId).filter(Boolean)));
      await limitConcurrency(
        chatIds,
        2,
        async (cid) => {
          await getAndCacheChatInfo(+cid);
          return null;
        }
      );

      return loaded.length;
    },
    [loadBatch, messages, getAndCacheChatInfo, ensureRepliesForMessages]
  );

  // helper: read stored user info (robust for multiple formats)
  const getStoredUserInfo = useCallback(async (): Promise<{ uuid?: string; activeTab?: string }> => {
    try {
      const raw = await AsyncStorage.getItem("userId-corner");
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.uuid) return { uuid: String(parsed.uuid), activeTab: parsed.activeTab ? String(parsed.activeTab) : undefined };
        }
      } catch (e) {
        // not JSON — raw is a string (maybe combined)
      }
      const str = raw as string;
      const currentTab = activeTabRef.current;
      if (currentTab && str.endsWith(currentTab)) {
        const uuid = str.slice(0, str.length - currentTab.length);
        return { uuid, activeTab: currentTab };
      }
      return { uuid: str };
    } catch (e) {
      return {};
    }
  }, []);

  // notify server batch reached (keeps as in your original) — read activeTab from ref and uuid via helper
  // keep track of sent batches per activeTab so tabs don't block each other
const sentBatchesMapRef = useRef<Map<string, Set<number>>>(new Map());

function hasSentBatchForTab(tab: string, batchIdx: number) {
  const key = tab || '__GLOBAL__';
  const s = sentBatchesMapRef.current.get(key);
  return !!s && s.has(batchIdx);
}
function markSentBatchForTab(tab: string, batchIdx: number) {
  const key = tab || '__GLOBAL__';
  let s = sentBatchesMapRef.current.get(key);
  if (!s) {
    s = new Set<number>();
    sentBatchesMapRef.current.set(key, s);
  }
  s.add(batchIdx);
}

const notifyServerBatchReached = useCallback(async (batchIdx: number) => {
  try {
    const currentTab = activeTabRef.current || '';
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

    // debug log (remove or lower verbosity later)
    console.log('[notify] sending seen-message', { tab: currentTab, batchIdx, idsLength: ids.length });

    await fetch(`http://10.129.218.115:9000/feed-message/seen-message?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    // mark as sent for this tab
    markSentBatchForTab(currentTab, batchIdx);
  } catch (err) {
    console.warn('[notify] failed', err);
  }
}, []);

  // initial load effect
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadPersistedCaches();

        if (!activeTab) return;
        setInitialLoading(true);
        setInitialError(false);

        const parsed = await getStoredUserInfo();
        const parsedUuid = parsed.uuid;
        if (!parsedUuid) return;
        const serverTab = activeTabRef.current || activeTab;
        const res = await fetch(`http://10.129.218.115:9000/feed-message?team=${encodeURIComponent(serverTab)}&uuid=${parsedUuid}`);
        const datass: { chatId: string; messageId: string; channel: string }[] = await res.json();
        if (!mounted) return;

        const datas = datass.sort((a, b) => +b.messageId - +a.messageId).slice(0, 200);
        datasRef.current = datas;

        const first = await loadBatch(0);
        if (!mounted) return;

        // ensure replies for the first batch before setting state
        const enrichedFirst = await ensureRepliesForMessages(first);
        if (!mounted) return;

        setMessages(enrichedFirst);
        setCurrentBatchIdx(0);

        const chatIds = Array.from(new Set(enrichedFirst.map((m) => m.chatId).filter(Boolean)));
        await limitConcurrency(
          chatIds,
          2,
          async (cid) => {
            await getAndCacheChatInfo(+cid);
            return null;
          }
        );

        notifyServerBatchReached(0).catch(() => {});
        prefetchNextBatches(0);
        setInitialLoading(false);
      } catch (err) {
        setInitialError(true);
        setInitialLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, loadBatch, getAndCacheChatInfo, prefetchNextBatches, loadPersistedCaches, notifyServerBatchReached, ensureRepliesForMessages]);

  // poll visible messages (only when focused & visible)
  const pollVisibleMessages = useCallback(() => {
    if (!visibleIds.length) return;
    for (const id of visibleIds) {
      const msg = messages.find((m) => m.id === id);
      if (!msg) continue;
      tdCall("getMessage", msg.chatId, msg.id)
        .then(async (raw: any) => {
          const full = JSON.parse(raw.raw);
          // If the refreshed message contains a reply reference, ensure that reply is cached & attached
          const enrichedArray = await ensureRepliesForMessages([full]);
          const enrichedFull = enrichedArray[0] || full;

          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.id === id);
            if (idx !== -1) copy[idx] = enrichedFull;
            return copy;
          });
          const key = mk(full.chatId || msg.chatId, full.id);
          messageCacheRef.current.set(key, full);
          persistCachesDebounced();
        })
        .catch(() => {});
    }
  }, [visibleIds, messages, tdCall, persistCachesDebounced, ensureRepliesForMessages]);

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

  // DeviceEventEmitter updates (interactionInfo, message updates)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      try {
        const update = typeof event.raw === "string" ? JSON.parse(event.raw) : event.raw;

        if (update.type === "UpdateMessageInteractionInfo" && update.data) {
          const { messageId, interactionInfo } = update.data;
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, interactionInfo: { ...m.interactionInfo, ...interactionInfo } } : m)));
          for (const [k, v] of messageCacheRef.current.entries()) {
            if (v.id === messageId) {
              v.interactionInfo = { ...v.interactionInfo, ...interactionInfo };
              messageCacheRef.current.set(k, v);
            }
          }
          persistCachesDebounced();
        }

        if (update.message) {
          const msg = update.message;
          // Update cache & messages list; but make sure to resolve any reply references for this msg
          const key = mk(msg.chatId || msg.chat?.id, msg.id);
          messageCacheRef.current.set(key, msg);
          persistCachesDebounced();

          // enrich with reply if necessary and update UI list
          const enrichedArr = await ensureRepliesForMessages([msg]);
          const enriched = enrichedArr[0] || msg;

          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...enriched } : m)));
        }
      } catch (e) {
        // ignore malformed updates
      }
    });
    return () => subscription.remove();
  }, [persistCachesDebounced, ensureRepliesForMessages, tdCall]);

  // onViewable changed — make deterministic and pick center item for activeDownloads
  const visibleIdsRef = useRef<number[]>([]);
  const onViewRef = useCallback(
    ({ viewableItems }: any) => {
      if (!viewableItems || viewableItems.length === 0) {
        setVisibleIds([]);
        visibleIdsRef.current = [];
        return;
      }

      // sort by index so order is deterministic
      const sorted = [...viewableItems].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const ids = sorted.map((vi: any) => vi.item.id);

      setVisibleIds(ids);
      visibleIdsRef.current = ids;

      for (const vi of sorted) {
        const msg = vi.item;
        if (msg.chatId && msg.id && !alreadyViewed.current.has(msg.id)) {
          tdCall("viewMessages", msg.chatId, [msg.id], false)
            .then(() => alreadyViewed.current.add(msg.id))
            .catch(() => {});
        }
      }
    },
    [tdCall]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        setVisibleIds([]);
        try {
          visibleIdsRef.current.forEach((id) => DeviceEventEmitter.emit("pause-video", { messageId: id }));
        } catch (e) {}
        visibleIdsRef.current = [];
      };
    }, [])
  );

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  // --- ACTIVE DOWNLOADS: compute neighbors (center visible + 2 up + 2 down) ---
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

  // ensure opened chats for activeDownloads (touch LRU; open minimal)
  useEffect(() => {
    (async () => {
      const currentChatIds = new Set<number>();
      for (const id of activeDownloads) {
        const msg = messages.find((m) => m.id === id);
        if (!msg || !msg.chatId) continue;
        const chatId = msg.chatId;
        currentChatIds.add(chatId);
        if (!openedChats.current.has(chatId)) {
          try {
            await tdCall("openChat", chatId);
            openedChats.current.set(chatId, Date.now());
          } catch (e) {}
        } else touchOpenedChat(chatId);
        tdCall("viewMessages", chatId, [msg.id], false).catch(() => {});
      }
      // don't aggressively close here; LRU eviction will close if cap exceeded
    })();
  }, [activeDownloads, messages, tdCall, touchOpenedChat]);

  // infinite scroll / load more
  const isLoadingMoreRef = useRef(false);
  const appendAndAdvance = useCallback(
    async (nextBatchIdx: number) => {
      try {
        const pref = prefetchRef.current.get(nextBatchIdx);
        if (pref) {
          const exist = new Set(messages.map((m: any) => `${m.chatId}:${m.id}`));
          const toAppend = pref.filter((m) => !exist.has(`${m.chatId}:${m.id}`));
          if (toAppend.length) setMessages((prev) => [...prev, ...toAppend]);
          prefetchRef.current.delete(nextBatchIdx);
        } else {
          await appendNextBatch(nextBatchIdx);
        }
        setCurrentBatchIdx(nextBatchIdx);
        notifyServerBatchReached(nextBatchIdx).catch(() => {});
        prefetchNextBatches(nextBatchIdx);
        const newStart = (nextBatchIdx + 1) * BATCH_SIZE;
        if (newStart >= datasRef.current.length) {
          // no-op; server will be queried on loadMore
        }
      } catch (err) {
        // ignore
      }
    },
    [appendNextBatch, prefetchNextBatches, messages]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextBatchIdx = currentBatchIdx + 1;
      const start = nextBatchIdx * BATCH_SIZE;
      if (start >= datasRef.current.length) {
        const parsed = await getStoredUserInfo();
        if (!parsed?.uuid) {
          setLoadingMore(false);
          isLoadingMoreRef.current = false;
          return;
        }
        console.log(encodeURIComponent(activeTabRef.current))
        const res = await fetch(`http://10.129.218.115:9000/feed-message?team=${encodeURIComponent(activeTabRef.current)}&uuid=${parsed.uuid}`);
        const newDatas: { chatId: string; messageId: string; channel: string }[] = await res.json();
        if (!newDatas || newDatas.length === 0) {
          setLoadingMore(false);
          isLoadingMoreRef.current = false;
          return;
        }
        // dedupe and append into datasRef
        const combined = [...datasRef.current, ...newDatas];
        const unique = combined.filter((d, idx, arr) => arr.findIndex((x) => x.chatId === d.chatId && x.messageId === d.messageId) === idx);
        datasRef.current = unique;
        await appendAndAdvance(nextBatchIdx);
      } else {
        await appendAndAdvance(nextBatchIdx);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [currentBatchIdx, activeTab, appendAndAdvance]);

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  // cleanup openedChats on blur/unmount
  useFocusEffect(
    useCallback(() => {
      return () => {
        const promises = Array.from(openedChats.current.keys()).map((chatId) => {
          return tdCall("closeChat", chatId).catch(() => {});
        });
        Promise.all(promises).then(() => openedChats.current.clear());
      };
    }, [tdCall])
  );

  // renderItem (pass chatInfo). NOTE: do NOT start downloads here; children handle downloads when they are visible.
  const renderItem = useCallback(
    ({ item }: any) => {
      if (!item?.chatId) return null;
      const chatInfo = chatInfoRef.current.get(item.chatId);
      const isVisible = visibleIds.includes(item.id);
      const isActiveDownload = activeDownloads.includes(item.id);
      return <MessageItem data={item} isVisible={isVisible} activeDownload={isActiveDownload} chatInfo={chatInfo} />;
    },
    [visibleIds, activeDownloads]
  );

  // header animation preserved but simplified (kept original behavior elsewhere)
  const DEFAULT_HEADER = 70;
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(DEFAULT_HEADER);
  const translateY = useRef(new Animated.Value(0)).current;
  const lastYRef = useRef(0);
  const isHiddenRef = useRef(false);
  const EXTRA_HIDE = 2;
  const hideHeader = () => {
    if (isHiddenRef.current) return;
    const target = -(measuredHeaderHeight + EXTRA_HIDE);
    Animated.timing(translateY, { toValue: target, duration: 180, useNativeDriver: true }).start(() => {
      isHiddenRef.current = true;
    });
  };
  const showHeader = () => {
    if (!isHiddenRef.current) return;
    Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      isHiddenRef.current = false;
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastYRef.current;
    lastYRef.current = y;
    if (Math.abs(delta) < 0.5) return;
    if (Math.abs(delta) >= 40) {
      if (delta > 0) {
        hideHeader();
      } else {
        showHeader();
      }
      return;
    }
    // keep previous threshold logic if desired...
    if (y <= 5) showHeader();
  };

  // small helper to set activeTab and sync ref in one place
  const setActiveTabAndSync = useCallback((tab: string) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);

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
          <HomeHeader activeTab={activeTab} setActiveTab={setActiveTabAndSync} />
        </View>
      </Animated.View>

      <View style={{ flex: 1 }}>
        {initialLoading ? (
          <ActivityIndicator size="large" color="#ddd" style={{ marginTop: 120 }} />
        ) : initialError ? (
          <View style={{ marginTop: 120, alignItems: "center" }}>
            <Text style={{ color: "rgba(138, 138, 138, 1)", marginBottom: 10, fontFamily: "SFArabic-Regular" }}>از وصل بودن فیاترشکن و اینترنت اطمینان حاصل کنید</Text>
            <TouchableOpacity onPress={() => setInitialError(false)} style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#333", borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontFamily: "SFArabic-Regular" }}>تلاش دوباره</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            style={{ paddingHorizontal: 12.5 }}
            data={messages}
            keyExtractor={(item, index) => `${item?.chatId || "c"}-${item?.id || index}`}
            renderItem={renderItem}
            onViewableItemsChanged={onViewRef}
            viewabilityConfig={viewConfigRef.current}
            initialNumToRender={8}
            maxToRenderPerBatch={12}
            windowSize={15}
            contentContainerStyle={{ paddingTop: measuredHeaderHeight + insets.top, paddingBottom: 20 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={<View style={{ justifyContent: "center", alignItems: "center", paddingVertical: 20 }}><ActivityIndicator color="#888" size="small" /></View>}
            removeClippedSubviews={false} // very important for keeping item state during fast scroll
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
