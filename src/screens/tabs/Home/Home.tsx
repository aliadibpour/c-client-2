import React, { useEffect, useState, useRef } from "react";
import { Text, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../../components/tabs/home/MessageItem";

export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);

  useEffect(() => {
    const fetchBestMessages = async () => {
      try {
        const res = await fetch("http://192.168.1.100:3000/messages/best");
        const data: { chatId: string; messageId: string }[] = await res.json();
        console.log("📥 Server returned:", data.length, "items");

        const allMessages: any[] = [];

        for (const { chatId, messageId } of data) {
          try {
            const raw = await TdLib.getMessage(+chatId, +messageId);
            const parsed = JSON.parse(raw.raw);
            console.log("📥 Fetched message:", parsed);
            allMessages.push(parsed);
          } catch (err) {
            console.log("❌ Error getting message:", err);
          }
        }

        setMessages(allMessages);
        console.log("📥 Loaded", allMessages.length, "messages");
      } catch (error) {
        console.error("❌ Failed to fetch messages:", error);
      }
    };

    fetchBestMessages();
  }, []);

  const onViewRef = useRef(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => vi.item.id);
    setVisibleIds(ids);
  });

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Corner</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }: any) => (
          <MessageItem data={item} isVisible={visibleIds.includes(item.id)} />
        )}
        onViewableItemsChanged={onViewRef.current}
        viewabilityConfig={viewConfigRef.current}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 16,
  },
  header: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 16,
    textAlign: "right",
    paddingHorizontal: 10
  },
});
