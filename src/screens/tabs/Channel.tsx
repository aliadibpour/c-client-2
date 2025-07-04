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
import { useEffect, useState, useRef } from "react";
import TdLib from "react-native-tdlib";
import ChannelMessageItem from "../../components/tabs/channel/ChannelMessageItem";
import { ViewToken } from "react-native";
import ChannelHeader from "../../components/tabs/channel/ChannelHeader";
import { ArrowLeft } from "../../assets/icons";

const { width, height } = Dimensions.get("window");

const PAGE_SIZE = 15;

export default function ChannelScreen({ route }: any) {
  const { chatId } = route.params;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const [listRendered, setListRendered] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const listRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 });
  const hasScrolledToBottom = useRef(false);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setViewableItems(viewableItems);
    }
  );

  // 🟢 گرفتن پیام‌ها از سرور با fromId
  const fetchMessages = async (fromMessageId: number = 0) => {
    try {
      const result: any[] = await TdLib.getChatHistory(
        chatId,
        fromMessageId,
        PAGE_SIZE
      );
      const parsed = result.map((item) => JSON.parse(item.raw_json));
      console.log(parsed)

      // 🔄 اگر داریم لود بیشتر انجام می‌دیم، به لیست اضافه کن
      if (fromMessageId !== 0) {
        setMessages((prev) => [...prev, ...parsed]);
      } else {
        setMessages(parsed);
      }

      // ❌ اگر تعداد پیام کمتر از PAGE_SIZE بود، یعنی دیگه پیام نیست
      if (parsed.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("❌ Error fetching messages:", err);
    }
  };






  useEffect(() => {
  const subscription = DeviceEventEmitter.addListener('tdlib-update', async (event) => {
    const update = JSON.parse(event.raw);

    // تشخیص نوع آپدیت
    if (update.chatId && update.messageId && update.interactionInfo) {
      // این یعنی interactionInfo جدید رسیده

      // پیدا کردن پیام
      const idx = messages.findIndex(m => m.chatId === update.chatId && m.id === update.messageId);
      if (idx !== -1) {
        try {
          const raw = await TdLib.getMessage(update.chatId, update.messageId);
          const fullMsg = JSON.parse(raw.raw);

          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[idx] = fullMsg;
            return newMessages;
          });
        } catch (err) {
          console.log("❌ Error updating message interaction:", err);
        }
      }
    }
  });

  return () => subscription.remove();
}, [messages]);









  // 🟢 اولین بار فقط ۱۵ پیام آخر
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      await fetchMessages();
      setLoading(false);
    };

    loadInitial();
  }, [chatId]);

  // 🟢 بعد از رندر کامل اسکرول به آخرین پیام (که بالا هست)
  useEffect(() => {
    if (!loading && listRendered && messages.length > 0 && !hasScrolledToBottom.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      hasScrolledToBottom.current = true;
    }
  }, [loading, listRendered, messages]);

  // 🟢 کنترل نمایش دکمه اسکرول به پایین
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollToBottom(offsetY > 300);
  };

  // 🟢 تشخیص اسکرول به بالا و گرفتن پیام بیشتر
  const handleEndReached = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;

    setLoadingMore(true);
    const last = messages[messages.length - 1];
    await fetchMessages(last.id);
    setLoadingMore(false);
  };

  return (
    <ImageBackground
      source={require("../../assets/images/telBG.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <StatusBar
        backgroundColor="#111"
        barStyle="light-content"
      />
      <View style={styles.container}>
        <ChannelHeader chatId={chatId} />

        {loading || !listRendered ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="white" />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const isVisible = viewableItems.some((v) => v.item?.id === item.id);
            return <ChannelMessageItem data={item} isVisible={isVisible} />;
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
          onPress={() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
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
    marginBottom: 40
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
    margin: "auto"
  },
});
