import React, { useEffect, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  Image,
  StatusBar,
  TouchableOpacity,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";

export default function Comments() {
  const route = useRoute();
  const navigation = useNavigation();
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
          50
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
                return { ...msg, user: null };
              }
            })
          );

          // ساخت map برای دسترسی سریع به پیام‌های reply-to
          const msgMap = new Map();
          merged.forEach((m) => msgMap.set(m.id, m));

          merged.forEach((m) => {
            const replyId = m?.replyTo?.messageId;
            if (replyId) {
              const repliedMsg = msgMap.get(replyId);
              if (repliedMsg?.content?.text?.text) {
                m.replyToText = repliedMsg.content.text.text;
              }
            }
          });

          setComments(merged);
        }
      } catch (err: any) {
        setError(err?.message || "Unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [chatId, messageId]);

  const renderComment = ({ item, index }: any) => {
    const user = item?.user;
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

    const base64Thumb = user?.profilePhoto?.minithumbnail?.data
      ? `data:image/jpeg;base64,${fromByteArray(user.profilePhoto.minithumbnail.data)}`
      : null;

    const avatarUri = user?.avatarSmall || base64Thumb;
    const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

    const previousMessage = comments[index - 1];
    const showAvatar =
      !previousMessage || previousMessage?.senderId?.userId !== item?.senderId?.userId;

    return (
      <View style={styles.commentItem}>
        {showAvatar ? (
          avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={{ color: "#fff" }}>{firstLetter}</Text>
            </View>
          )
        ) : (
          <View style={{ width: 36, marginHorizontal: 8 }} />
        )}

        <View style={styles.bubbleContainer}>
          <View style={styles.bubble}>
            {item.replyToText && (
              <View style={styles.replyBox}>
                <Text numberOfLines={1} style={styles.replyText}>
                  🔁 {item.replyToText.slice(0, 30)}
                </Text>
              </View>
            )}
            {showAvatar && name ? <Text style={styles.username}>{name}</Text> : null}
            <Text style={styles.commentText}>
              {item?.content?.text?.text || "بدون متن"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground
      source={require("../../../assets/images/telBG.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <SafeAreaView style={styles.safe}>
        <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{comments.length} نظر</Text>
          <View style={{ width: 22 }} />
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
            renderItem={({ item, index }) => renderComment({ item, index })}
            inverted
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={<Text style={styles.noComments}>کامنتی وجود ندارد.</Text>}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "SFArabic-Regular",
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 6,
    paddingHorizontal: 6,
  },
  bubbleContainer: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  bubble: {
    backgroundColor: "#222",
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    maxWidth: "85%",
    minWidth: "40%",
  },
  commentText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "SFArabic-Regular",
  },
  avatar: {
    width: 34.5,
    height: 34.5,
    borderRadius: 18,
    marginHorizontal: 8,
    backgroundColor: "#444",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  username: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 4,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  replyBox: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "right",
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
