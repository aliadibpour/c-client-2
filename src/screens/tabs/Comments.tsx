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
        const response: any = await TdLib.getMessageComments(chatId, messageId);

        // If your native method returns { raw: string }
        const parsed = response?.raw ? JSON.parse(response.raw) : null;

        if (!parsed || !Array.isArray(parsed.messages)) {
          setError("Failed to fetch comments or empty messages.");
          setComments([]);
        } else {
          setComments(parsed.messages);
        }

        console.log("Fetched comments:", parsed);
      } catch (err: any) {
        console.error("Error loading comments:", err);
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
        {item.content?.text?.text || "⛔️ No content"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>💬 Comments</Text>

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
