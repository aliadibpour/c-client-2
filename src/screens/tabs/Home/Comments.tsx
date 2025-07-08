import React, { useEffect, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import { useRoute } from "@react-navigation/native";
import { fromByteArray } from "base64-js"; // ← برای Base64

export default function Comments() {
  const route = useRoute();
  const { chatId, messageId }: any = route.params || {};

  const [mainMessage, setMainMessage] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
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
        const threadResponse: any = await TdLib.getMessageThread(chatId, messageId);
        const threadParsed = threadResponse?.raw ? JSON.parse(threadResponse.raw) : null;

        const threadChatId = threadParsed?.chatId;
        const threadMsg = threadParsed?.messages?.[0];

        if (!threadChatId || !threadMsg?.id) {
          setError("❌ Thread data not found.");
          return;
        }

        setMainMessage(threadMsg);

        const historyResponse: any = await TdLib.getMessageThreadHistory(
          threadChatId,
          threadMsg.id,
          0,
          20
        );

        const historyParsed = historyResponse?.raw ? JSON.parse(historyResponse.raw) : null;

        if (!Array.isArray(historyParsed?.messages)) {
          setError("No comments found.");
          setComments([]);
        } else {
          const merged = await Promise.all(
            historyParsed.messages.map(async (msg: any) => {
              const userId = msg?.senderId?.userId;
              if (!userId) return { ...msg, user: null };

              try {
                const rawUser = await TdLib.getUserProfile(userId);
                const user = JSON.parse(rawUser);

                // تلاش برای دانلود نسخه کوچک تصویر پروفایل
                let smallUri = null;
                const smallId = user?.profilePhoto?.small?.id;
                if (smallId) {
                  const fileResult: any = await TdLib.downloadFile(smallId);
                  const file = JSON.parse(fileResult.raw);
                  if (file?.local?.isDownloadingCompleted && file?.local?.path) {
                    smallUri = `file://${file.local.path}`;
                  }
                }

                return {
                  ...msg,
                  user: {
                    ...user,
                    avatarSmall: smallUri,
                  },
                };
              } catch (e) {
                console.warn("User info failed:", userId);
                return { ...msg, user: null };
              }
            })
          );

          setComments(merged);
        }
      } catch (err: any) {
        console.error("🔥 Error:", err);
        setError(err?.message || "Unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [chatId, messageId]);

  const getColorForUser = (key: string | number) => {
    const colors = [
      "#FFA726",
      "#66BB6A",
      "#42A5F5",
      "#AB47BC",
      "#FF7043",
      "#26C6DA",
      "#D4E157",
    ];
    const index =
      typeof key === "string"
        ? key.charCodeAt(0) % colors.length
        : Number(key) % colors.length;
    return colors[index];
  };

  const renderComment = ({ item }: any) => {
    const user = item?.user;
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

    const base64Thumb = user?.profilePhoto?.minithumbnail?.data
      ? `data:image/jpeg;base64,${fromByteArray(user.profilePhoto.minithumbnail.data)}`
      : null;

    const avatarUri = user?.avatarSmall || base64Thumb;
    const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

    return (
      <View style={styles.commentCard}>
        {avatarUri ? (
          <View style={{flexDirection: "row", alignItems: "center"}}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            {name ? <Text style={styles.usernameText}>{name}</Text> : null}
          </View>
        ) : (
          <View style={{flexDirection: "row", alignItems: "center"}}>
              <View
              style={[
                styles.avatar,
                {
                  backgroundColor: getColorForUser(user?.id || 0),
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
            >
              <Text style={{ color: "white", fontSize: 16 }}>{firstLetter}</Text>
            </View>
            {name ? <Text style={styles.usernameText}>{name}</Text> : null}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.commentText}>
            {item?.content?.text?.text || "بدون متن"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator color="#fff" size="large" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          {mainMessage && (
            <View style={styles.commentCard}>
              <Text style={styles.commentText}>{mainMessage?.content?.text?.text}</Text>
            </View>
          )}
          <FlatList
            data={comments}
            keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
            renderItem={renderComment}
            ListEmptyComponent={
              <Text style={styles.noComments}>کامنتی وجود ندارد.</Text>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 10,
  },
  commentCard: {
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  commentText: {
    color: "#fff",
    fontSize: 14.3,
    lineHeight: 24,
    fontFamily: "SFArabic-Regular",
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: "#222",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#444",
    marginRight: 10,
  },
  usernameText: {
    color: "#ccc",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
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
