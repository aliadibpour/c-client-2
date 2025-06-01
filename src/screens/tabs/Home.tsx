import React, { useEffect, useState } from "react";
import { Text, FlatList, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import { TelegramService } from "../../services/TelegramService"; // Optional if unused

export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);

  const chatId = -1001457166593;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await TdLib.getChatHistory(chatId, 0, 30);
        console.log(history)

        // Extract text from messages
        const textMessages = history
          .filter((msg: any) => msg?.content.caption) // Make sure it has text
          .map((msg: any) => ({
            id: msg.id,
            text: msg.content.caption,
          }));

        setMessages(textMessages);
      } catch (err) {
        console.log("Error fetching history:", err);
      }
    };

    fetchHistory();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Latest Messages</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000", // Black background like Platform X
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
