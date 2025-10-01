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
import { ArrowLeftIcon } from "../../assets/icons";
import { ArrowLeft } from "lucide-react-native";
import ChannelAlbumItem from "../../components/tabs/channel/ChannelAlbumItem";
import { useFocusEffect } from "@react-navigation/native";
import { getChat, getChatHistory, TelegramService } from "../../services/TelegramService";
import { lstat } from "fs";

const { width, height } = Dimensions.get("window");

export default function ChannelScreen({ route }: any) {
  const { chatId, focusMessageId } = route.params;

  const [messages, setMessages] = useState<any[]>([]);
  const [lastMessage, setLastMessage] = useState<any>([])
  const [chatInfo, setChatInfo] = useState<any>()
  const [supergroupInfo, setSuperGroupeInfo] = useState()
  const [isMember, setIsMember] = useState<any>("loading")
  const messagesRef = useRef<any[]>([]); // track latest messages

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // new refs for scroll preservation
  const scrollOffset = useRef(0); // current scroll offset
  const contentHeightRef = useRef(0); // last known content height
  const prevContentHeight = useRef(0); // previous content height before update
  const pendingContentAdjustment = useRef(false); // flag: waiting to adjust after content size change

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setViewableItems(viewableItems);
  });


  useEffect(() => {
    messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const chat = await getChat(chatId)
        setChatInfo(chat)


        const getSupergroup = await TdLib.getSupergroup(chat.type.supergroupId)
        const supergroup = await JSON.parse(getSupergroup.raw)
        const ismem = supergroup.status ? Object.keys(supergroup.status) : []
        setIsMember(ismem.length ? true : false)
        setSuperGroupeInfo(supergroup)

        if (chat.lastMessage) {
          setLastMessage(chat.lastMessage); // ذخیره در state
          console.log(lastMessage)
          const messages = focusMessageId ? await getChatHistory(chatId, focusMessageId, 20, -10) :
          await getChatHistory(chatId, lastMessage.id, 50, 0)
          console.log(messages, "sssssssssaaaaaaaaaaaaaawwwwwww")
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

  // **FIXED**: add new messages at start, preserve scroll position
  const handleNewMessage = (message: any) => {
    // اگر پیام تکراری باشه کاری نکن
    if (messagesRef.current.some((msg) => msg.id === message.id)) return;

    // ذخیره ارتفاع فعلی قبل از تغییر
    prevContentHeight.current = contentHeightRef.current;
    pendingContentAdjustment.current = true;

    // قرار دادن پیام جدید در ابتدای آرایه (جدیدترین اول)
    setMessages((prev) => {
      return [message, ...prev];
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
        console.log("aa")
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
        console.log(data, ";")
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
    scrollOffset.current = offsetY;
    setShowScrollToBottom(offsetY > 300);
  };

  const handleEndReached = async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const last = messages[messages.length - 1];
    const data = await getChatHistory(chatId, last.id);
    // append older messages (since inverted, older are added at end of messages array)
    if (data && data.length) {
      // preserve prev content height and mark pending adjustment
      prevContentHeight.current = contentHeightRef.current;
      pendingContentAdjustment.current = true;
      setMessages(prev => [...prev, ...data]);
    }
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
      setMessages(data)
      await new Promise(r => setTimeout(r, 100));
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      })
    }
    setShowScrollToBottom(false)
  }


  const subscribe = async () => {
    if (isMember == "loading") return

    if (isMember == true) {
      setIsMember("loading")
      await TdLib.leaveChat(chatId)
      setIsMember(false)
    }
    else {
      setIsMember("loading")
      await TdLib.joinChat(chatId)
      setIsMember(true)
    }
  }

  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null)

  const clickReply = async (messageId: number) => {
    const msgIds = messages.map(i => i.id)
    
    if (msgIds.includes(messageId)) {
      const index = messages.findIndex(i => i.id == messageId)
      // اگر از groupedMessages استفاده می‌کنید برای index-based scrolling بهتر است index از groupedMessages گرفته شود:
      const groupedIndex = groupedMessages.findIndex((item) =>
        (item.type === "single" && item.message?.id === messageId) ||
        (item.type === "album" && item.messages.some((m: any) => m.id === messageId))
      );
      if (groupedIndex !== -1) {
        listRef.current?.scrollToIndex({ index: groupedIndex, animated: true, viewPosition: .5 })
      } else {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: .5 })
      }
    } else {
      const getMessage: any = await getChatHistory(chatId, messageId, 20, -10)
      // جایگزینی داده‌ها — بعد از این onContentSizeChange موقعیت اسکرول را اصلاح می‌کند
      prevContentHeight.current = contentHeightRef.current;
      pendingContentAdjustment.current = true;
      setMessages(getMessage)
      setPendingScrollId(messageId)
    }
  }

  useEffect(() => {
    if (pendingScrollId !== null) {
      const index = messages.findIndex(i => i.id == pendingScrollId)
      if (index !== -1) {
        // بهتر است روی groupedMessages پیدا و scroll کنید تا viewable grouping هم صحیح باشه
        const groupedIndex = groupedMessages.findIndex((item) =>
          (item.type === "single" && item.message?.id === pendingScrollId) ||
          (item.type === "album" && item.messages.some((m: any) => m.id === pendingScrollId))
        );
        const finalIndex = groupedIndex !== -1 ? groupedIndex : index;
        listRef.current?.scrollToIndex({ index: finalIndex, animated: true, viewPosition: .5 })
        setPendingScrollId(null)
      }
    }
  }, [messages, pendingScrollId, groupedMessages])


  return (
    <ImageBackground
      source={require("../../assets/images/background.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <StatusBar backgroundColor="#111" barStyle="light-content" />
      <View style={styles.container}>
        <ChannelHeader chatId={chatId} chatInfo={chatInfo} superGroupeInfo={supergroupInfo} />

        {loading || !listRendered ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="white" />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          keyExtractor={(item) => item.id?.toString()}
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
                  clickReply={clickReply}
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
          <ArrowLeftIcon style={styles.arrowLeft} width={17} height={19} />
          }
        </TouchableOpacity>
      )}

      <View style={styles.stickyFooter}>
        <TouchableOpacity onPress={subscribe}>
          <Text style={isMember == true ? styles.leaveText : styles.joinText}>
          {isMember == "loading" ? <ActivityIndicator color="#888" /> : isMember ? "ترک کانال" : "عضویت"}</Text>
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
  leaveText: {
    color: "#747474ff",
    fontSize: 13,
    fontFamily: "SFArabic-Heavy",
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
});