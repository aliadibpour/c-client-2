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

const { width, height } = Dimensions.get("window");

const PAGE_SIZE = 15;

export default function ChannelScreen({ route }: any) {
  const { chatId } = route.params;

  const [messages, setMessages] = useState<any[]>([]);
  const messagesRef = useRef<any[]>([]); // track latest messages

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const [listRendered, setListRendered] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  const fetchMessages = async (fromMessageId: number = 0) => {
    try {
      const result: any[] = await TdLib.getChatHistory(chatId, fromMessageId, PAGE_SIZE);
      const parsed = result.map((item) => JSON.parse(item.raw_json));
      console.log("📩 parsed:", parsed.length);
      console.log(messages, "kkkkkk")
      if (fromMessageId !== 0) {
        setMessages((prev) => [...prev, ...parsed]);
      } else {
        setMessages(parsed);
      }
      
      if (parsed.length < PAGE_SIZE) {
        setHasMore(false);
      }
      
      // 👇 اگر بار اول هست و هنوز پیام‌های بیشتری باید بیاره
      if (fromMessageId === 0 && parsed.length > 0 && parsed.length < PAGE_SIZE && hasMore) {
        const last = parsed[parsed.length - 1];
        fetchMessages(last.id);
        console.log(messages, "kkkkkk")
      }

    } catch (err) {
      console.error("❌ Error fetching messages:", err);
    }
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        await fetchMessages(); // فقط پیام‌ها را لود کن
        if (isMounted) setLoading(false);
      } catch (e) {
        console.error("❌ Failed to fetch messages", e);
      }
    };

    init();

    return () => {
      isMounted = false;
      // دیگه اینجا نیازی به closeChat نیست ✅
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
    await fetchMessages(last.id);
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

  return (
    <ImageBackground
      source={require("../../assets/images/telBG.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <StatusBar backgroundColor="#111" barStyle="light-content" />
      <View style={styles.container}>
        <ChannelHeader chatId={chatId} />

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
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <ArrowLeft style={styles.arrowLeft} width={17} height={19} />
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
