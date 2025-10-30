// TelegramScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  ActivityIndicator,
  StyleSheet,
  View,
  SafeAreaView as RNSSafeAreaView,
  Text,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ChannelItem from "../../components/tabs/telegram/ChannelItem";
import TelegramHeader from "../../components/tabs/telegram/TelegramHeader";

/** تنظیمات و ثابت‌ها */
const MAX_CHANNELS = 50;
const BATCH_SIZE = 5;
const INTERVAL_MS = 5_000; // هر 5 ثانیه یک بسته 5تایی
const FAVORITES_KEY = "teams"; // AsyncStorage key

// جدید: جلوگیری از فراخوانی‌های پیاپی به سرور — حداقل فاصله بین دو لود
const COOLDOWN_MS = 3 * 60 * 1000; // 3 دقیقه
const LAST_FETCH_KEY = "telegram_last_fetch";

const teamRecord: Record<string, string> = {
  "پرسپولیس": "perspolis",
  "استقلال": "esteghlal",
  "سپاهان": "sepahan",
  "تراکتور": "tractor",
  "بارسلونا": "barcelona",
  "رئال مادرید": "realmadrid",
  "آرسنال": "arsenal",
  "منچستر یونایتد": "manchesterunited",
  "لیورپول": "liverpool",
  "چلسی": "chelsea",
  "بایرن": "bayern",
  "اینتر": "inter",
  "میلان": "milan",
};

function buildQueryParamsFromFavorites(fav: { team1?: string; team2?: string | null; team3?: string | null }) {
  const params = new URLSearchParams();
  if (fav.team1) params.append("team1", fav.team1);
  if (fav.team2) params.append("team2", fav.team2 ?? "");
  if (fav.team3) params.append("team3", fav.team3 ?? "");
  return params.toString();
}

function uniqueChannels(channels: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const ch of channels) {
    const key = ch?.username ? `u:${ch.username}` : (ch?.id ? `i:${ch.id}` : JSON.stringify(ch));
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ch);
    }
  }
  return out;
}

export default function TelegramScreen() {
  const [displayedChannels, setDisplayedChannels] = useState<any[]>([]);
  const [allChannels, setAllChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nextSecondsLeft, setNextSecondsLeft] = useState<number | null>(null);

  // جدید: زمانی که تا اجازه بعدی مانده (ثانیه)
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null);

  const abortCtrlRef = useRef<AbortController | null>(null);
  const isUnmountedRef = useRef(false);

  // pointer to next index in allChannels to append
  const pointerRef = useRef(0);
  // interval id for appending batches
  const appendIntervalRef = useRef<number | null>(null);
  // interval id for countdown updater
  const countdownIntervalRef = useRef<number | null>(null);
  // timestamp (ms) when next append is scheduled
  const nextScheduledAtRef = useRef<number | null>(null);

  // mirror of allChannels to avoid stale closures
  const allChannelsRef = useRef<any[]>([]);
  useEffect(() => { allChannelsRef.current = allChannels; }, [allChannels]);

  // refs for cooldown management
  const cooldownIntervalRef = useRef<number | null>(null);
  const cooldownTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    isUnmountedRef.current = false;

    // cleanup helper
    function clearCooldownTimers() {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
      setCooldownLeft(null);
    }

    async function startOrWaitLoad() {
      setLoading(true);
      setErrorMsg(null);

      // read last fetch time
      let lastRaw: string | null = null;
      try {
        lastRaw = await AsyncStorage.getItem(LAST_FETCH_KEY);
      } catch (e) {
        console.warn("AsyncStorage read last fetch error:", e);
      }

      if (lastRaw) {
        const last = parseInt(lastRaw, 10);
        if (!isNaN(last)) {
          const allowedAt = last + COOLDOWN_MS;
          const now = Date.now();
          if (now < allowedAt) {
            // هنوز در حالت cooldown هستیم — نمایش پیام و شروع تایمر
            const leftMs = allowedAt - now;
            setCooldownLeft(Math.ceil(leftMs / 1000));
            setLoading(false);

            // interval برای آپدیت هر ثانیه شمارش معکوس
            if (!cooldownIntervalRef.current) {
              cooldownIntervalRef.current = setInterval(() => {
                const left = Math.max(0, Math.ceil((allowedAt - Date.now()) / 1000));
                setCooldownLeft(left === 0 ? null : left);
                if (left === 0) {
                  // پاک‌سازی این interval (عمل اصلی با timeout انجام می‌شود)
                  if (cooldownIntervalRef.current) {
                    clearInterval(cooldownIntervalRef.current);
                    cooldownIntervalRef.current = null;
                  }
                }
              }, 1000) as unknown as number;
            }

            // timeout برای فراخوانی خودکار loadAndPrepare در زمان مجاز
            if (!cooldownTimeoutRef.current) {
              const to = setTimeout(() => {
                clearCooldownTimers();
                // در زمان مجاز، فراخوانی اصلی
                loadAndPrepare();
              }, leftMs) as unknown as number;
              cooldownTimeoutRef.current = to;
            }

            return; // از لود کردن فعلی خودداری کن تا cooldown تمام شود
          }
        }
      }

      // اگر اینجا رسیدیم یعنی یا رکورد قبلی نیست یا زمانش گذشته — لود کن بلافاصله
      clearCooldownTimers();
      await loadAndPrepare();
    }

    // تابع اصلی لود (قابل خواندن از بالا)
    async function loadAndPrepare() {
      setLoading(true);
      setErrorMsg(null);

      // read favorites
      let favRaw: string | null = null;
      try { favRaw = await AsyncStorage.getItem(FAVORITES_KEY); } catch (e) { console.warn("AsyncStorage read error:", e); }

      let fav: { team1?: string; team2?: string | null; team3?: string | null } | null = null;
      if (favRaw) {
        try { fav = JSON.parse(favRaw); } catch { fav = null; }
      }
      if (!fav || !fav.team1) {
        const firstKey = Object.keys(teamRecord)[0];
        fav = { team1: teamRecord[firstKey], team2: null, team3: null };
      }

      const query = buildQueryParamsFromFavorites(fav);
      const url = `http://10.124.97.115:9000/feed-channel?${query}`;

      // abort previous
      if (abortCtrlRef.current) {
        try { abortCtrlRef.current.abort(); } catch {}
      }
      const ac = new AbortController();
      abortCtrlRef.current = ac;

      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (isUnmountedRef.current) return;
        const list = Array.isArray(data) ? data : [];
        const unique = uniqueChannels(list).slice(0, MAX_CHANNELS); // محدود به MAX_CHANNELS

        // set allChannels and reset displayed + pointer
        setAllChannels(unique);
        // <-- مهم: mirror در ref بلافاصله تا appendNextChunkImmediate بتواند از آن استفاده کند
        allChannelsRef.current = unique;

        pointerRef.current = 0;
        setDisplayedChannels([]);
        // clear any previous intervals/timers
        if (appendIntervalRef.current) { clearInterval(appendIntervalRef.current); appendIntervalRef.current = null; }
        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
        nextScheduledAtRef.current = null;
        setNextSecondsLeft(null);

        // ذخیره زمان آخرین فراخوانی موفق در AsyncStorage تا از بلاک شدن جلوگیری شود
        try {
          await AsyncStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
        } catch (e) {
          console.warn("AsyncStorage write last fetch error:", e);
        }

        // append first batch immediately (اگر چیزی موجود بود)
        appendNextChunkImmediate();

        setLoading(false);

      } catch (err: any) {
        if (err?.name === "AbortError") {
          // ignore
        } else {
          console.error("fetch error:", err);
          setErrorMsg(String(err?.message ?? err));
          setAllChannels([]);
          setDisplayedChannels([]);
          setLoading(false);
        }
      } finally {
        abortCtrlRef.current = null;
      }
    }

    // شروع منطق: یا منتظر بمان یا لود کن
    startOrWaitLoad();

    return () => {
      // cleanup on unmount
      isUnmountedRef.current = true;
      if (appendIntervalRef.current) { clearInterval(appendIntervalRef.current); appendIntervalRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      if (abortCtrlRef.current) {
        try { abortCtrlRef.current.abort(); } catch {}
        abortCtrlRef.current = null;
      }
      // cleanup cooldown timers
      if (cooldownIntervalRef.current) { clearInterval(cooldownIntervalRef.current); cooldownIntervalRef.current = null; }
      if (cooldownTimeoutRef.current) { clearTimeout(cooldownTimeoutRef.current); cooldownTimeoutRef.current = null; }
    };
    // run once on mount
  }, []);

  // append next chunk immediately and start append interval for subsequent batches
  function appendNextChunkImmediate() {
    const all = allChannelsRef.current;
    if (!all || all.length === 0) {
      // nothing to append
      setNextSecondsLeft(null);
      return;
    }
    const start = pointerRef.current;
    const end = Math.min(start + BATCH_SIZE, all.length, MAX_CHANNELS);
    const items = all.slice(start, end);
    pointerRef.current = end;

    setDisplayedChannels(prev => uniqueChannels([...prev, ...items]).slice(0, MAX_CHANNELS));

    // schedule next append
    const nextAt = Date.now() + INTERVAL_MS;
    nextScheduledAtRef.current = nextAt;
    updateCountdown(); // set initial countdown value

    // start append interval if not already started
    if (!appendIntervalRef.current) {
      const id = setInterval(() => {
        appendNextChunkInterval();
      }, INTERVAL_MS) as unknown as number;
      appendIntervalRef.current = id;
    }

    // start countdown interval if not already started
    if (!countdownIntervalRef.current) {
      const cid = setInterval(() => {
        updateCountdown();
      }, 1000) as unknown as number;
      countdownIntervalRef.current = cid;
    }
  }

  // function called by the interval to append next chunk
  function appendNextChunkInterval() {
    const all = allChannelsRef.current;
    if (!all || all.length === 0) {
      // nothing to do
      clearAppendInterval();
      clearCountdownInterval();
      setNextSecondsLeft(null);
      return;
    }
    const start = pointerRef.current;
    if (start >= Math.min(all.length, MAX_CHANNELS)) {
      // reached end
      clearAppendInterval();
      nextScheduledAtRef.current = null;
      setNextSecondsLeft(null);
      clearCountdownInterval();
      return;
    }
    const end = Math.min(start + BATCH_SIZE, all.length, MAX_CHANNELS);
    const items = all.slice(start, end);
    pointerRef.current = end;

    setDisplayedChannels(prev => uniqueChannels([...prev, ...items]).slice(0, MAX_CHANNELS));

    // if we've reached the end after this append, stop intervals
    if (pointerRef.current >= Math.min(all.length, MAX_CHANNELS)) {
      nextScheduledAtRef.current = null;
      setNextSecondsLeft(null);
      clearAppendInterval();
      // let countdown clear too
      clearCountdownInterval();
      return;
    }

    // schedule next
    nextScheduledAtRef.current = Date.now() + INTERVAL_MS;
    updateCountdown();
  }

  function clearAppendInterval() {
    if (appendIntervalRef.current) {
      clearInterval(appendIntervalRef.current);
      appendIntervalRef.current = null;
    }
  }
  function clearCountdownInterval() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }

  // countdown updater for footer: compute seconds to next pending batch
  function updateCountdown() {
    const nextAt = nextScheduledAtRef.current;
    if (!nextAt) {
      setNextSecondsLeft(null);
      return;
    }
    const leftMs = Math.max(0, nextAt - Date.now());
    // show seconds (rounded up)
    setNextSecondsLeft(Math.ceil(leftMs / 1000));
  }

  // Footer component: shows small loader + manual button removed — فقط خودکار
  const ListFooter = () => {
    const totalAll = Math.min(allChannels.length, MAX_CHANNELS);
    const loaded = displayedChannels.length;
    // if nothing pending, show null
    if (loaded >= totalAll) return null;

    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={"#fff"} />
        <Text style={styles.footerText}>
          {"  "} بارگذاری بعدی {nextSecondsLeft !== null ? `در ${nextSecondsLeft} ثانیه` : ""}
        </Text>
        <Text style={styles.footerCountText}>{loaded}/{totalAll}</Text>
      </View>
    );
  };

  const keyExtractor = (item: any, index: number) =>
    (item?.id && String(item.id)) || (item?.username && String(item.username)) || index.toString();

  return (
    <RNSSafeAreaView style={styles.safe}>
      <TelegramHeader />
      <View style={styles.container}>
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={"#fff"} />
          </View>
        )}

        {!loading && cooldownLeft !== null && (
          <View style={styles.loadingWrap}>
            <Text style={styles.footerText}>
              شما اخیراً درخواست‌هایی انجام داده‌اید. لطفاً منتظر بمانید — {cooldownLeft} ثانیه تا اجرای درخواست بعدی مانده.
            </Text>
            <Text style={{ color: "#ffffffff", marginTop: 4, fontFamily: "SFArabic-Regular" }}>
              پس از اتمام شمارش معکوس، خودکار صفحه بروزرسانی خواهد شد.
            </Text>
          </View>
        )}

        {!loading && errorMsg && (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>خطا: {errorMsg}</Text>
          </View>
        )}

        {!loading && !errorMsg && cooldownLeft === null && (
          <FlatList
            data={displayedChannels}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => (
              <ChannelItem channel={item} onReady={() => {}} />
            )}
            ListFooterComponent={ListFooter}
          />
        )}
      </View>
    </RNSSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1, backgroundColor: "#000" },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  errorText: { color: "red" },
  footer: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  footerText: { color: "#fff", fontFamily: "SFArabic-Regular" },
  footerCountText: { color: "#aaa", marginLeft: 12, fontFamily: "SFArabic-Regular" },
});
