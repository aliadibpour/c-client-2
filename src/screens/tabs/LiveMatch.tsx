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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import io from "socket.io-client";
import DaySelector from "../../components/tabs/liveMatch/DaySelector";
import MatchList from "../../components/tabs/liveMatch/MatchList";
import AppText from "../../components/ui/AppText";

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

  // --- new: control when FlatList can render ---
  const [ready, setReady] = useState(false);

  // ref to avoid stale closure for selectedDayIndex in socket connect
  const selectedDayIndexRef = useRef<number>(selectedDayIndex);
  useEffect(() => {
    selectedDayIndexRef.current = selectedDayIndex;
  }, [selectedDayIndex]);

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList>(null);
  const listRefs = useRef<{ [key: number]: any | null }>({});

  // track retry timers per day to avoid duplicate timers
  const retryTimersRef = useRef<{ [id: number]: number | null }>({});

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

    return incoming.map((inc, i) => {
      const prev = prevList[i];
      if (prev && prev.id != null && inc.id === prev.id && shallowEqualImportant(prev, inc)) {
        return prev;
      }
      return { ...inc };
    });
  };

  const requestMatchesOnce = (dayId: number, { force = false } = {}) => {
    if (!force && loadingDays[dayId]) return;
    clearRetryTimer(dayId);

    const firstTime = matchCache[dayId] === undefined;
    if (firstTime) {
      setLoadingDays((p) => ({ ...p, [dayId]: true }));
      setFailedDays((p) => ({ ...p, [dayId]: false }));
    } else {
      if (force) setLoadingDays((p) => ({ ...p, [dayId]: true }));
      setFailedDays((p) => ({ ...p, [dayId]: false }));
    }

    if (!socketRef.current || !socketRef.current.connected) {
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
        setLoadingDays((p) => ({ ...p, [dayId]: false }));

        if (res && Array.isArray(res.matchList)) {
          const incoming = res.matchList;
          setMatchCache((prev) => {
            const prevList = prev ? prev[dayId] : undefined;
            const merged = mergeMatchLists(prevList, incoming);
            if (prev && prev[dayId] === merged) return prev;
            return { ...prev, [dayId]: merged };
          });

          setFailedDays((p) => ({ ...p, [dayId]: false }));
          clearRetryTimer(dayId);

          // --- NEW: mark ready when selectedDayIndex data arrives ---
          if (dayId === dayList[selectedDayIndexRef.current].id) {
            setReady(true);
          }
        } else {
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

      if (!retryTimersRef.current[dayId]) {
        retryTimersRef.current[dayId] = setTimeout(() => {
          retryTimersRef.current[dayId] = null;
          requestMatchesOnce(dayId, { force: true });
        }, 3000) as unknown as number;
      }
    }
  };

  useEffect(() => {
    socketRef.current = io("https://cornerlive.ir", {
      transports: ["websocket"],
    });

    socketRef.current.on("connect", () => {
      const dayId = dayList[selectedDayIndexRef.current].id;
      requestMatchesOnce(dayId, { force: true });

      for (const d of dayList) {
        const id = d.id;
        const hasCache = matchCache[id] !== undefined;
        const hadFailed = !!failedDays[id];
        if (!hasCache || hadFailed) {
          setTimeout(() => requestMatchesOnce(id, { force: true }), 50);
        }
      }
    });

    socketRef.current.on("disconnect", () => {
      console.log("socket disconnected");
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchMatchesOnce = (dayId: number) => {
    if (matchCache[dayId] !== undefined && !failedDays[dayId]) return;
    requestMatchesOnce(dayId);
  };

  useEffect(() => {
    const POLL_DAY_ID = 2;
    const interval = setInterval(() => {
      requestMatchesOnce(POLL_DAY_ID, { force: true });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const dayId = dayList[selectedDayIndex].id;
    fetchMatchesOnce(dayId);
  }, [selectedDayIndex]);

  const onScrollEnd = (event: any) => {
    const rawX = event.nativeEvent.contentOffset.x;
    const ltrIndex = Math.round(rawX / SCREEN_WIDTH);
    const rtlIndex = dayList.length - 1 - ltrIndex;
    if (rtlIndex >= 0 && rtlIndex < dayList.length) {
      setSelectedDayIndex(rtlIndex);
      fetchMatchesOnce(dayList[rtlIndex].id);
    }
  };

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <DaySelector
        days={dayList}
        selectedIndex={selectedDayIndex}
        onSelect={onDaySelect}
        scrollX={scrollX}
      />

      {/* === NEW: FlatList render only when ready === */}
      {ready ? (
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
          extraData={[loadingDays, selectedDayIndex]}
          initialNumToRender={1}
          windowSize={3}
          removeClippedSubviews={false}
          renderItem={({ item }) => {
            const matches = matchCache[item.id];
            const isLoading = matches === undefined ? true : !!loadingDays[item.id];

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
                  <AppText style={styles.text}>هیچ بازی‌ای یافت نشد</AppText>
                </View>
              );
            }

            return (
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <MatchList
                  data={matches || []}
                  listRef={(r: any) => (listRefs.current[item.id] = r)}
                  extraDataForList={matches}
                />
              </View>
            );
          }}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#fff" size={24} />
        </View>
      )}

      <AppText style={styles.copyright}>
        مالکیت فکری بازی ها متعلق به corner است
      </AppText>
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
  copyright: {
    color: "#555",
    fontSize: 10,
    textAlign: "center",
    paddingVertical: 5,
    paddingBottom: 0.3,
    fontFamily: "SFArabic-Regular",
  },
});
