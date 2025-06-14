import React, { useEffect, useRef, useState } from "react";
import { Text, View, ScrollView, PanResponder } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import io from "socket.io-client";
import DaySelector from "../../components/tabs/liveMatch/DaySelector";
import MatchList from "../../components/tabs/liveMatch/MatchList";

const dayList = [
  { title: "پریروز", id: 1 },
  { title: "دیروز", id: 2 },
  { title: "امروز", id: 3 },
  { title: "فردا", id: 4 },
  { title: "پس‌فردا", id: 5 },
];

export default function LiveMatchScreen() {
  const socketRef = useRef<any>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(1);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    socketRef.current = io("http://192.168.1.102:3000", {
      transports: ["websocket"],
    });

    socketRef.current.on("connect", () => {
      console.log("✅ Connected to Socket.IO server");
      fetchMatches(dayList[selectedDayIndex].id);
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (socketRef.current?.connected) {
      fetchMatches(dayList[selectedDayIndex].id);
    }
  }, [selectedDayIndex]);

  const fetchMatches = (dayId: number) => {
    setLoading(true);
    setErrorText("");
    socketRef.current.emit("matchesResult", dayId, (response: any) => {
      setLoading(false);
      if (response.matchResultExist) {
        setLiveMatches(response.matchesResult);
      } else if (response.message === "no match") {
        setLiveMatches([]);
        setErrorText("هیچ بازی‌ای برای این روز یافت نشد");
      } else {
        setLiveMatches([]);
        setErrorText("خطا در دریافت داده‌ها");
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 20,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 50 && selectedDayIndex > 0) {
          setSelectedDayIndex((prev) => prev - 1);
        } else if (gesture.dx < -50 && selectedDayIndex < dayList.length - 1) {
          setSelectedDayIndex((prev) => prev + 1);
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0c0c0c" }}>
      <DaySelector
        days={dayList}
        selectedIndex={selectedDayIndex}
        onSelect={setSelectedDayIndex}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: 40 }} {...panResponder.panHandlers}>
        {loading ? (
          <Text style={{ color: "#aaa", fontSize: 16, marginTop: 30, textAlign: "center" }}>
            در حال بارگذاری...
          </Text>
        ) : errorText ? (
          <Text style={{ color: "#aaa", fontSize: 16, marginTop: 30, textAlign: "center" }}>
            {errorText}
          </Text>
        ) : liveMatches.length === 0 ? (
          <Text style={{ color: "#aaa", fontSize: 16, marginTop: 30, textAlign: "center" }}>
            بازی زنده‌ای یافت نشد
          </Text>
        ) : (
          <MatchList data={liveMatches} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
