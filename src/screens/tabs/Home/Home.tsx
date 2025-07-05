// ✅ Update to HomeScreen: Add polling for visible messages

import React, { useEffect, useState, useRef, useCallback } from "react";
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
        const res = await fetch("http://192.168.1.102:3000/messages/best");
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

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Corner</Text>
        <Image source={require("../../../assets/images/logo.jpg")} style={styles.logo} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item?.id?.toString()}
        renderItem={({ item }: any) => (
          <MessageItem data={item} isVisible={visibleIds.includes(item.id)} />
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
    alignItems: "center",
    paddingVertical: 8,
    justifyContent: "flex-end",
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginLeft: 5,
  },
  header: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
});
