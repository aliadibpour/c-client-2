import React, { useEffect, useRef, useState } from "react";
import { Text, View, FlatList, Pressable, Image, Dimensions, ScrollView, PanResponder } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import io from "socket.io-client";

const { width } = Dimensions.get("window");

const dayList = [
  { title: "دیروز", id: 2 },
  { title: "امروز", id: 3 },
  { title: "فردا", id: 4 },
  { title: "پس‌فردا", id: 5 },
];

export default function LiveMatchScreen() {
  const socketRef = useRef<any>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(1); // index of "امروز"
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // اتصال اولیه به سوکت
  useEffect(() => {
    socketRef.current = io("http://192.168.1.101:3000", {
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

  // تغییر روز
  useEffect(() => {
    if (socketRef.current?.connected) {
      fetchMatches(dayList[selectedDayIndex].id);
    }
  }, [selectedDayIndex]);

  // دریافت اطلاعات بازی‌ها
  const fetchMatches = (dayId: number) => {
    setLoading(true);
    setErrorText("");
    socketRef.current.emit("matchesResult", dayId, (response: any) => {
        console.log(response)
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

  // برای Swipe (کشیدن انگشت چپ و راست)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 20,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 50 && selectedDayIndex > 0) {
          setSelectedDayIndex((prev) => prev - 1); // به روز قبل برو
        } else if (gesture.dx < -50 && selectedDayIndex < dayList.length - 1) {
          setSelectedDayIndex((prev) => prev + 1); // به روز بعد برو
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0c0c0c" }}>
      {/* انتخاب روز */}
      <FlatList
        horizontal
        data={dayList}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setSelectedDayIndex(index)}
            style={{
              marginRight: 12,
              paddingVertical: 8,
              paddingHorizontal: 18,
              borderRadius: 10,
              height: 42,
              justifyContent: "center",
              backgroundColor: index === selectedDayIndex ? "#1e90ff" : "#2c2c2e",
              borderWidth: index === selectedDayIndex ? 0 : 1,
              borderColor: "#444",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{item.title}</Text>
          </Pressable>
        )}
      />

      {/* لیست لیگ‌ها و بازی‌ها با پشتیبانی از Swipe */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        {...panResponder.panHandlers}
      >
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
          liveMatches.map((leagueItem: any, index: number) => (
            <View key={index} style={{ marginBottom: 24 }}>
              {/* نام لیگ */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Image
                  source={{ uri: leagueItem.leagueImage }}
                  style={{ width: 24, height: 24, marginRight: 8, borderRadius: 6 }}
                />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {leagueItem.league}
                </Text>
              </View>

              {/* لیست بازی‌ها */}
              <View style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 10 }}>
                {leagueItem.matchList.map((match: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 6,
                      borderBottomWidth: i !== leagueItem.matchList.length - 1 ? 1 : 0,
                      borderColor: "#333",
                    }}
                  >
                    <Image
                    source={{ uri: match.homeTeamImage }}
                    style={{ width: 24, height: 24, marginRight: 8, borderRadius: 6 }}
                    />
                    <Text style={{ color: "#ddd", fontSize: 14 }}>{match.homeTeam}</Text>
                    <Text style={{ color: "#888" }}>vs</Text>
                    <Text style={{ color: "#ddd", fontSize: 14 }}>{match.awayTeam}</Text>
                    <Image
                    source={{ uri: match.awayTeamImage }}
                    style={{ width: 24, height: 24, marginRight: 8, borderRadius: 6 }}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
