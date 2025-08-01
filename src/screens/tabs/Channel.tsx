import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
  Dimensions,
  TouchableOpacity,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
  DeviceEventEmitter,
} from "react-native";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import TdLib from "react-native-tdlib";
import ChannelMessageItem from "../../components/tabs/channel/ChannelMessageItem";
import { ViewToken } from "react-native";
import ChannelHeader from "../../components/tabs/channel/ChannelHeader";
import { ArrowLeft } from "../../assets/icons";
import ChannelAlbumItem from "../../components/tabs/channel/ChannelAlbumItem";
import { useFocusEffect } from "@react-navigation/native";
import { getChat, getChatHistory } from "../../services/TelegramService";
import { lstat } from "fs";

const { width, height } = Dimensions.get("window");

export default function ChannelScreen({ route }: any) {
  const { chatId, focusMessageId } = route.params;

  const [messages, setMessages] = useState<any[]>([]);
  const [lastMessage, setLastMessage] = useState<any>([])
  const [chatInfo, setChatInfo] = useState<any>()
  const messagesRef = useRef<any[]>([]); // track latest messages

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const [listRendered, setListRendered] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);

  const groupedMessages = useMemo(() => groupMessagesByAlbum(messages), [messages]);

  function groupMessagesByAlbum(messages: any[]) {
    const albumMap = new Map();
    const normalMessages = [];

    for (const msg of messages) {
      if (msg.mediaAlbumId && msg.mediaAlbumId !== 0) {
        if (!albumMap.has(msg.mediaAlbumId)) {
          albumMap.set(msg.mediaAlbumId, []);
        }
        albumMap.get(msg.mediaAlbumId).push(msg);
      } else {
        normalMessages.push(msg);
      }
    }

    const grouped = [];

    for (const [albumId, albumMsgs] of albumMap) {
      const sorted = albumMsgs.sort((a: any, b: any) => a.id - b.id);
      grouped.push({
        type: "album",
        mediaAlbumId: albumId,
        messages: sorted,
        id: sorted[0].id,
      });
    }

    for (const msg of normalMessages) {
      grouped.push({
        type: "single",
        message: msg,
        id: msg.id,
      });
    }

    return grouped.sort((a, b) => b.id - a.id);
  }

  const listRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 });
  const hasScrolledToBottom = useRef(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setViewableItems(viewableItems);
  });

  const fetcher = () => {
    
  }

  useEffect(() => {
    messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const chat = await getChat(chatId)
        console.log(chat,"sss")
        setChatInfo(chat)

        if (chat.lastMessage) {
          setLastMessage(chat.lastMessage); // ذخیره در state
          console.log(lastMessage)
          const messages = focusMessageId ? await getChatHistory(chatId, focusMessageId, 20, -10) :
          await getChatHistory(chatId, lastMessage.id, 50, 0)
          if (isMounted) {
            setMessages(messages);
            setLoading(false);
          }
        }
      } catch (e) {
        console.error("❌ Failed to fetch messages", e);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      // وقتی صفحه فوکوس شد (نمایش داده شد)
      TdLib.openChat(chatId)
        .then(() => console.log("📂 Opened chat:", chatId))
        .catch((err:any) => console.log("❌ openChat error:", err));

      return () => {
        // وقتی از صفحه خارج شدیم (فوکوس از دست رفت)
        TdLib.closeChat(chatId)
          .then(() => console.log("📪 Closed chat:", chatId))
          .catch((err:any) => console.log("❌ closeChat error:", err));
      };
    }, [chatId])
  );


  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      try {
        const update = JSON.parse(event.raw);
        const { type, data } = update;
        
        if (!data || data.chatId !== chatId) return;
        console.log(update)

        switch (type) {
          case "UpdateNewMessage":
            handleNewMessage(data);
            break;
          case "UpdateChatLastMessage":
            handleNewMessage(data.lastMessage);
          break;
          case "UpdateDeleteMessages":
            handleDeleteMessages(data);
            break;
          case "UpdateMessageInteractionInfo":
            handleInteractionInfo(data);
            break;
          default:
            // آپدیت‌های غیرمفید رد می‌شن
            return;
        }

      } catch (err) {
        console.warn("Invalid tdlib update:", event);
      }
    });

    return () => subscription.remove();
  }, [chatId]);

  const handleNewMessage = (message: any) => {
    setMessages((prev) => {
      const exists = prev.some((msg) => msg.id === message.id);
      if (exists) return prev;
      return [...prev, message];
    });
  };

  const handleDeleteMessages = (data:any) => {
    const { messageIds } = data;
    setMessages(prev =>
      prev.filter(msg => !messageIds.includes(msg.id))
    );
  };

  const handleInteractionInfo = (data:any) => {
    const { messageId, interactionInfo } = data;
    setMessages(prev =>
      prev.map(msg => {
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

  useEffect(() => {
    const fetchMessages = async () => {
      if (!viewableItems.length) return;

      const newMessages = messages.slice(0, 4).map(i => i.id)
      const oldMessages = messages.slice(-4).map(i => i.id)
      const currentId = viewableItems[0].item.id

      if (oldMessages.includes(currentId)) {
        const anchorId = oldMessages[oldMessages.length - 1]
        const data = await getChatHistory(chatId, anchorId, 15, 0)
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const filtered = data.filter(m => !ids.has(m.id))
          return [...prev, ...filtered]
        })
      }

      if (newMessages.includes(currentId)) {
        console.log("alll")
        const anchorId = newMessages[0]
        const data = await getChatHistory(chatId, anchorId, 15, -15)
        console.log(data)
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const filtered = data.filter(m => !ids.has(m.id))
          return [...filtered, ...prev]
        })
      }
    }
    fetchMessages()
  }, [viewableItems])

  useEffect(() => {
    if (!loading && listRendered && messages.length > 0 && !hasScrolledToBottom.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      hasScrolledToBottom.current = true;
    }
  }, [loading, listRendered, messages]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollToBottom(offsetY > 300);
  };

  const handleEndReached = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const last = messages[messages.length - 1];
    await getChatHistory(chatId, last.id);
    setLoadingMore(false);
  };

  const activeDownloads = useMemo(() => {
    if (!viewableItems.length) return [];
    const selected = [];
    const currentMessageId = viewableItems[0]?.key;
    const currentIndex = messages.findIndex((v) => v.id == currentMessageId);
    if (currentIndex - 1 >= 0) selected.push(messages[currentIndex - 1].id);
    selected.push(messages[currentIndex].id);
    if (currentIndex + 1 < messages.length) selected.push(messages[currentIndex + 1].id);
    if (currentIndex + 2 < messages.length) selected.push(messages[currentIndex + 2].id);
    return selected;
  }, [viewableItems]);


  const hasScrolledToFocus = useRef(false);


  // for scroll in focus message
  const scrollToFocusMessage = useCallback(() => {
    if (hasScrolledToFocus.current || !focusMessageId || groupedMessages.length === 0) return;

    const focusIndex = groupedMessages.findIndex((item) => {
      if (item.type === "single") return item.message?.id === focusMessageId;
      if (item.type === "album") return item.messages.some((msg: any) => msg.id === focusMessageId);
      return false;
    });

    if (focusIndex !== -1) {
      listRef.current?.scrollToIndex({
        index: focusIndex,
        animated: false,
        viewPosition: 0.5, // وسط صفحه
      });
      hasScrolledToFocus.current = true;
    }
  }, [focusMessageId, groupedMessages]);

  useEffect(() => {
    if (!loading && listRendered && groupedMessages.length > 0) {
      scrollToFocusMessage();
    }
  }, [loading, listRendered, groupedMessages, scrollToFocusMessage]);

  const scrollBottomHandler = async () => {
    console.log(messages.map(i => i.id))
    if (messages.map(i => i.id).includes(lastMessage.id)) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    }
    else {
      setShowScrollToBottom("loading")
      const data = await getChatHistory(chatId, lastMessage.id, 50, -2)
      setMessages(prev => {
      const ids = new Set(prev.map(m => m.id))
      const filtered = data.filter(m => !ids.has(m.id))
        return [...filtered, ...prev]
      })
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      })
    }
    setShowScrollToBottom(false)
  }

  return (
    <ImageBackground
      source={require("../../assets/images/telBG.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <StatusBar backgroundColor="#111" barStyle="light-content" />
      <View style={styles.container}>
        <ChannelHeader chatId={chatId} chatInfo={chatInfo} />

        {loading || !listRendered ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="white" />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          keyExtractor={(item) => item.id.toString()}
          data={groupedMessages}
          renderItem={({ item }) => {
            if (item.type === "album") {
              return <ChannelAlbumItem data={item.messages} />;
            } else {
              const isVisible = viewableItems.some((v) => v.item?.id === item.id);
              return (
                <ChannelMessageItem
                  data={item.message}
                  isVisible={isVisible}
                  activeDownloads={activeDownloads}
                />
              );
            }
          }}
          inverted
          maintainVisibleContentPosition={{
            minIndexForVisible: 1,
          }}
          contentContainerStyle={{
            paddingBottom: 24,
            paddingTop: 4,
            opacity: loading || !listRendered ? 0 : 1,
          }}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
          onLayout={() => setListRendered(true)}
          onScroll={handleScroll}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.8}
          scrollEventThrottle={16}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="#888" />
              </View>
            ) : null
          }

        />
      </View>

      {showScrollToBottom && (
        <TouchableOpacity
          style={styles.scrollToBottomButton}
          onPress={() => scrollBottomHandler()}
        >
          {
          showScrollToBottom === "loading" ? 
          <ActivityIndicator color="#888" /> : 
          <ArrowLeft style={styles.arrowLeft} width={17} height={19} />
          }
        </TouchableOpacity>
      )}

      <View style={styles.stickyFooter}>
        <TouchableOpacity>
          <Text style={styles.joinText}>عضویت</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width,
    height,
  },
  container: {
    flex: 1,
    marginBottom: 40,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  joinText: {
    color: "#54afff",
    fontSize: 13,
    fontFamily: "SFArabic-Heavy",
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: 65,
    right: 13,
    width: 36,
    height: 36,
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
});
