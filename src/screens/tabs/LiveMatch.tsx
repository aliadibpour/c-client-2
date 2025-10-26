import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  Animated,
  Dimensions,
  View,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
  TouchableOpacity
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import io from "socket.io-client";
import DaySelector from "../../components/tabs/liveMatch/DaySelector";
import MatchList from "../../components/tabs/liveMatch/MatchList";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const dayList = [
  { title: "پریروز", id: 0 },
  { title: "دیروز", id: 1 },
  { title: "امروز", id: 2 },
  { title: "فردا", id: 3 },
  { title: "پس‌فردا", id: 4 },
];

export default function LiveMatchScreen() {
  const socketRef = useRef<any>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(2);

  const [loadingDays, setLoadingDays] = useState<{ [id: number]: boolean }>({});
  const [matchCache, setMatchCache] = useState<{ [id: number]: any[] }>({});
  const [failedDays, setFailedDays] = useState<{ [id: number]: boolean }>({});

  const inFlightRef = useRef<{ [id: number]: boolean }>({});
  const backoffRef = useRef<{ [id: number]: number }>({});
  const timerRef = useRef<{ [id: number]: number | NodeJS.Timeout | null }>({});

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList>(null);

  // --- request function (now sets loader immediately for first-time and waits for socket if needed) ---
  const requestMatchesOnce = (dayId: number, { force = false } = {}) => {
    // prevent concurrent emits
    if (inFlightRef.current[dayId] && !force) return;

    const firstTime = matchCache[dayId] === undefined;
    if (firstTime) {
      // show loader on first visit even if socket not ready yet (prevents black screen)
      setLoadingDays((p) => ({ ...p, [dayId]: true }));
      setFailedDays((p) => ({ ...p, [dayId]: false }));
    }

    // if socket not ready, do not mark failed immediately — wait for connect (user sees loader)
    if (!socketRef.current || !socketRef.current.connected) {
      console.log("socket not ready, will wait for connect to fetch day", dayId);
      return;
    }

    // now socket is ready -> proceed
    inFlightRef.current[dayId] = true;
    setFailedDays((p) => ({ ...p, [dayId]: false }));

    const timeoutMs = 7000;
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      inFlightRef.current[dayId] = false;
      if (firstTime) setLoadingDays((p) => ({ ...p, [dayId]: false }));
      setFailedDays((p) => ({ ...p, [dayId]: true }));
      console.warn(`live-match timeout for day ${dayId}`);
      // backoff schedule
      increaseBackoffAndSchedule(dayId);
    }, timeoutMs);

    try {
      socketRef.current.emit("live-match", dayId, (res: any) => {
        if (timedOut) {
          clearTimeout(t);
          return;
        }
        clearTimeout(t);
        inFlightRef.current[dayId] = false;
        if (firstTime) setLoadingDays((p) => ({ ...p, [dayId]: false }));

        if (res && Array.isArray(res.matchList)) {
          // lightweight equality: if identical, skip setState to avoid flicker
          const prev = matchCache[dayId];
          const incoming = res.matchList;
          let same = false;
          if (prev && Array.isArray(prev) && prev.length === incoming.length) {
            same = true;
            for (let i = 0; i < incoming.length; i++) {
              const a = prev[i];
              const b = incoming[i];
              if (!a || !b) { same = false; break; }
              if ((a.id || null) !== (b.id || null)) { same = false; break; }
              if (
                (a.score || null) !== (b.score || null) ||
                (a.matchMinutes || null) !== (b.matchMinutes || null) ||
                (a.matchMinutesAfter90 || null) !== (b.matchMinutesAfter90 || null) ||
                (a.matchFinish || null) !== (b.matchFinish || null) ||
                (a.matchAdjournment || null) !== (b.matchAdjournment || null) ||
                (a.matchCancel || null) !== (b.matchCancel || null)
              ) { same = false; break; }
            }
          }

          if (!same) {
            setMatchCache((p) => ({ ...p, [dayId]: incoming }));
          }
          backoffRef.current[dayId] = 5000;
          setFailedDays((p) => ({ ...p, [dayId]: false }));
        } else {
          // invalid payload: keep old data, mark failed and schedule retry
          setFailedDays((p) => ({ ...p, [dayId]: true }));
          increaseBackoffAndSchedule(dayId);
        }
      });
    } catch (err) {
      clearTimeout(t);
      inFlightRef.current[dayId] = false;
      if (firstTime) setLoadingDays((p) => ({ ...p, [dayId]: false }));
      setFailedDays((p) => ({ ...p, [dayId]: true }));
      console.error("socket emit error:", err);
      increaseBackoffAndSchedule(dayId);
    }
  };

  const increaseBackoffAndSchedule = (dayId: number) => {
    const prev = backoffRef.current[dayId] ?? 5000;
    const next = Math.min(60000, Math.max(5000, prev * 2));
    backoffRef.current[dayId] = next;
    scheduleNext(dayId);
  };

  const scheduleNext = (dayId: number) => {
    const existing = timerRef.current[dayId];
    if (existing) clearTimeout(existing as any);

    const delay = backoffRef.current[dayId] ?? 5000;
    const activeDayId = dayList[selectedDayIndex].id;
    if (dayId !== activeDayId) {
      timerRef.current[dayId] = null;
      return;
    }

    const id = setTimeout(() => {
      requestMatchesOnce(dayId);
      scheduleNext(dayId);
    }, delay);
    timerRef.current[dayId] = id;
  };

  // --- socket setup (after requestMatchesOnce is defined) ---
  useEffect(() => {
    socketRef.current = io("http://10.129.218.115:9000", {
      transports: ["websocket"],
    });

    socketRef.current.on("connect", () => {
      console.log("socket connected");
      // when socket connects, try to fetch current active day (if loader is visible it will fetch)
      const dayId = dayList[selectedDayIndex].id;
      requestMatchesOnce(dayId, { force: true });
    });

    socketRef.current.on("disconnect", () => {
      console.log("socket disconnected");
    });

    return () => {
      // clear timers
      Object.values(timerRef.current).forEach((id) => {
        if (id) clearTimeout(id as any);
      });
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // start polling for active day (schedules retries). ensures immediate loader + schedule
  useEffect(() => {
    const dayId = dayList[selectedDayIndex].id;
    if (!backoffRef.current[dayId]) backoffRef.current[dayId] = 5000;

    // try immediately (this will show loader if first time; if socket not ready it will wait)
    requestMatchesOnce(dayId);

    // clear timers for other days
    Object.keys(timerRef.current).forEach((k) => {
      const numKey = Number(k);
      if (numKey !== dayId && timerRef.current[numKey]) {
        clearTimeout(timerRef.current[numKey] as any);
        timerRef.current[numKey] = null;
      }
    });

    // schedule next poll
    scheduleNext(dayId);

    return () => {
      const t = timerRef.current[dayId];
      if (t) clearTimeout(t as any);
      timerRef.current[dayId] = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIndex]);

  // helper used by DaySelector / initial behavior
  const fetchMatchesOnce = (dayId: number) => {
    if (matchCache[dayId] !== undefined) return;
    requestMatchesOnce(dayId);
  };

  const onScrollEnd = (event: any) => {
    const rawX = event.nativeEvent.contentOffset.x;
    const ltrIndex = Math.round(rawX / SCREEN_WIDTH);
    const rtlIndex = dayList.length - 1 - ltrIndex;
    if (rtlIndex >= 0 && rtlIndex < dayList.length) {
      setSelectedDayIndex(rtlIndex);
      fetchMatchesOnce(dayList[rtlIndex].id);
    }
  };

  const listRefs = useRef<{ [key: number]: FlatList<any> | null }>({});

  const onDaySelect = (index: number) => {
    fetchMatchesOnce(dayList[index].id);

    const dayId = dayList[index].id;
    const ref = listRefs.current[dayId];
    if (ref) {
      try {
        ref.scrollToOffset({ offset: 0, animated: false });
      } catch (e) {}
    }

    const ltrIndex = dayList.length - 1 - index;
    scrollViewRef.current?.scrollToOffset({
      offset: ltrIndex * SCREEN_WIDTH,
      animated: true,
    });
  };

  // --- render ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <DaySelector
        days={dayList}
        selectedIndex={selectedDayIndex}
        onSelect={onDaySelect}
        scrollX={scrollX}
      />

      <Animated.FlatList
        ref={scrollViewRef}
        data={dayList}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={onScrollEnd}
        initialScrollIndex={dayList.length - 1 - selectedDayIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        extraData={[loadingDays, selectedDayIndex, failedDays]}
        renderItem={({ item }) => {
          const matches = matchCache[item.id];
          const isLoading = !!loadingDays[item.id];
          const isFailed = !!failedDays[item.id];

          if (isFailed && !matches) {
            return (
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <View style={styles.centered}>
                  <Text style={{ color: "#f55", marginBottom: 12 }}>
                    خطا در دریافت داده‌ها
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setFailedDays((p) => ({ ...p, [item.id]: false }));
                      requestMatchesOnce(item.id, { force: true });
                    }}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>تلاش مجدد</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          if (isLoading && !matches) {
            return (
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <View style={styles.centered}>
                  <ActivityIndicator color={"#fff"} />
                </View>
              </View>
            );
          }

          if (Array.isArray(matches) && matches.length === 0) {
            return (
              <View style={{ width: SCREEN_WIDTH }}>
                <Text style={styles.text}>هیچ بازی‌ای یافت نشد</Text>
              </View>
            );
          }

          return (
            <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
              <MatchList data={matches || []} />
              {isFailed && matches ? (
                <View style={{ position: "absolute", bottom: 12, right: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setFailedDays((p) => ({ ...p, [item.id]: false }));
                      requestMatchesOnce(item.id, { force: true });
                    }}
                    style={styles.smallRetry}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>مرور مجدد</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#aaa",
    fontSize: 16,
    marginTop: 30,
    textAlign: "center",
    width: SCREEN_WIDTH,
    fontFamily: "SFArabic-Regular",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#1f1f1fff",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
  },
  smallRetry: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
});
