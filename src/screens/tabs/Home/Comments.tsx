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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeftIcon } from "../../../assets/icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import TdLib, { getMessage } from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { ArrowLeft } from "lucide-react-native";
import MessageReactions from "../../../components/tabs/home/MessageReaction";

export default function Comments() {
  const route = useRoute();
  const navigation:any = useNavigation();
  const { chatId, messageId }: any = route.params || {};
  console.log(chatId ,messageId)

  const [comments, setComments] = useState<any[]>([]);
  const [commentsCount, setCommentsCount] = useState<any>();
  const [threadInfo, setThreadInfo] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [loadingBottom, setLoadingBottom] = useState<boolean>(false);
  const [loadingTop, setLoadingTop] = useState<boolean>(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  

  useEffect(() => {
    if (!chatId || !messageId) {
      setLoading(false);
      return;
    }

    const getThread = async () => {
      const threadResponse: any = await TdLib.getMessageThread(chatId, messageId);
      const threadParsed = threadResponse?.raw ? JSON.parse(threadResponse.raw) : null;
      console.log(threadParsed)

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
        setComments(getcomments)
      }
      getInitialcomments()
    }

  }, [threadInfo]);



  // تابع fetchComments دیگه نیازی به دریافت threadData نداره
  const fetchComments = async (fromMessageId: number, offset: number, limit: number) => {
    try {
      const threadChatId = threadInfo?.chatId;
      const threadMsg = threadInfo?.messages?.[0];

      if (!threadChatId || !threadMsg?.id) {
        return;
      }

      const historyResponse: any = await TdLib.getMessageThreadHistory(
        chatId,
        messageId,
        fromMessageId,
        offset,
        limit
      );

      const historyParsed = historyResponse?.raw ? JSON.parse(historyResponse.raw) : null;
      console.log(historyParsed);

      if (!Array.isArray(historyParsed?.messages)) {
      } else {
        const merged = await Promise.all(
          historyParsed.messages.map(async (msg: any) => {
            const userId = msg?.senderId?.userId;
            if (!userId) return { ...msg, user: null };
            // if any comment replyTo another messsageId of the main post that has reply in chat
            const isReply = msg.replyTo.messageId == threadInfo.messageThreadId ? false : true
            let replyInfo
            if (isReply) {
              const getReply = await TdLib.getMessage(msg.replyTo.chatId, msg.replyTo.messageId)
              replyInfo = await JSON.parse(getReply.raw)
            }

            try {
              const rawUser = await TdLib.getUserProfile(userId);
              const user = JSON.parse(rawUser);

              // let smallUri = null;
              // const smallId = user?.profilePhoto?.small?.id;
              // if (smallId) {
              //   const fileResult: any = await TdLib.downloadFile(smallId);
              //   const file = JSON.parse(fileResult.raw);
              //   if (file?.local?.isDownloadingCompleted && file?.local?.path) {
              //     smallUri = `file://${file.local.path}`;
              //   }
              // }



              return {
                ...msg,
                user: {
                  ...user,
                  //avatarSmall: smallUri,
                },
                replyInfo
              };
            } catch (e) {
              return { ...msg, user: null };
            }
          })
        );

        return merged.reverse()
      }
    } catch (err: any) {
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

    const previousMessage = comments[index - 1];
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
              <TouchableOpacity style={styles.replyBox} onPress={() => clickReply(item.replyTo.messageId)}>
                <Text numberOfLines={1} style={styles.replyText}>
                  🔁 {item.replyInfo?.content?.text?.text.slice(0, 30)}
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

    useEffect(() => {
      const fetchMessages = async () => {
        if (!viewableItems.length) return;
  
        const oldComments = comments.slice(0, 4).map(i => i.id)
        const newComments = comments.slice(-4).map(i => i.id)
        const currentId = viewableItems[0].item.id
        const furrentId = viewableItems[viewableItems.length - 1].item.id
        const mainMessageId = threadInfo?.messages?.[0]?.id;
        const a = await TdLib.getChatMessagePosition(threadInfo.chatId, furrentId, threadInfo.messageThreadId)
        console.log(a)


        if (oldComments.includes(currentId)) {
          if (oldComments.includes(comments[0].id)) return
          setLoadingTop(true)
          const anchorId = oldComments[oldComments.length - 1]
          const data:any = await fetchComments(anchorId, 0, 50)
          setComments(prev => {
            const ids = new Set(prev.map(m => m.id))
            const filtered = data.filter((m:any) => !ids.has(m.id))
            return [...filtered ,...prev]
          })
          setLoadingTop(false)
        }
  
        if (newComments.includes(furrentId)) {
          const newc:any = await fetchComments(0, 0, 1)
          if (comments.includes(newc[0].id)) return
          setLoadingBottom(true)
          const anchorId = newComments[newComments.length -1]
          const data:any = await fetchComments(anchorId, -49, 50)
          console.log(data, ";")
          setComments(prev => {
            const ids = new Set(prev.map(m => m.id))
            const filtered = data.filter((m:any) => !ids.has(m.id))
            return [...prev,...filtered]
          })
          setLoadingBottom(false)
        }
      }
      fetchMessages()
    }, [viewableItems])
  
  const clickReply = async (messageId:number) => {
    const messagesIds = comments.map(item => item.id)
    if (messagesIds.includes(messageId)) {
      const index = comments.findIndex(item => item.id == messageId)
      listRef.current?.scrollToIndex({index, animated: true, viewPosition: 0.5})
    }
    else {
      setLoadingTop(true)
      const getComments:any = await fetchComments(messageId, -25, 50)
      setComments(getComments)
      const index = comments.findIndex(item => item.id == messageId)
      listRef.current?.scrollToIndex({index, animated: true, viewPosition: 0.5})
    }
    setLoadingTop(false)

  }

const scrollBottom = async () => {
  const lastComment = threadInfo.replyInfo.lastMessageId;
  if (!lastComment) {
    setShowScrollToBottom(false);
    return;
  }

  if (comments.map(i => i.id).includes(lastComment)) {
    setShowScrollToBottom(false);
    listRef.current?.scrollToEnd({ animated: true });
  } else {
    setShowScrollToBottom("loading");
    const getComments: any = await fetchComments(lastComment, -1, 50);
    setComments(getComments);
  
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
    setViewableItems(viewableItems);
  });

  //handle updates
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
            handleInteractionUpdate(data);
            break;

          case "UpdateChatLastMessage":
            if (data?.lastMessage?.id === threadInfo?.replyInfo?.lastMessageId) {
              // شاید پیام اصلی باشد
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
      const exists = prev.some((msg) => msg.id === message.id);
      if (exists) return prev;
      return [...prev, message];
    });
  };

  const handleDeleteComments = (data: any) => {
    const { messageIds } = data;
    setComments((prev) => prev.filter((msg) => !messageIds.includes(msg.id)));
  };

  const handleInteractionUpdate = (data: any) => {
    console.log("intraction info calllllllllllllll")
    const { messageId, interactionInfo } = data;
    setComments((prev) =>
      prev.map((msg) => {
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
      })
    );
  };


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <ImageBackground
        source={require("../../../assets/images/background.jpg")}
        resizeMode="cover"
        style={styles.background}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <ArrowLeft color="#fff" size={22} />
            </TouchableOpacity>
            {commentsCount && <Text style={styles.headerTitle}>{commentsCount} نظر</Text>}
            <View style={{ width: 22 }} />
          </View>

          {/* Main Content */}
          <View style={{ flex: 1 }}>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" style={{ flex: 1, justifyContent: 'center' }} />
            ) : (
              <View>
                {loadingTop && <ActivityIndicator color="#888" size="small" style={{ flex: 1, justifyContent: 'center',position: "absolute", top:20, right: "50%", zIndex:2 }} />}
                <FlatList
                  ref={listRef}
                  onViewableItemsChanged={onViewableItemsChanged.current}
                  data={comments}
                  keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
                  renderItem={({ item, index }) => renderComment({ item, index })}
                  onScroll={handleScroll}
                  contentContainerStyle={{ paddingBottom: 80 }}
                  ListEmptyComponent={<Text style={styles.noComments}>کامنتی وجود ندارد.</Text>}
                />
                {loadingBottom && <ActivityIndicator color="#888" size="small" style={{ flex: 1, justifyContent: 'center', position: "absolute", bottom:20, right: "50%" }} />}
              </View>
            )}
          </View>

          {/* Fixed Bottom Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="متنت رو بنویس..."
              placeholderTextColor="#888"
              value={text}
              onChangeText={setText}
            />
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
    backgroundColor: "rgba(31, 29, 29, 1)",
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
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    marginBottom: 6,
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
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#111',
    color: '#fff',
    fontFamily: "SFArabic-Regular"

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
