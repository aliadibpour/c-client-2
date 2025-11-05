// ===== File: LiveMatchScreen.tsx =====
import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  Animated,
  Dimensions,
  View,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
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

  // ref to avoid stale closure for selectedDayIndex in socket connect
  const selectedDayIndexRef = useRef<number>(selectedDayIndex);
  useEffect(() => {
    selectedDayIndexRef.current = selectedDayIndex;
  }, [selectedDayIndex]);

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList>(null);

  // track retry timers per day to avoid duplicate timers
  const retryTimersRef = useRef<{ [id: number]: number | null }>({});

  // helper: clear retry timer for a day
  const clearRetryTimer = (dayId: number) => {
    const t = retryTimersRef.current[dayId];
    if (t != null) {
      clearTimeout(t as unknown as number);
      retryTimersRef.current[dayId] = null;
      delete retryTimersRef.current[dayId];
    }
  };

  // ---- helper merge & shallow compare (keeps references for unchanged items) ----
  const shallowEqualImportant = (a: any, b: any) => {
    if (!a || !b) return false;
    const keys = [
      "score",
      "matchMinutes",
      "matchMinutesAfter90",
      "matchFinish",
      "matchAdjournment",
      "matchCancel",
    ];
    for (const k of keys) {
      const va = a[k] ?? null;
      const vb = b[k] ?? null;
      if (va !== vb) return false;
    }
    return true;
  };

  const mergeMatchLists = (prevList: any[] | undefined, incoming: any[]) => {
    if (!prevList) return incoming.map((m) => ({ ...m }));

    // try to reuse as many previous item references as possible
    if (prevList.length !== incoming.length) {
      const prevById = new Map<string | number, any>();
      for (const p of prevList) if (p && p.id != null) prevById.set(p.id, p);

      return incoming.map((inc) => {
        const id = inc && inc.id != null ? inc.id : null;
        const prev = id != null ? prevById.get(id) : undefined;
        if (prev && shallowEqualImportant(prev, inc)) {
          return prev;
        }
        return { ...inc };
      });
    }

    // same length: compare by index and reuse when possible
    return incoming.map((inc, i) => {
      const prev = prevList[i];
      if (prev && prev.id != null && inc.id === prev.id && shallowEqualImportant(prev, inc)) {
        return prev;
      }
      return { ...inc };
    });
  };

  // --- request function (now with auto-retry scheduling) ---
  const requestMatchesOnce = (dayId: number, { force = false } = {}) => {
    // avoid concurrent emits
    if (!force && loadingDays[dayId]) return;

    // clear any pending retry because we're attempting immediately
    clearRetryTimer(dayId);

    const firstTime = matchCache[dayId] === undefined;
    if (firstTime) {
      setLoadingDays((p) => ({ ...p, [dayId]: true }));
      setFailedDays((p) => ({ ...p, [dayId]: false }));
    } else {
      if (force) setLoadingDays((p) => ({ ...p, [dayId]: true }));
      setFailedDays((p) => ({ ...p, [dayId]: false }));
    }

    // if socket not ready, schedule a retry and keep loader state
    if (!socketRef.current || !socketRef.current.connected) {
      console.log("socket not ready, will schedule retry to fetch day", dayId);
      // schedule a retry after short delay (3s)
      if (!retryTimersRef.current[dayId]) {
        retryTimersRef.current[dayId] = setTimeout(() => {
          retryTimersRef.current[dayId] = null;
          requestMatchesOnce(dayId, { force: true });
        }, 3000) as unknown as number;
      }
      return;
    }

    const timeoutMs = 7000;
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      setLoadingDays((p) => ({ ...p, [dayId]: false }));
      setFailedDays((p) => ({ ...p, [dayId]: true }));
      console.warn(`live-match timeout for day ${dayId}`);

      // schedule retry
      if (!retryTimersRef.current[dayId]) {
        retryTimersRef.current[dayId] = setTimeout(() => {
          retryTimersRef.current[dayId] = null;
          requestMatchesOnce(dayId, { force: true });
        }, 3000) as unknown as number;
      }
    }, timeoutMs);

    try {
      socketRef.current.emit("live-match", dayId, (res: any) => {
        clearTimeout(t);
        if (timedOut) return;

        // stop loader regardless
        setLoadingDays((p) => ({ ...p, [dayId]: false }));

        if (res && Array.isArray(res.matchList)) {
          const incoming = res.matchList;

          // use merging function to try to preserve references for unchanged items
          setMatchCache((prev) => {
            const prevList = prev ? prev[dayId] : undefined;
            const merged = mergeMatchLists(prevList, incoming);
            // if merged is identical reference to prev[dayId], keep prev to avoid re-render
            if (prev && prev[dayId] === merged) return prev;
            return { ...prev, [dayId]: merged };
          });

          setFailedDays((p) => ({ ...p, [dayId]: false }));

          // success -> clear any retry timer
          clearRetryTimer(dayId);
        } else {
          // invalid payload: keep old data, mark failed and schedule retry
          setFailedDays((p) => ({ ...p, [dayId]: true }));
          if (!retryTimersRef.current[dayId]) {
            retryTimersRef.current[dayId] = setTimeout(() => {
              retryTimersRef.current[dayId] = null;
              requestMatchesOnce(dayId, { force: true });
            }, 3000) as unknown as number;
          }
        }
      });
    } catch (err) {
      clearTimeout(t);
      setLoadingDays((p) => ({ ...p, [dayId]: false }));
      setFailedDays((p) => ({ ...p, [dayId]: true }));
      console.error("socket emit error:", err);

      // schedule retry
      if (!retryTimersRef.current[dayId]) {
        retryTimersRef.current[dayId] = setTimeout(() => {
          retryTimersRef.current[dayId] = null;
          requestMatchesOnce(dayId, { force: true });
        }, 3000) as unknown as number;
      }
    }
  };

  // --- socket setup (uses selectedDayIndexRef to avoid stale closure) ---
  useEffect(() => {
    socketRef.current = io("https://cornerlive.ir:9000", {
      transports: ["websocket"],
    });

    socketRef.current.on("connect", () => {
      console.log("socket connected");
      // use the ref so we always request for the current active day
      const dayId = dayList[selectedDayIndexRef.current].id;
      requestMatchesOnce(dayId, { force: true });
    });

    socketRef.current.on("disconnect", () => {
      console.log("socket disconnected");
    });

    return () => {
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- ensure initial scroll and initial fetch after mount ---
  useEffect(() => {
    const ltrIndex = dayList.length - 1 - selectedDayIndexRef.current;
    const id = setTimeout(() => {
      scrollViewRef.current?.scrollToOffset({
        offset: ltrIndex * SCREEN_WIDTH,
        animated: false,
      });
      // ensure initial fetch attempted (if not cached)
      fetchMatchesOnce(dayList[selectedDayIndexRef.current].id);
    }, 50);

    return () => clearTimeout(id);
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polling for day id = 2 every 10 seconds
  useEffect(() => {
    const POLL_DAY_ID = 2;
    const interval = setInterval(() => {
      requestMatchesOnce(POLL_DAY_ID, { force: true });
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // start: request for active day when selectedDayIndex changes
  useEffect(() => {
    const dayId = dayList[selectedDayIndex].id;
    fetchMatchesOnce(dayId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIndex]);

  // helper used by DaySelector / initial behavior
  const fetchMatchesOnce = (dayId: number) => {
    // if we already have cached value, skip fetching
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

  const listRefs = useRef<{ [key: number]: any | null }>({});

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
        // reduced extraData: avoid passing whole matchCache (which would re-render everything)
        extraData={[loadingDays, selectedDayIndex]}
        initialNumToRender={1}
        windowSize={3}
        removeClippedSubviews={false}
        renderItem={({ item }) => {
          const matches = matchCache[item.id];
          // treat "no cached value yet" as loading so UI doesn't go blank
          const isLoading = matches === undefined ? true : !!loadingDays[item.id];
          const isFailed = !!failedDays[item.id];

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
              {/* Pass a stable ref and matches only to the MatchList child */}
              <MatchList
                data={matches || []}
                listRef={(r: any) => (listRefs.current[item.id] = r)}
                extraDataForList={matches}
              />
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

