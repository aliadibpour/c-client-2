import React, { useEffect, useRef, useState } from "react";
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
  DeviceEventEmitter,
  InteractionManager,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeftIcon } from "../../assets/icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import TdLib, { getMessage } from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { ArrowLeft, Reply, Send, SendHorizonal } from "lucide-react-native";
import MessageReactions from "../../components/tabs/home/MessageReaction";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import Composer from "../../components/tabs/comments/CommentsKeyboard";

type commentStateType = {comments:any[], start: number, end: number}
export default function Comments() {
  const route = useRoute();
  const navigation:any = useNavigation();
  const { chatId, messageId }: any = route.params || {};

  const [comments, setComments] = useState<commentStateType>({comments: [], start: 0, end:0});
  const [isFetching, setIsFetching] = useState(false);
  const [commentsCount, setCommentsCount] = useState<any>();
  const [threadInfo, setThreadInfo] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);
  const [text, setText] = useState('');
  const listRef = useRef<FlashListRef<any>>(null);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (!chatId || !messageId) {
      setLoading(false);
      return;
    }

    const getThread = async () => {
      const threadResponse: any = await TdLib.getMessageThread(chatId, messageId);
      const threadParsed = threadResponse?.raw ? JSON.parse(threadResponse.raw) : null;
      console.log(threadParsed)
      await TdLib.openChat(threadParsed?.chatId)
      if (threadParsed) {
        setThreadInfo(threadParsed);  // فقط اینجا Save می‌کنیم
        setCommentsCount(threadParsed.replyInfo.replyCount)
        await TdLib.openChat(threadParsed?.chatId)
      }
    };

    getThread();
  }, [chatId, messageId]);


  // این useEffect گوش می‌ده به تغییر threadInfo
  useEffect(() => {
    console.log(threadInfo)
    if (threadInfo) {
      const mainMessageId = threadInfo?.messages?.[0]?.id;
      const getInitialcomments = async () => {
        const getcomments:any = await fetchComments(mainMessageId, -20, 20);
        const getcommentStartPosition = await TdLib.getChatMessagePosition(threadInfo.chatId, getcomments[0].id, threadInfo.messageThreadId)
        const getcommentEndPosition = await TdLib.getChatMessagePosition(threadInfo.chatId, getcomments[getcomments.length -1].id, threadInfo.messageThreadId)
        console.log(getcommentStartPosition.count, getcommentEndPosition.count ,getcomments)
        setComments({
          comments: getcomments,
          start: getcommentStartPosition.count,
          end: getcommentEndPosition.count
        })

        console.log(comments)
      }
      getInitialcomments()
    }

  }, [threadInfo]);



  // تابع fetchComments دیگه نیازی به دریافت threadData نداره
const fetchComments = async (
  fromMessageId: number,
  offset: number,
  limit: number
): Promise<any[]> => {
  try {
    const threadChatId = threadInfo?.chatId;
    const threadMsg = threadInfo?.messages?.[0];

    if (!threadChatId || !threadMsg?.id) {
      return [];
    }

    // 1. گرفتن تاریخچه
    const historyResponse: any = await TdLib.getMessageThreadHistory(
      chatId,
      messageId,
      fromMessageId,
      offset,
      limit
    );
    const historyParsed = historyResponse?.raw
      ? JSON.parse(historyResponse.raw)
      : null;

    if (!Array.isArray(historyParsed?.messages)) {
      return [];
    }

    // 2. ترتیب درست (قدیمی → جدید)
    const messages = historyParsed.messages.slice().reverse();

    // 3. جمع کردن یوزرها
    const userIds = [
      ...new Set(messages.map((m: any) => m?.senderId?.userId).filter(Boolean)),
    ];
    const rawUsers = await TdLib.getUsersCompat(userIds);
    const users = JSON.parse(rawUsers);

    // تبدیل به map برای lookup سریع
    const usersMap = (users || []).reduce((acc: any, u: any) => {
      acc[u.id] = u;
      return acc;
    }, {});

    // 4. جمع کردن همه replyId هایی که نیاز داریم
    const knownIds = new Set(comments.comments.map((c) => c.id));
    const replyIds = messages
      .map((m: any) => m?.replyTo?.messageId)
      .filter(Boolean)
      .filter((id: any) => !knownIds.has(id));

    let repliesMap: Record<string, any> = {};
    if (replyIds.length > 0) {
      // chunk در صورتی که replyIds خیلی بزرگ باشه
      const chunkSize = 100;
      for (let i = 0; i < replyIds.length; i += chunkSize) {
        const chunk = replyIds.slice(i, i + chunkSize);
        try {
          const repliesResponse = await TdLib.getMessagesCompat(chatId, chunk);
          const repliesParsed = JSON.parse(repliesResponse.raw);
          (repliesParsed.messages || []).forEach((r: any) => {
            repliesMap[r.id] = r;
          });
        } catch {
          // skip errors
        }
      }
    }

    // 5. ساخت لیست پیام‌ها
    const merged = messages.map((msg: any) => {
      const userId = msg?.senderId?.userId;
      let replyInfo = null;

      if (msg?.replyTo?.messageId) {
        // اول از cache (کامنت‌های موجود)
        const existing = comments.comments.find(
          (c) => c.id === msg.replyTo.messageId
        );
        if (existing) {
          replyInfo = existing;
        } else {
          // بعد از batch repliesMap
          replyInfo = repliesMap[msg.replyTo.messageId] || null;
        }
      }

      return {
        ...msg,
        user: userId ? usersMap[userId] || null : null,
        replyInfo,
      };
    });

    return merged;
  } catch (err: any) {
    return [];
  } finally {
    setLoading(false);
  }
};


  const renderComment = ({ item, index }: any) => {
    const user = item?.user;
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

    const base64Thumb = user?.profilePhoto?.minithumbnail?.data
      ? `data:image/jpeg;base64,${fromByteArray(user.profilePhoto.minithumbnail.data)}`
      : null;

    const avatarUri = user?.avatarSmall || base64Thumb;
    const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

    const previousMessage = comments.comments[index - 1];
    const showAvatar =
      !previousMessage || previousMessage?.senderId?.userId !== item?.senderId?.userId;

    const date = new Date(item.date * 1000);
    const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;

    return (
      <View style={styles.commentItem}>
        {showAvatar ? (
          avatarUri ? (
            <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", {data: user})}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", {data: user})}>
              <View style={styles.avatarPlaceholder}>
                <Text style={{ color: "#fff" }}>{firstLetter}</Text>
              </View>
            </TouchableOpacity>
          )
        ) : (
          <View style={{ width: 36, marginHorizontal: 8 }} />
        )}

        <View style={styles.bubbleContainer}>
          <View style={styles.bubble}>
            {showAvatar && name ? <Text style={styles.username}>{name}</Text> : null}
            {item.replyInfo && (
              <TouchableOpacity style={styles.replyBox} onPress={() => handleReplyClick(item.replyInfo.id)}>
                <Reply width={19} color={"#999"} style={{position: "relative", bottom: 3}}/>
                <Text numberOfLines={1} style={styles.replyText}>
                  {item.replyInfo?.content?.text?.text.slice(0, 30)}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.commentText}>
              {item?.content?.text?.text || "بدون متن"}
            </Text>

            {item.interactionInfo?.reactions?.reactions?.length > 0 && (
              <MessageReactions
                reactions={item.interactionInfo.reactions.reactions}
                chatId={item.chatId}
                messageId={item.id}
                onReact={(emoji) => console.log("🧡", emoji)}
                customStyles={{
                  container: {
                    justifyContent: "flex-start",
                    marginTop: 8,
                    paddingHorizontal: 0,
                    marginBottom: 8,
                  },
                  reactionBox: { backgroundColor: "#333", paddingHorizontal: 0 },
                  selectedBox: { backgroundColor: "#666" },
                  emoji: { fontSize: 12 },
                  count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
                }}
              />
          )}
          </View>


        </View>
      </View>
    );
  };

  const handleEndReached = async () => {
    if (!comments || isFetching) return;
    if (comments.comments.length === 0) return;

    const lastItemId = comments.comments[comments.comments.length - 1].id;
    if (lastItemId === threadInfo.replyInfo.lastMessageId) return;

    setIsFetching(true);
    try {
      const getComments: any = await fetchComments(lastItemId, -PAGE_SIZE, PAGE_SIZE);
      if (getComments.length === 0) return;

      const pos: any = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        getComments[getComments.length - 1].id,
        threadInfo.messageThreadId
      );

      setComments((prev) => {
        const existingIds = new Set(prev.comments.map(c => c.id));
        const uniqueNew = getComments.filter((c: any) => !existingIds.has(c.id));

        return {
          ...prev,
          comments: [...prev.comments, ...uniqueNew],
          end: pos.count,
        };
      });
    } finally {
      setIsFetching(false);
    }
  };


  const handleStartReached = async () => {
    if (!comments || isFetching) return;
    if (comments.comments.length === 0) return;

    const firstItemId = comments.comments[0].id;

    setIsFetching(true);
    try {
      const limit =
        comments?.end
          ? comments.start - comments.end
          : PAGE_SIZE;

      const getComments: any =
        limit <= PAGE_SIZE
          ? await fetchComments(firstItemId, -1, limit)
          : await fetchComments(firstItemId, -1, PAGE_SIZE);

      console.log(getComments, "the data")
      if (getComments.length === 0) return;

      const pos: any = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        getComments[0].id,
        threadInfo.messageThreadId
      );

      setComments((prev) => {
        const existingIds = new Set(prev.comments.map(c => c.id));
        const uniqueNew = getComments.filter((c: any) => !existingIds.has(c.id));

        return {
          ...prev,
          comments: [...uniqueNew, ...prev.comments],
          start: pos.count,
        };
      });
    } finally {
      setIsFetching(false);
    }
  };


  const handleReplyClick = async (messageId: number) => {
    const existIndex = comments.comments.findIndex(i => i.id === messageId);

    if (existIndex !== -1) {
      // پیام موجوده → مستقیم اسکرول کن
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToIndex({
          index: existIndex,
          animated: true,
          viewPosition: 0.5,
        });
      });
    } else {
      // پیام موجود نیست → لود کن
      const getComments = await fetchComments(messageId, -PAGE_SIZE, PAGE_SIZE);

      // مرتب‌سازی
      const sortedComments = [...getComments].sort((a, b) => a.id - b.id);

      // گرفتن پوزیشن‌ها
      const startPos = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        sortedComments[sortedComments.length - 1].id,
        threadInfo.messageThreadId
      );
      const endPos = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        sortedComments[0].id,
        threadInfo.messageThreadId
      );

      // آپدیت استیت
      setComments({
        comments: sortedComments,
        start: startPos.count,
        end: endPos.count,
      });

      // ایندکس پیام هدف
      const targetIndex = sortedComments.findIndex(i => i.id === messageId);

      // اسکرول
      if (targetIndex !== -1) {
        InteractionManager.runAfterInteractions(() => {
          listRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.5,
          });
        });
      }
    }
  };


  const scrollBottom = async () => {
    console.log("scroll");
    const lastComment = threadInfo.replyInfo.lastMessageId;
    if (!lastComment) {
      setShowScrollToBottom(false);
      return;
    }

    const allIds = comments.comments.map(c => c.id);

    if (allIds.includes(lastComment)) {
      // already in state
      setShowScrollToBottom(false);
      listRef.current?.scrollToEnd({ animated: true });
    } else {
      setShowScrollToBottom("loading");

      const getComments = await fetchComments(lastComment, -1, PAGE_SIZE);
        setComments({
          comments: getComments,
          start: PAGE_SIZE,
          end: 1,
        }
      );


      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToEnd({ animated: true });
        setShowScrollToBottom(false);
      });
    }
  };



  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollToBottom(offsetY > 0);
  };
  
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    console.log(comments, "state")
    setViewableItems(viewableItems);
  });

  useEffect(() => {
    downloadVisibleProfilePhotos(viewableItems)
  }, [viewableItems])

  const downloadVisibleProfilePhotos = async (viewableItems: { item: any }[]) => {
    if (!viewableItems || viewableItems.length === 0) return;

    // Map به promises
    const downloadPromises = viewableItems.map(async ({ item }) => {
      if (item.user?.avatarSmall) return null; // قبلاً دانلود شده

      try {
        const userId = item.senderId?.userId;
        if (!userId) return null;

        const rawUser = await TdLib.getUserProfile(userId);
        const parsedUser = JSON.parse(rawUser);

        let smallUri: string | null = null;
        if (parsedUser?.profilePhoto?.small?.id) {
          const downloadRes: any = await TdLib.downloadFile(parsedUser.profilePhoto.small.id);
          const file = JSON.parse(downloadRes.raw);
          if (file?.local?.isDownloadingCompleted && file?.local?.path) {
            smallUri = `file://${file.local.path}`;
          }
        }

        return { itemId: item.id, parsedUser, smallUri };
      } catch (err) {
        console.warn("downloadVisibleProfilePhotos error:", err);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);

    // فیلتر فقط موارد موفق
    const updates = results.filter(r => r !== null) as { itemId: number, parsedUser: any, smallUri: string | null }[];

    if (updates.length === 0) return;

    setComments(prev => ({
      ...prev,
      comments: prev.comments.map(c => {
        const update = updates.find(u => u.itemId === c.id);
        if (!update) return c;
        return {
          ...c,
          user: {
            ...update.parsedUser,
            avatarSmall: update.smallUri,
          },
        };
      }),
    }));



  };

  // handle updates
useEffect(() => {
  const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
    try {
      const update = JSON.parse(event.raw);
      const { type, data } = update;

      if (!data || data.chatId !== chatId) return;

      switch (type) {
        case "UpdateNewMessage":
          handleNewComment(data);
          break;

        case "UpdateDeleteMessages":
          handleDeleteComments(data);
          break;

        case "UpdateMessageInteractionInfo":
          console.log(data)
          handleInteractionUpdate(data);
          break;

        case "UpdateChatLastMessage":
          if (data?.lastMessage?.id === threadInfo?.replyInfo?.lastMessageId) {
            handleNewComment(data.lastMessage);
          }
          break;

        default:
          return;
      }
    } catch (err) {
      console.warn("Invalid tdlib update:", event);
    }
  });

  return () => subscription.remove();
}, [chatId, messageId, threadInfo]);

const handleNewComment = (message: any) => {
  setComments((prev) => {
    const exists = prev.comments.some((msg) => msg.id === message.id);
    if (exists) return prev;

    const updatedComments = [...prev.comments, message];

    setCommentsCount((c:any) => c + 1);

    return {
      ...prev,
      comments: updatedComments,
      end: prev.end + 1, // اگر end نمایانگر تعداد کل است
    };
  });
};

const handleDeleteComments = (data: any) => {
  const { messageIds } = data;

  setComments((prev) => {
    const updatedComments = prev.comments.filter((msg) => !messageIds.includes(msg.id));

    setCommentsCount((c:any) => c - messageIds.length);

    return {
      ...prev,
      comments: updatedComments,
      end: prev.end - messageIds.length,
    };
  });
};

const handleInteractionUpdate = (data: any) => {
  const { messageId, interactionInfo } = data;

  setComments((prev) => ({
    ...prev,
    comments: prev.comments.map((msg) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          interactionInfo: {
            ...msg.interactionInfo,
            ...interactionInfo,
          },
        };
      }
      return msg;
    }),
  }));
};


  const sendComment = async (text: string) => {
    const a = await TdLib.addComment(threadInfo.chatId, threadInfo.messageThreadId, text)
    console.log(a)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0} // می‌تونی مقدار مناسب بدی
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <ImageBackground
        source={require("../../assets/images/background.jpg")}
        resizeMode="cover"
        style={styles.background}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <ArrowLeft color="#fff" size={22} />
            </TouchableOpacity>
            {commentsCount && <Text style={styles.headerTitle}>{commentsCount} کامنت</Text>}
            <View style={{ width: 22 }} />
          </View>

          {/* Main Content */}
          <View style={{ flex: 1 }}>
            {comments.comments.length == 0 ? (
              <ActivityIndicator color="#fff" size="large" style={{ flex: 1, justifyContent: 'center' }} />
            ) : (
                <FlashList
                    ref={listRef}
                    data={comments?.comments || []}
                    keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
                    renderItem={({ item, index }) => renderComment({ item, index })}
                    onViewableItemsChanged={onViewableItemsChanged.current}
                    viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
                    onScroll={handleScroll}
                    contentContainerStyle={{ paddingBottom: 0 }}

                    onEndReached={handleEndReached}
                    onStartReached={handleStartReached}
                    
                    removeClippedSubviews={false}
                    drawDistance={1000} // آیتم‌های بیشتری رو توی حافظه نگه دار

                    ListHeaderComponent={comments?.start !== commentsCount && comments.comments.length ? (
                      <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }}>
                        <ActivityIndicator color="#888" size="small" />
                      </View>
                    ) : null}
                    ListFooterComponent={comments?.end !== 1 && comments.comments.length ? (
                      <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }}>
                        <ActivityIndicator color="#888" size="small" />
                      </View>
                    ) : null}
                  />
            )}

            <Composer onSend={(text) => sendComment(text)} value={text} onChangeText={(e) => setText(e)}/>
          </View>
          

          {showScrollToBottom && (
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={() => scrollBottom()}
            >
              {showScrollToBottom === "loading" ?
                <ActivityIndicator color="#888" /> :
                <ArrowLeftIcon style={styles.arrowLeft} width={17} height={19} />
              }
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </ImageBackground>
    </KeyboardAvoidingView>
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
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  headerTitle: {
    color: "#999",
    fontSize: 15.4,
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
    backgroundColor: "rgba(31, 29, 29, 1)",
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
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
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    marginVertical: 6,
    flexDirection: "row",
    alignContent: "center",
    gap:4
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
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
  scrollToBottomButton: {
    position: "absolute",
    bottom: 65,
    right: 13,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  arrowLeft: {
    color: "#fff",
    transform: [{ rotate: "-90deg" }],
    margin: "auto",
  },
  container: {
      padding: 1,
      backgroundColor: '#000',
      flex: 1,
    },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopColor: '#333',
    backgroundColor: '#111',
    height:50,
    justifyContent: "space-between",
    paddingHorizontal:8
  },
  input: {
    color: '#fff',
    fontFamily: "SFArabic-Regular",
    flex:1,
    textAlign: "right"
  },
  preview: {
    marginTop: 20,
    color: '#fff',
  },
  reactionsContainer: {
    flexDirection: "row",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  reactionText: {
    backgroundColor: "#333",
    color: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 13,
  },

});
