// TelegramScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  ActivityIndicator,
  StyleSheet,
  View,
  SafeAreaView as RNSSafeAreaView,
} from "react-native";
import TelegramHeader, { teamRecord as headerTeamRecord } from "../../components/tabs/telegram/TelegramHeader";
import ChannelItem from "../../components/tabs/telegram/ChannelItem";
import TdLib from "react-native-tdlib";

/** fallback mapping (header exports teamRecord normally) */
const teamRecord: Record<string, string> = headerTeamRecord ?? {
  'پرسپولیس': 'perspolis',
  'استقلال': 'esteghlal',
  'سپاهان': 'sepahan',
  'تراکتور': 'tractor',
  'بارسلونا': 'barcelona',
  'رئال مادرید': 'realmadrid',
  'آرسنال': 'arsenal',
  'منچستر یونایتد': 'manchesterunited',
  'لیورپول': 'liverpool',
  'چلسی': 'chelsea',
  'بایرن': 'bayern',
  'اینتر': 'inter',
  'میلان': 'milan',
};

/** small helpers for canonical keys and loader arg (avoid passing file ids) */
function makeCanonicalKey(ch: any, fallbackIndex?: number) {
  if (!ch) return `raw:${fallbackIndex ?? Math.random()}`;
  if (ch?.username) return `u:${String(ch.username)}`;
  if (typeof ch?.id === "number" || (typeof ch?.id === "string" && /^\d+$/.test(ch.id))) {
    return `i:${String(ch.id)}`;
  }
  return `raw:${fallbackIndex ?? String(ch)}`;
}
function makeLoaderArg(ch: any) : string | number | null {
  if (!ch) return null;
  if (ch?.username && typeof ch.username === "string") return ch.username;
  if (typeof ch?.id === "number") return ch.id;
  if (typeof ch?.id === "string" && /^\d+$/.test(ch.id)) return Number(ch.id);
  return null;
}

/**
 * channelInfoLoader with clearQueue capability (keeps concurrency & retry)
 */
function createChannelInfoLoader() {
  const cache = new Map<string | number, any>();
  const inflight = new Map<string | number, Promise<any>>();
  const queue: Array<{ key: string | number; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  let active = 0;

  const CONCURRENCY = 3;
  const DELAY_MS = 350;
  const MAX_RETRIES = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function doFetchRaw(key: string | number) {
    if (typeof key === "number") return TdLib.getChat(key);
    return TdLib.searchPublicChat(String(key));
  }

  function tryParseSafe(maybe: any) {
    if (!maybe) return null;
    if (typeof maybe === "object") return maybe;
    if (typeof maybe === "string") {
      const t = maybe.trim();
      try { return JSON.parse(t); } catch { return null; }
    }
    return null;
  }

  async function fetchWithRetries(key: string | number) {
    if (cache.has(key)) return cache.get(key);
    let attempt = 0;
    let lastErr: any = null;
    while (attempt < MAX_RETRIES) {
      try {
        const res: any = await doFetchRaw(key);
        const parsed = res?.raw ? tryParseSafe(res.raw) ?? tryParseSafe(res) : tryParseSafe(res) ?? res;
        cache.set(key, parsed ?? res ?? null);
        return parsed ?? res ?? null;
      } catch (e) {
        lastErr = e;
        attempt++;
        const backoff = 200 * Math.pow(2, attempt);
        await sleep(backoff);
        const errStr:any = (e && String(e)) || "";
        if (errStr.includes("USERNAME_NOT_OCCUPIED") || errStr.toLowerCase().includes("username is invalid")) {
          // treat as non-retriable
          cache.set(key, null);
          throw e;
        }
      }
    }
    cache.set(key, null);
    throw lastErr;
  }

  async function worker() {
    if (active >= CONCURRENCY) return;
    const item = queue.shift();
    if (!item) return;
    active++;
    try {
      if (cache.has(item.key)) {
        item.resolve(cache.get(item.key));
        active--;
        setTimeout(worker, DELAY_MS);
        return;
      }
      const result = await fetchWithRetries(item.key);
      cache.set(item.key, result);
      item.resolve(result);
    } catch (e) {
      item.reject(e);
    } finally {
      active--;
      setTimeout(worker, DELAY_MS);
    }
  }

  function enqueue(key: string | number) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key)!;

    const p = new Promise<any>((resolve, reject) => {
      queue.push({ key, resolve, reject });
    })
      .then((res) => { inflight.delete(key); return res; })
      .catch((err) => { inflight.delete(key); throw err; });

    inflight.set(key, p);
    setImmediate(worker);
    return p;
  }

  function getCached(key: string | number) {
    return cache.get(key);
  }

  function clearQueue() {
    // empty pending queue (won't cancel inflight promises)
    queue.length = 0;
  }

  function clearCache() {
    cache.clear();
  }

  return { enqueue, getCached, clearQueue, clearCache };
}

const channelInfoLoader = createChannelInfoLoader();

/** CONFIG: tune these to be more/less aggressive */
const TEAM_CHANGE_DEBOUNCE_MS = 350; // debounce switching teams
const PREFETCH_INITIAL = 6; // only prefetch first N immediately
const PREFETCH_STAGGER_MS = 350; // stagger remaining prefetch with this gap

export default function TelegramScreen() {
  const [channels, setChannels] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);

  const channelsCacheRef = useRef<Record<string, any[]>>({});
  const prefetchedCacheRef = useRef<Record<string, Record<string, any>>>({});

  const [prefetchedMap, setPrefetchedMap] = useState<Record<string, any>>({});

  const totalRef = useRef(0);
  const readySetRef = useRef(new Set<string | number>());
  const selectedTeamRef = useRef<string>("");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // debounce timer for team changes
  const teamChangeTimerRef = useRef<number | null>(null);
  // generation counter for prefetch batching (used to ignore outdated scheduled prefetches)
  const prefetchGenerationRef = useRef(0);
  // track stagger timeouts so we can cancel them on team change
  const prefetchTimeoutsRef = useRef<number[]>([]);
  // abort controller for server fetch
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  // handler called by header immediately; we debounce inside screen
  const onTeamChange = (teamPersian: string) => {
    // clear any existing debounce timer
    if (teamChangeTimerRef.current) {
      clearTimeout(teamChangeTimerRef.current);
      teamChangeTimerRef.current = null;
    }
    // set a small debounce — if user keeps switching fast, only last one will fire
    teamChangeTimerRef.current = setTimeout(() => {
      teamChangeTimerRef.current = null;
      // update state which triggers loadTeamData
      setSelectedTeam(teamPersian);
    }, TEAM_CHANGE_DEBOUNCE_MS) as unknown as number;
  };

  useEffect(() => {
    // main loader when selectedTeam changes
    let cancelled = false;

    const cancelOngoingPrefetch = () => {
      // cancel scheduled staggered timeouts
      prefetchTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
      prefetchTimeoutsRef.current = [];
      // clear loader queue so pending enqueues don't run
      try { channelInfoLoader.clearQueue(); } catch {}
      // increase generation so any already-scheduled prefetched callbacks ignore their results
      prefetchGenerationRef.current++;
    };

    const abortPreviousFetch = () => {
      if (fetchAbortControllerRef.current) {
        try { fetchAbortControllerRef.current.abort(); } catch {}
        fetchAbortControllerRef.current = null;
      }
    };

    const loadTeamData = async (teamPersian: string) => {
      if (!teamPersian) return;
      const slug = teamRecord[teamPersian] ?? teamPersian;
      selectedTeamRef.current = slug;

      // reset trackers
      readySetRef.current.clear();
      totalRef.current = 0;

      // cancel any ongoing prefetched activity from previous team
      cancelOngoingPrefetch();

      // If cached, show immediately and skip network (fast path)
      if (channelsCacheRef.current[slug]) {
        const cachedList = channelsCacheRef.current[slug] ?? [];
        setChannels(cachedList);
        setPrefetchedMap(prefetchedCacheRef.current[slug] ?? {});
        setGlobalLoading(false);
        return;
      }

      // Not cached -> do network fetch. Abort previous ongoing fetch.
      abortPreviousFetch();
      const ac = new AbortController();
      fetchAbortControllerRef.current = ac;

      setGlobalLoading(true);
      try {
        const res = await fetch(
          `http://10.129.218.115:9000/feed-channel?team=${encodeURIComponent(slug)}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setChannels(list);
        channelsCacheRef.current[slug] = list;
        totalRef.current = list.length;

        // reset visible prefetched map and ensure per-team store exists
        setPrefetchedMap({});
        prefetchedCacheRef.current[slug] = prefetchedCacheRef.current[slug] ?? {};

        if (!Array.isArray(list) || list.length === 0) {
          setGlobalLoading(false);
          return;
        }

        // start prefetch: first prefetch only a small number (PREFETCH_INITIAL),
        // the rest are staggered and will be cancelled if user switches quickly.
        const generation = ++prefetchGenerationRef.current;
        // clear loader queue to avoid leftover items
        try { channelInfoLoader.clearQueue(); } catch {}

        // helper to schedule loader for a channel item, but ignore if generation changed
        const schedulePrefetchFor = (ch: any, idx: number, delayMs = 0) => {
          if (delayMs === 0) {
            // immediate enqueue
            const loaderArg = makeLoaderArg(ch);
            const canonical = makeCanonicalKey(ch, idx);
            if (!loaderArg) {
              prefetchedCacheRef.current[slug][canonical] = null;
              return;
            }
            channelInfoLoader.enqueue(loaderArg)
              .then((info) => {
                if (prefetchGenerationRef.current !== generation) return; // outdated
                prefetchedCacheRef.current[slug] = prefetchedCacheRef.current[slug] ?? {};
                prefetchedCacheRef.current[slug][canonical] = info;
                if (selectedTeamRef.current === slug) {
                  setPrefetchedMap((prev) => ({ ...prev, [canonical]: info }));
                }
              })
              .catch((err) => {
                if (prefetchGenerationRef.current !== generation) return;
                prefetchedCacheRef.current[slug] = prefetchedCacheRef.current[slug] ?? {};
                prefetchedCacheRef.current[slug][canonical] = null;
                console.warn("prefetch channel failed", canonical, err?.message || err);
              });
          } else {
            // delayed enqueue (staggered) — remember timeout id to cancel if needed
            const tid = setTimeout(() => {
              // if generation mismatch, skip
              if (prefetchGenerationRef.current !== generation) return;
              const loaderArg = makeLoaderArg(ch);
              const canonical = makeCanonicalKey(ch, idx);
              if (!loaderArg) {
                prefetchedCacheRef.current[slug][canonical] = null;
                return;
              }
              channelInfoLoader.enqueue(loaderArg)
                .then((info) => {
                  if (prefetchGenerationRef.current !== generation) return;
                  prefetchedCacheRef.current[slug] = prefetchedCacheRef.current[slug] ?? {};
                  prefetchedCacheRef.current[slug][canonical] = info;
                  if (selectedTeamRef.current === slug) {
                    setPrefetchedMap((prev) => ({ ...prev, [canonical]: info }));
                  }
                })
                .catch((err) => {
                  if (prefetchGenerationRef.current !== generation) return;
                  prefetchedCacheRef.current[slug] = prefetchedCacheRef.current[slug] ?? {};
                  prefetchedCacheRef.current[slug][canonical] = null;
                  console.warn("prefetch channel failed", canonical, err?.message || err);
                });
            }, delayMs) as unknown as number;
            prefetchTimeoutsRef.current.push(tid);
          }
        };

        // immediate prefetch for top items
        for (let i = 0; i < Math.min(PREFETCH_INITIAL, list.length); i++) {
          schedulePrefetchFor(list[i], i, 0);
        }
        // stagger prefetch for remaining items (helps avoid many queued requests when switching tabs)
        let staggerBase = PREFETCH_STAGGER_MS;
        for (let i = PREFETCH_INITIAL; i < list.length; i++) {
          schedulePrefetchFor(list[i], i, staggerBase);
          staggerBase += PREFETCH_STAGGER_MS; // increase delay for next
        }

        // if ChannelItems never call onReady (unlikely), we may want a fallback timeout to hide globalLoading
        // but prefer to rely on ChannelItem calling onReady when it's rendered.
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // aborted by switching tab — safe to ignore
          // console.debug("fetch aborted for previous team");
        } else {
          console.error("fetchChannelsList error:", err);
        }
        setChannels([]);
        channelsCacheRef.current[slug] = [];
        prefetchedCacheRef.current[slug] = {};
        setPrefetchedMap({});
        totalRef.current = 0;
        setGlobalLoading(false);
      } finally {
        fetchAbortControllerRef.current = null;
      }
    };

    loadTeamData(selectedTeam);

    return () => {
      cancelled = true;
      // clear timers & cancel inflight fetches/prefetches
      if (teamChangeTimerRef.current) {
        clearTimeout(teamChangeTimerRef.current);
        teamChangeTimerRef.current = null;
      }
      // cancel prefetch timeouts
      prefetchTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
      prefetchTimeoutsRef.current = [];
      // clear loader queue
      try { channelInfoLoader.clearQueue(); } catch {}
      // abort fetch
      if (fetchAbortControllerRef.current) {
        try { fetchAbortControllerRef.current.abort(); } catch {}
        fetchAbortControllerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam]);

  const handleItemReady = (uniqueId: string | number | null | undefined) => {
    const key = uniqueId ?? "__unknown__" + Math.random();
    readySetRef.current.add(String(key));
    if (totalRef.current > 0 && readySetRef.current.size >= totalRef.current) {
      setGlobalLoading(false);
    }
  };

  // initial selection
  useEffect(() => {
    if (!selectedTeam) {
      const firstPersian = Object.keys(teamRecord)[0];
      setSelectedTeam(firstPersian);
    }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      // clear any pending timers
      if (teamChangeTimerRef.current) clearTimeout(teamChangeTimerRef.current);
      prefetchTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
      try { channelInfoLoader.clearQueue(); } catch {}
      if (fetchAbortControllerRef.current) try { fetchAbortControllerRef.current.abort(); } catch {}
    };
  }, []);

  return (
    <RNSSafeAreaView style={styles.safe}>
      <TelegramHeader onTeamChange={onTeamChange} initialTeam={selectedTeam} />
      <View style={styles.container}>
        <FlatList
          data={channels}
          keyExtractor={(item, index) =>
            (item?.id && String(item.id)) ||
            (item?.username && String(item.username)) ||
            index.toString()
          }
          renderItem={({ item, index }) => {
            const key = makeCanonicalKey(item, index);
            return (
              <ChannelItem
                channel={item}
                onReady={handleItemReady}
                prefetched={prefetchedMap[key]}
              />
            );
          }}
          contentContainerStyle={{ paddingBottom: 20 }}
        />

        {globalLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffffff" />
          </View>
        )}
      </View>
    </RNSSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
