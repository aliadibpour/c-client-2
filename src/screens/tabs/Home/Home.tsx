import React, { useEffect, useState, useRef } from "react";
import { Text, FlatList, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../../components/tabs/home/MessageItem";

export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const chatId = -1001457166593;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const messages: any = await TdLib.getChatHistory(chatId, 0, 23);
        const parsed = messages.map((item: any) => JSON.parse(item.raw_json));
        console.log("Fetched messages:", parsed);
        setMessages(parsed);
      } catch (error) {
        console.log(error);
      }
    };

    fetchHistory();
  }, []);

  const onViewRef = useRef(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => vi.item.id);
    setVisibleIds(ids);
  });

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Latest Messages</Text>
      <FlatList
        data={messages}
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
  },
});
