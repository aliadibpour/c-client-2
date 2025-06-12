import React, { useCallback, useEffect, useState } from "react";
import { Text, FlatList, View, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../components/tabs/home/MessageItem";

export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);

  const chatId = -1001457166593;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const messages:any = await TdLib.getChatHistory(chatId, 0, 52);
        const a = messages.map((item:any) => JSON.parse(item.raw_json))
        console.log(a)
        setMessages(a)
      } catch (error) {
        console.log(error)
      }
    };

    fetchHistory();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Latest Messages</Text>
      <FlatList
        data={messages}
        //keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }:any) => (
          <MessageItem data={item}/>
        )}
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
  messageCard: {
    padding: 2,
    paddingBottom: 22,
    borderRadius: 10,
    marginBottom: 10,
    borderBottomColor: "#444",
    borderWidth: 1
  },
  messageText: {
    color: "#ddd",
    fontSize: 14,
  },
});
