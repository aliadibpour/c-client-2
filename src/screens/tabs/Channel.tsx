import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
  Dimensions,
} from "react-native";
import { useEffect, useState, useRef } from "react";
import TdLib from "react-native-tdlib";
import ChannelMessageItem from "../../components/tabs/channel/ChannelMessageItem";
import MessageHeader from "../../components/tabs/home/MessageHeader";
import { ViewToken } from "react-native";
import { Text } from "react-native-svg";
import ChannelHeader from "../../components/tabs/channel/ChannelHeader";

const { width, height } = Dimensions.get("window");

export default function ChannelScreen({ route }: any) {
  const { chatId } = route.params;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const [listRendered, setListRendered] = useState(false); // 👈 اضافه شده

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 });
  const listRef = useRef<FlatList>(null);
  const hasScrolledToBottom = useRef(false);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setViewableItems(viewableItems);
    }
  );

  // 👇 گرفتن پیام‌ها
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const result: any[] = await TdLib.getChatHistory(chatId, 0, 30);
        const parsed = result.map((item) => JSON.parse(item.raw_json));
        setMessages(parsed);
      } catch (err) {
        console.error("❌ Error fetching messages", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [chatId]);

  // 👇 بعد از رندر کامل FlatList، یک بار scrollToOffset بزن
  useEffect(() => {
    if (!loading && listRendered && messages.length > 0 && !hasScrolledToBottom.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      hasScrolledToBottom.current = true;
    }
  }, [loading, listRendered, messages]);

  return (
    <ImageBackground
      source={require("../../assets/images/telBG.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <View style={styles.container}>
        <ChannelHeader chatId={chatId} />

        {/* فقط وقتی هم لودینگ تموم شده و هم لیست آماده است نمایش بده */}
        {loading || !listRendered ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="white" />
          </View>
        ) : null}

        {/* FlatList حتی اگه لود کامل نشده، باید باشه تا setListRendered کار کنه */}
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
            opacity: loading || !listRendered ? 0 : 1, // مخفی کردن تا آماده شه
          }}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
          onLayout={() => setListRendered(true)} // فقط یک بار
        />
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
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
});
