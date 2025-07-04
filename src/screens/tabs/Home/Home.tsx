import React, { useEffect, useState, useRef, useCallback } from "react";
import { Text, FlatList, StyleSheet, View, Image, DeviceEventEmitter } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../../components/tabs/home/MessageItem";
import { NativeEventEmitter } from "react-native";



export default function HomeScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);


// const emitter = new NativeEventEmitter(TdLib);

// emitter.addListener("TDLibUpdate", (event) => {
//   console.log("📩 Event from native:", event);
// });

// // تست ارسال دیتا به جاوا و برگشتش
// TdLib.echoToJs({ hello: "world", from: "JS" });






useEffect(() => {
  const subscription = DeviceEventEmitter.addListener('tdlib-update', async (event) => {
    const update = JSON.parse(event.raw);

    // 🔍 تشخیص آپدیت interactionInfo برای یک پیام خاص
    if (update.chatId && update.messageId && update.interactionInfo) {
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

    // 🔍 آپدیت پیام جدید یا ویرایش‌شده
    if (update.message) {
      const msg = update.message;
      const idx = messages.findIndex(m => m.chatId === msg.chatId && m.id === msg.id);
      if (idx !== -1) {
        try {
          const raw = await TdLib.getMessage(msg.chatId, msg.id);
          const fullMsg = JSON.parse(raw.raw);

          setMessages(prev => {
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
        console.log("📥 Server returned:", data.length, "items");

        const allMessages: any[] = [];

        for (const { chatId, messageId } of data) {
          try {
            const raw = await TdLib.getMessage(+chatId, +messageId);
            const parsed = JSON.parse(raw.raw);
            console.log(parsed)
            allMessages.push(parsed);
          } catch (err) {
            console.log("❌ Error getting message:", err);
          }
        }

        setMessages(allMessages);
        console.log("📥 Loaded", allMessages.length, "messages");
      } catch (error) {
        console.error("❌ Failed to fetch messages:", error);
      }
    };

    fetchBestMessages();
  }, []);

  const onViewRef = useCallback(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => vi.item.id);
    setVisibleIds(ids);
  }, []);

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Corner</Text>
        <Image
          source={require("../../../assets/images/logo.jpg")}
          style={styles.logo}
        />
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
    justifyContent: "flex-end"
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
