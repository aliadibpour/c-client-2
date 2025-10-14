import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  SafeAreaView as RNSSafeAreaView,
} from "react-native";
import TelegramHeader from "../../components/tabs/telegram/TelegramHeader";
import ChannelItem from "../../components/tabs/telegram/ChannelItem";

export default function TelegramScreen() {
  const [channels, setChannels] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);

  // شمارش و نگه‌داری اینکه کدام آیتم‌ها آماده شدند
  const totalRef = useRef(0);
  const readySetRef = useRef(new Set<string | number>());

  useEffect(() => {
    const fetchChannelsList = async () => {
      setGlobalLoading(true);
      try {
        const res: any = await fetch(
          `http://10.129.21.115:9000/feed-channel?team=perspolis`
        );
        const data = await res.json();

        // فرض می‌کنیم `data` آرایه‌ای از کانال‌هاست (با id یا username)
        setChannels(Array.isArray(data) ? data : []);
        totalRef.current = Array.isArray(data) ? data.length : 0;

        // اگر هیچ کانالی نباشه دیگه نیازی به لودینگ نیست
        if (!Array.isArray(data) || data.length === 0) {
          setGlobalLoading(false);
        } else {
          // آماده شدن وقتی ChannelItemها خبر بدن مدیریت میشه
          setGlobalLoading(true);
          readySetRef.current.clear();
        }
      } catch (err) {
        console.error("fetchChannelsList error:", err);
        setChannels([]);
        totalRef.current = 0;
        setGlobalLoading(false);
      }
    };

    fetchChannelsList();
  }, []);

  // handler که هر ChannelItem وقتی آماده شد صدا می‌زنه
  const handleItemReady = (uniqueId: string | number | null | undefined) => {
    const key = uniqueId ?? "__unknown__" + Math.random();
    readySetRef.current.add(String(key));
    // وقتی همه آیتم‌ها آماده شدند
    if (totalRef.current > 0 && readySetRef.current.size >= totalRef.current) {
      setGlobalLoading(false);
    }
  };

  return (
    <RNSSafeAreaView style={styles.safe}>
      <TelegramHeader />
      <View style={styles.container}>
        <FlatList
          data={channels}
          keyExtractor={(item, index) =>
            (item?.id && String(item.id)) ||
            (item?.username && String(item.username)) ||
            index.toString()
          }
          renderItem={({ item }) => (
            // hideLocalLoading=false => ChannelItem خودش لودینگ رو نشون نده (ما لودینگ کلی داریم)
            <ChannelItem
              channel={item}
              onReady={handleItemReady}
            />
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />

        {/* overlay لودینگ کلی */}
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
  loadingText: {
    color: "#888",
    marginTop: 8,
  },
});
