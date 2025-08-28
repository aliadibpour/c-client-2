import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  Animated,
  Dimensions,
  View,
  I18nManager,
  StyleSheet
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import io from "socket.io-client";
import DaySelector from "../../components/tabs/liveMatch/DaySelector";
import MatchList from "../../components/tabs/liveMatch/MatchList";
import { text } from "node:stream/consumers";

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
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [loadingDays, setLoadingDays] = useState<{ [id: number]: boolean }>({});
  const [matchCache, setMatchCache] = useState<{ [id: number]: any[] }>({});

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList>(null);

  useEffect(() => {
    socketRef.current = io("http://192.168.1.103:3100", {
      transports: ["websocket"],
    });

    socketRef.current.on("connect", () => {
      fetchMatchesOnce(dayList[selectedDayIndex].id);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchMatchesOnce = (dayId: number) => {
    if (matchCache[dayId]) return;
    setLoadingDays((prev) => ({ ...prev, [dayId]: true }));
    socketRef.current.emit("matchesResult", dayId, (res: any) => {
      setLoadingDays((prev) => ({ ...prev, [dayId]: false }));
      if (res.matchResultExist) {
        setMatchCache((prev) => ({ ...prev, [dayId]: res.matchesResult }));
      } else {
        setMatchCache((prev) => ({ ...prev, [dayId]: [] }));
      }
    });
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

  const onDaySelect = (index: number) => {
    setSelectedDayIndex(index);
    fetchMatchesOnce(dayList[index].id);
    const ltrIndex = dayList.length - 1 - index;
    scrollViewRef.current?.scrollToOffset({
      offset: ltrIndex * SCREEN_WIDTH,
      animated: true,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0c0c0c" }}>
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
        renderItem={({ item, index }) => {
          const matches = matchCache[item.id];
          const isLoading = loadingDays[item.id];
          return (
            <View style={{ width: SCREEN_WIDTH }}>
              {isLoading ? (
                <Text style={styles.text}>در حال بارگذاری...</Text>
              ) : !matches ? (
                <Text style={styles.text}>داده‌ای وجود ندارد</Text>
              ) : matches.length === 0 ? (
                <Text style={styles.text}>هیچ بازی‌ای یافت نشد</Text>
              ) : (
                <MatchList data={matches} />
              )}
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
});
