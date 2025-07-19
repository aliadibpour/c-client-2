import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Text,
  FlatList,
  StyleSheet,
  View,
  Image,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../../components/tabs/home/MessageItem";

export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const alreadyViewed = useRef<Set<number>>(new Set());
  const pollingInterval = useRef<any>(null);

  // ✅ Polling visible messages every 3s
  const pollVisibleMessages = useCallback(() => {
    for (let id of visibleIds) {
      const msg = messages.find((m) => m.id === id);
      if (msg) {
        TdLib.getMessage(msg.chatId, msg.id)
          .then((raw: any) => {
            const full = JSON.parse(raw.raw);
            // console.log(full)
            setMessages((prev) => {
              const newMessages = [...prev];
              const idx = newMessages.findIndex((m) => m.id === id);
              if (idx !== -1) newMessages[idx] = full;
              return newMessages;
            });
          })
          .catch((err) => console.log("❌ Poll error:", err));
      }
    }
  }, [visibleIds, messages]);

  // ✅ Set up polling
  useEffect(() => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(pollVisibleMessages, 3000);
    return () => clearInterval(pollingInterval.current);
  }, [pollVisibleMessages]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      const update = JSON.parse(event.raw);
      if (update.chatId || update.messageId || update.interactionInfo) {
        const idx = messages.findIndex(
          (m) => m.chatId === update.chatId && m.id === update.messageId
        );
        if (idx !== -1) {
          try {
            const raw = await TdLib.getMessage(update.chatId, update.messageId);
            const fullMsg = JSON.parse(raw.raw);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[idx] = fullMsg;
              return newMessages;
            });
          } catch (err) {
            console.log("❌ Error updating interactionInfo:", err);
          }
        }
      }

      if (update.message) {
        const msg = update.message;
        const idx = messages.findIndex((m) => m.chatId === msg.chatId && m.id === msg.id);
        if (idx !== -1) {
          try {
            const raw = await TdLib.getMessage(msg.chatId, msg.id);
            const fullMsg = JSON.parse(raw.raw);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[idx] = fullMsg;
              return newMessages;
            });
          } catch (err) {
            console.log("❌ Error updating message:", err);
          }
        }
      }
    });

    return () => subscription.remove();
  }, [messages]);

  useEffect(() => {
    const fetchBestMessages = async () => {
      try {
        const res = await fetch("http://192.168.117.115:3000/messages/best");
        const data: { chatId: string; messageId: string }[] = await res.json();

        const allMessages: any[] = [];
        for (const { chatId, messageId } of data) {
          try {
            const raw = await TdLib.getMessage(+chatId, +messageId);
            const parsed = JSON.parse(raw.raw);
            allMessages.push(parsed);
          } catch (err) {
            console.log("❌ Error getting message:", err);
          }
        }

        setMessages(allMessages);
      } catch (error) {
        console.error("❌ Failed to fetch messages:", error);
      }
    };

    fetchBestMessages();
  }, []);

  const onViewRef = useCallback(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => vi.item.id);
    setVisibleIds(ids);

    for (let vi of viewableItems) {
      const msg = vi.item;
      if (msg.chatId && msg.id && !alreadyViewed.current.has(msg.id)) {
        TdLib.viewMessages(msg.chatId, [msg.id], false)
          .then(() => {
            alreadyViewed.current.add(msg.id);
            console.log(`👁️ Viewed message ${msg.id} in chat ${msg.chatId}`);
          })
          .catch((err: any) => {
            console.log("❌ Failed to view message:", err);
          });
      }
    }
  }, []);

  const activeDownloads = useMemo(() => {
    if (!visibleIds.length) return [];

    const selected: number[] = [];

    const currentMessageId = visibleIds[0];
    const currentIndex = messages.findIndex((msg) => msg.id === currentMessageId);

    if (currentIndex === -1) return [];

    // حدود پنج‌تایی: دو تا بالا، خود پیام، دو تا پایین‌تر
    if (currentIndex - 2 >= 0) selected.push(messages[currentIndex - 2].id);
    if (currentIndex - 1 >= 0) selected.push(messages[currentIndex - 1].id);
    selected.push(messages[currentIndex].id);
    if (currentIndex + 1 < messages.length) selected.push(messages[currentIndex + 1].id);
    if (currentIndex + 2 < messages.length) selected.push(messages[currentIndex + 2].id);

    return selected;
  }, [visibleIds, messages]);
  console.log(activeDownloads)

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Image source={require("../../../assets/images/logo.jpg")} style={styles.logo} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item?.id?.toString()}
        renderItem={({ item }: any) => (
          <MessageItem
            data={item}
            isVisible={visibleIds.includes(item.id)}
            activeDownload={activeDownloads.includes(item.id)} 
          />
        )}
        onViewableItemsChanged={onViewRef}
        viewabilityConfig={viewConfigRef.current}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={10}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 16,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingVertical: 8,
    justifyContent: "flex-end",
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 5,
    marginLeft: 5,
  },
  header: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
    position: "relative",
    bottom: 3
  },
});
