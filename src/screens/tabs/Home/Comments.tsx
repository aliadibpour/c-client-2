import React, { useEffect, useState } from "react";
import {
  Text,
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import { useRoute } from "@react-navigation/native";

export default function Comments() {
  const route = useRoute();
  const { chatId, messageId }: any = route.params || {};

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId || !messageId) {
      setLoading(false);
      setError("Missing chatId or messageId.");
      return;
    }

    const fetchComments = async () => {
      try {
        console.log("🔍 Step 1: Fetching message thread ID...");
        const response: any = await TdLib.getMessageComments(chatId, messageId);
        const parsed = response?.raw ? JSON.parse(response.raw) : null;

        console.log("✅ Raw response from getMessageComments:", parsed);

        //const threadId = parsed?.messageThreadId;
        // if (!threadId || typeof threadId !== "number" || threadId === 0) {
        //   setError("Could not find valid message thread ID.");
        //   console.warn("🚨 Invalid threadId:", threadId);
        //   return;
        // }

        const threadId = parsed?.messageThreadId;
        const fromMessageId = parsed?.replyInfo?.lastMessageId ?? 0;
        const limit = 20;

        // Step 2: Get thread history
        const historyResponse: any = await TdLib.getMessageThreadHistory(
          chatId,
          threadId,
          fromMessageId,
          limit
        );


        const historyParsed = historyResponse?.raw ? JSON.parse(historyResponse.raw) : null;
        console.log("🗃 Response from getMessageThreadHistory:", historyParsed);

        if (!Array.isArray(historyParsed?.messages)) {
          setError("No comments found in thread history.");
          setComments([]);
        } else {
          setComments(historyParsed.messages);
        }
      } catch (err: any) {
        console.error("🔥 Error fetching comments:", err);
        setError(err?.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [chatId, messageId]);

  const renderItem = ({ item }: any) => (
    <View style={styles.commentCard}>
      <Text style={styles.commentText}>
        {item.content?.text?.text || "No content"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Comments</Text>

      {loading ? (
        <ActivityIndicator color="#fff" size="large" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.noComments}>No comments found.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 16,
  },
  header: {
    fontSize: 24,
    color: "white",
    marginBottom: 12,
    fontWeight: "bold",
  },
  commentCard: {
    backgroundColor: "#1e1e1e",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  commentText: {
    color: "white",
    fontSize: 16,
  },
  noComments: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 20,
  },
  errorText: {
    color: "red",
    textAlign: "center",
    marginTop: 20,
  },
});
