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
import ChannelAlbumItem from "../../components/tabs/channel/ChannelAlbumItem";
import { useFocusEffect } from "@react-navigation/native";
import { getChat, getChatHistory, TelegramService } from "../../services/TelegramService";
import uuid from 'react-native-uuid';

const { width, height } = Dimensions.get("window");

// --- Helpers ---
const safeId = (m: any) => {
  if (!m) return undefined;
  if (typeof m === 'number') return m;
  return m?.id ?? m?.message?.id ?? undefined;
};
const isValidMessage = (m: any) => !!(m && (m.id || m.message?.id));

export default function ChannelScreen({ route }: any) {
  const { chatId, focusMessageId, cache, username } = route.params;
  console.log(chatId)

  const [messages, setMessages] = useState<any[]>([]);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const [chatInfo, setChatInfo] = useState<any>();
  const [supergroupInfo, setSuperGroupeInfo] = useState<any>();
  const [isMember, setIsMember] = useState<any>("loading");
  const messagesRef = useRef<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const [listRendered, setListRendered] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);

  // --------------- grouping + dedupe
  const groupedMessages = useMemo(() => groupMessagesByAlbum(messages), [messages]);
  function groupMessagesByAlbum(messages: any[]) {
    if (!Array.isArray(messages)) return [];

    // 1) dedupe messages by id (preserve first occurrence order)
    const seen = new Set<number | string>();
    const uniqueMessages: any[] = [];
    for (const m of messages) {
      const id = safeId(m);
      if (id === undefined) continue; // skip invalid entries
      if (!seen.has(id)) {
        seen.add(id);
        // normalize to a plain message object
        uniqueMessages.push({ ...(m.message ?? m), __original: m });
      }
    }

    const albumMap = new Map<number | string, any[]>();
    const normalMessages: any[] = [];

    for (const msg of uniqueMessages) {
      if (msg?.mediaAlbumId && msg?.mediaAlbumId !== 0) {
        if (!albumMap.has(msg.mediaAlbumId)) albumMap.set(msg.mediaAlbumId, []);
        albumMap.get(msg.mediaAlbumId)!.push(msg);
      } else {
        normalMessages.push(msg);
      }
    }

    const grouped: any[] = [];

    for (const [albumId, albumMsgs] of albumMap) {
      const sorted = albumMsgs.slice().sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));
      grouped.push({
        type: "album",
        mediaAlbumId: albumId,
        messages: sorted,
        id: sorted[0]?.id ?? undefined,
      });
    }

    for (const msg of normalMessages) {
      grouped.push({
        type: "single",
        message: msg,
        id: msg?.id,
      });
    }

    // newest first
    return grouped
      .filter(item => item?.id !== undefined)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  const listRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 });
  const hasScrolledToBottom = useRef(false);

  // new refs for scroll preservation
  const scrollOffset = useRef(0);
  const contentHeightRef = useRef(0);
  const prevContentHeight = useRef(0);
  const pendingContentAdjustment = useRef(false);

  // onViewableItemsChanged now filters out invalid tokens
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const filtered = (viewableItems || []).filter(v => !!v?.item && safeId(v?.item) !== undefined);
    setViewableItems(filtered);
  });

  // KEY MAP: map grouped-item-id -> stable uuid (preserve across renders)
  const keyMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    // add keys for current grouped items using composite key `${type}-${id}`
    for (const item of groupedMessages) {
      const mapKey = `${item.type}-${String(item.id ?? 'unknown')}`;
      if (!keyMapRef.current.has(mapKey)) keyMapRef.current.set(mapKey, String(uuid.v4()));
    }
    // remove keys that no longer exist
    const ids = new Set(groupedMessages.map(i => `${i.type}-${String(i.id ?? 'unknown')}`));
    for (const k of Array.from(keyMapRef.current.keys())) if (!ids.has(k)) keyMapRef.current.delete(k);
  }, [groupedMessages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        if (cache) {
          await TdLib.searchPublicChat(username).catch(() => null);
          //await TdLib.getChat(chatId).catch(() => null);
        }

        const chat = await getChat(chatId).catch(() => null);
        if (!isMounted) return;
        if (chat) setChatInfo(chat);

        try {
          const getSupergroup = await TdLib.getSupergroup(chat?.type?.supergroupId);
          const supergroup = getSupergroup ? JSON.parse(getSupergroup.raw) : null;
          const ismem = supergroup?.status ? Object.keys(supergroup.status) : [];
          setIsMember(ismem.length ? true : false);
          setSuperGroupeInfo(supergroup);
        } catch (e) {
          // ignore if tdlib supergroup fails
        }

        if (chat?.lastMessage) {
          setLastMessage(chat.lastMessage);
          const anchorId = focusMessageId ?? chat.lastMessage?.id;
          if (anchorId === undefined) {
            setMessages([]);
            setLoading(false);
            return;
          }

          const messagesData = focusMessageId
            ? await getChatHistory(chatId, focusMessageId, 20, -10).catch(() => [])
            : await getChatHistory(chatId, anchorId, 50, -1).catch(() => []);

          if (isMounted) {
            setMessages(Array.isArray(messagesData) ? messagesData.filter(Boolean) : []);
            setLoading(false);
          }
        } else {
          setMessages([]);
          setLoading(false);
        }
      } catch (e) {
        console.error("❌ Failed to fetch messages", e);
        setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      TdLib.openChat(chatId).catch((err: any) => console.log("❌ openChat error:", err));
      return () => TdLib.closeChat(chatId).catch((err: any) => console.log("❌ closeChat error:", err));
    }, [chatId])
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      try {
        const update = typeof event.raw === 'string' ? JSON.parse(event.raw) : event.raw;
        const { type, data } = update || {};
        if (!data || data.chatId !== chatId) return;

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
            return;
        }
      } catch (err) {
        console.warn("Invalid tdlib update:", event);
      }
    });

    return () => subscription.remove();
  }, [chatId]);

  const handleNewMessage = (message: any) => {
    if (!message || safeId(message) === undefined) return;
    if (messagesRef.current.some((msg) => safeId(msg) === safeId(message))) return;

    prevContentHeight.current = contentHeightRef.current;
    pendingContentAdjustment.current = true;

    setMessages((prev) => [message, ...(Array.isArray(prev) ? prev : [])]);
  };

  const handleDeleteMessages = (data: any) => {
    const messageIds = Array.isArray(data?.messageIds) ? data.messageIds : [];
    if (!messageIds.length) return;
    setMessages(prev => (Array.isArray(prev) ? prev.filter(msg => !messageIds.includes(safeId(msg))) : []));
  };

  const handleInteractionInfo = (data: any) => {
    const messageId = data?.messageId;
    const interactionInfo = data?.interactionInfo;
    if (messageId === undefined) return;
    setMessages(prev => (Array.isArray(prev) ? prev.map(msg => {
      if (safeId(msg) === messageId) {
        return {
          ...msg,
          interactionInfo: {
            ...msg?.interactionInfo,
            ...interactionInfo,
          },
        };
      }
      return msg;
    }) : []));
  };

  useEffect(() => {
    const fetchMessages = async () => {
      if (!viewableItems.length || !messages.length) return;

      const safeMsgs = messages.filter(Boolean);
      const newMessages = safeMsgs.slice(0, 4).map(i => safeId(i)).filter(id => id !== undefined);
      const oldMessages = safeMsgs.slice(-4).map(i => safeId(i)).filter(id => id !== undefined);
      const currentId = safeId(viewableItems[0]?.item);

      if (!currentId) return;

      if (oldMessages.includes(currentId)) {
        const anchorId = oldMessages[oldMessages.length - 1];
        if (anchorId === undefined) return;
        const data = await getChatHistory(chatId, anchorId, 15, 0).catch(() => []);
        setMessages(prev => {
          const ids = new Set((prev || []).map(m => safeId(m)));
          const filtered = (Array.isArray(data) ? data.filter(m => ids.has(safeId(m)) === false) : []);
          return [...(Array.isArray(prev) ? prev : []), ...filtered];
        });
      }

      if (newMessages.includes(currentId)) {
        const anchorId = newMessages[0];
        if (anchorId === undefined) return;
        const data = await getChatHistory(chatId, anchorId, 15, -15).catch(() => []);
        setMessages(prev => {
          const ids = new Set((prev || []).map(m => safeId(m)));
          const filtered = (Array.isArray(data) ? data.filter(m => !ids.has(safeId(m))) : []);
          return [...filtered, ...(Array.isArray(prev) ? prev : [])];
        });
      }
    };
    fetchMessages();
  }, [viewableItems]);

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
    if (loadingMore || !messages.length) return;
    setLoadingMore(true);
    const last = messages[messages.length - 1];
    const lastId = safeId(last);
    if (lastId === undefined) {
      setLoadingMore(false);
      return;
    }
    prevContentHeight.current = contentHeightRef.current;
    pendingContentAdjustment.current = true;
    const data = await getChatHistory(chatId, lastId).catch(() => []);
    if (data && data.length) setMessages(prev => [...(Array.isArray(prev) ? prev : []), ...data]);
    setLoadingMore(false);
  };

  const activeDownloads = useMemo(() => {
    if (!viewableItems.length || !messages.length) return [];
    const selected: any[] = [];
    const currentMessageId = safeId(viewableItems[0]?.item);
    if (currentMessageId === undefined) return [];
    const currentIndex = messages.findIndex((v) => safeId(v) === currentMessageId);
    if (currentIndex === -1) return [];
    if (currentIndex - 1 >= 0) selected.push(safeId(messages[currentIndex - 1]));
    selected.push(safeId(messages[currentIndex]));
    if (currentIndex + 1 < messages.length) selected.push(safeId(messages[currentIndex + 1]));
    if (currentIndex + 2 < messages.length) selected.push(safeId(messages[currentIndex + 2]));
    return selected.filter(Boolean);
  }, [viewableItems, messages]);

  const hasScrolledToFocus = useRef(false);

  const scrollToFocusMessage = useCallback(() => {
    if (hasScrolledToFocus.current || !focusMessageId || groupedMessages.length === 0) return;

    const focusIndex = groupedMessages.findIndex((item) => {
      if (!item) return false;
      if (item.type === "single") return safeId(item.message) === focusMessageId;
      if (item.type === "album") return Array.isArray(item.messages) && item.messages.some((msg: any) => safeId(msg) === focusMessageId);
      return false;
    });

    if (focusIndex !== -1) {
      listRef.current?.scrollToIndex({ index: focusIndex, animated: false, viewPosition: 0.5 });
      hasScrolledToFocus.current = true;
    }
  }, [focusMessageId, groupedMessages]);

  useEffect(() => {
    if (!loading && listRendered && groupedMessages.length > 0) scrollToFocusMessage();
  }, [loading, listRendered, groupedMessages, scrollToFocusMessage]);

  const scrollBottomHandler = async () => {
    const lastId = safeId(lastMessage);
    if (lastId !== undefined && messages.some(m => safeId(m) === lastId)) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }

    setShowScrollToBottom("loading");
    const data = (lastId !== undefined) ? await getChatHistory(chatId, lastId, 50, -2).catch(() => []) : [];
    if (Array.isArray(data) && data.length) setMessages(data);
    // small delay then scroll
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    setShowScrollToBottom(false);
  };

  const subscribe = async () => {
    if (isMember === "loading") return;
    try {
      setIsMember("loading");
      if (isMember === true) {
        await TdLib.leaveChat(chatId);
        setIsMember(false);
      } else {
        await TdLib.joinChat(chatId);
        setIsMember(true);
      }
    } catch (e) {
      console.warn(e);
      setIsMember(false);
    }
  };

  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);

  const clickReply = async (messageId: number) => {
    if (messageId === undefined || messageId === null) return;
    const msgIds = messages.map(i => safeId(i));

    if (msgIds.includes(messageId)) {
      const groupedIndex = groupedMessages.findIndex((item) =>
        (item.type === "single" && safeId(item.message) === messageId) ||
        (item.type === "album" && Array.isArray(item.messages) && item.messages.some((m: any) => safeId(m) === messageId))
      );
      if (groupedIndex !== -1) {
        listRef.current?.scrollToIndex({ index: groupedIndex, animated: true, viewPosition: .5 });
      } else {
        const index = messages.findIndex(i => safeId(i) === messageId);
        if (index !== -1) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: .5 });
      }
    } else {
      prevContentHeight.current = contentHeightRef.current;
      pendingContentAdjustment.current = true;
      const getMessage: any = await getChatHistory(chatId, messageId, 20, -10).catch(() => []);
      setMessages(Array.isArray(getMessage) ? getMessage : []);
      setPendingScrollId(messageId);
    }
  };

  useEffect(() => {
    if (pendingScrollId !== null) {
      const index = messages.findIndex(i => safeId(i) === pendingScrollId);
      if (index !== -1) {
        const groupedIndex = groupedMessages.findIndex((item) =>
          (item.type === "single" && safeId(item.message) === pendingScrollId) ||
          (item.type === "album" && Array.isArray(item.messages) && item.messages.some((m: any) => safeId(m) === pendingScrollId))
        );
        const finalIndex = groupedIndex !== -1 ? groupedIndex : index;
        listRef.current?.scrollToIndex({ index: finalIndex, animated: true, viewPosition: .5 });
        setPendingScrollId(null);
      }
    }
  }, [messages, pendingScrollId, groupedMessages]);

  return (
    <ImageBackground
      source={require("../../assets/images/q.jpg")}
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
          keyExtractor={(item, index) => {
            if (!item) return `empty-${index}`;
            const mapKey = `${item.type}-${String(item.id ?? 'unknown')}`;
            return keyMapRef.current.get(mapKey) || `${mapKey}-${index}`;
          }}
          data={groupedMessages}
          extraData={messages}
          renderItem={({ item }) => {
            if (!item) return null;
            if (item.type === "album") {
              return <ChannelAlbumItem data={item.messages ?? []} />;
            } else {
              const isVisible = viewableItems.some((v) => safeId(v?.item) === item.id);
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
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 4, opacity: loading || !listRendered ? 0 : 1 }}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
          onLayout={() => setListRendered(true)}
          onScroll={handleScroll}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.8}
          scrollEventThrottle={16}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator color="#888" />
            </View>
          ) : null}
          removeClippedSubviews={false}
          maxToRenderPerBatch={10}
        />
      </View>

      {showScrollToBottom && (
        <TouchableOpacity style={styles.scrollToBottomButton} onPress={() => scrollBottomHandler()}>
          {showScrollToBottom === "loading" ? <ActivityIndicator color="#888" /> : <ArrowLeftIcon style={styles.arrowLeft} width={17} height={19} />}
        </TouchableOpacity>
      )}

      <View style={styles.stickyFooter}>
        <TouchableOpacity onPress={subscribe}>
          <Text style={isMember == true ? styles.leaveText : styles.joinText}>
            {isMember == "loading" ? <ActivityIndicator color="#888" /> : isMember ? "ترک کانال" : "عضویت"}
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width, height },
  container: { flex: 1, marginBottom: 40 },
  loadingContainer: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", zIndex: 1 },
  stickyFooter: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#111", paddingVertical: 12, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  joinText: { color: "#54afff", fontSize: 13, fontFamily: "SFArabic-Heavy" },
  leaveText: { color: "#747474ff", fontSize: 13, fontFamily: "SFArabic-Heavy" },
  scrollToBottomButton: { position: "absolute", bottom: 65, right: 13, width: 38, height: 38, borderRadius: 20, backgroundColor: "#222", justifyContent: "center", alignItems: "center", elevation: 4 },
  arrowLeft: { color: "#fff", transform: [{ rotate: "-90deg" }], margin: "auto" },
});
