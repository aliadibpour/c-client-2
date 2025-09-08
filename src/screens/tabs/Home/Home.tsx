// HomeScreen.tsx (updated)
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Text,
  FlatList,
  StyleSheet,
  View,
  Image,
  DeviceEventEmitter,
  ActivityIndicator,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../../components/tabs/home/MessageItem";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeHeader from "../../../components/tabs/home/HomeHeader";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const alreadyViewed = useRef<Set<number>>(new Set());
  const pollingInterval = useRef<any>(null);

  // polling etc (kept as you had)
  const pollVisibleMessages = useCallback(() => {
    for (let id of visibleIds) {
      const msg = messages.find((m) => m.id === id);
      if (msg) {
        TdLib.getMessage(msg.chatId, msg.id)
          .then((raw: any) => {
            const full = JSON.parse(raw.raw);
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

  useEffect(() => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(pollVisibleMessages, 3000);
    return () => clearInterval(pollingInterval.current);
  }, [pollVisibleMessages]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      const update = JSON.parse(event.raw);
      if (update.chatId || update.messageId || update.interactionInfo) {
        const idx = messages.findIndex((m) => m.chatId === update.chatId && m.id === update.messageId);
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
        const uuid:any = await AsyncStorage.getItem("userId-corner");
        // console.log(uuid?.uuid, "home uuid")
        const res = await fetch(`http://192.168.1.101:9000/feed-message?team=perspolis&uuid=${JSON.parse(uuid || '{}').uuid}`);
        //const res = await fetch(`http://192.168.1.101:9000/messages?team=perspolis`);
        const datass: { chatId: string; messageId: string, channel: string }[] = await res.json();
        const datas = datass.slice(0,30).sort((a,b) => +b.messageId - +a.messageId);
        let allMessages: any[] = [];

        const batchMessages = await Promise.all(
          datas.map(async ({ chatId, messageId, channel }) => {
            try {
              await TdLib.searchPublicChat(channel);
              await TdLib.openChat(+chatId);
              const raw = await TdLib.getMessage(+chatId, +messageId);
              const msg = JSON.parse(raw.raw);
              await TdLib.closeChat(+chatId);
              return msg;
            } catch (err) {
              console.log("❌ Error getting message:", err);
              return null;
            }
          })
        );

        allMessages = [...allMessages, ...batchMessages.filter((m:any) => m?.id)];
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
            // console.log(`👁️ Viewed message ${msg.id} in chat ${msg.chatId}`);
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

    if (currentIndex - 2 >= 0) selected.push(messages[currentIndex - 2].id);
    if (currentIndex - 1 >= 0) selected.push(messages[currentIndex - 1].id);
    selected.push(messages[currentIndex].id);
    if (currentIndex + 1 < messages.length) selected.push(messages[currentIndex + 1].id);
    if (currentIndex + 2 < messages.length) selected.push(messages[currentIndex + 2].id);

    return selected;
  }, [visibleIds, messages]);

  const openedChats = useRef<Set<number>>(new Set());
  useEffect(() => {
    const currentChatIds = new Set<number>();

    for (let id of activeDownloads) {
      const msg = messages.find((m) => m.id === id);
      if (!msg || !msg.chatId) continue;

      const chatId = msg.chatId;
      currentChatIds.add(chatId);

      if (!openedChats.current.has(chatId)) {
        TdLib.openChat(chatId)
          .then(() => {
            openedChats.current.add(chatId);
          })
          .catch((err:any) => console.log("❌ openChat error:", err));
      }

      TdLib.viewMessages(chatId, [msg.id], false)
        .catch((err:any) => console.log("❌ viewMessages error:", err));
    }

    openedChats.current.forEach((chatId) => {
      if (!currentChatIds.has(chatId)) {
        TdLib.closeChat(chatId)
          .then(() => {
            openedChats.current.delete(chatId);
          })
          .catch((err:any) => console.log("❌ closeChat error:", err));
      }
    });
  }, [activeDownloads, messages]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", (event) => {
      try {
        const update = JSON.parse(event.raw);
        const { type, data } = update;

        if (type !== "UpdateMessageInteractionInfo") return;
        const { messageId, interactionInfo, chatId } = data;
        if (!activeDownloads.includes(messageId)) return;

        setMessages((prev) =>
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
      } catch (err) {
        console.warn("❌ Invalid tdlib update:", event);
      }
    });

    return () => subscription.remove();
  }, [activeDownloads]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        const promises = Array.from(openedChats.current).map((chatId) => {
          return TdLib.closeChat(chatId)
            .then(() => {})
            .catch((err: any) => console.log("❌ closeChat on focus lost error:", err));
        });

        Promise.all(promises).then(() => {
          openedChats.current.clear();
        });
      };
    }, [])
  );

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  const { width: WINDOW_WIDTH } = Dimensions.get("window");
  const DEFAULT_HEADER = 70;

  // Animated header
  const lastYRef = useRef(0);
const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(DEFAULT_HEADER);
const translateY = useRef(new Animated.Value(0)).current;
const isHiddenRef = useRef(false);
const EXTRA_HIDE = 2;

// hide/show use measuredHeaderHeight
const hideHeader = () => {
  if (isHiddenRef.current) return;
  const target = -(measuredHeaderHeight + EXTRA_HIDE); // no insets here — measuredHeaderHeight should include safe area if HomeHeader uses it
  Animated.timing(translateY, { toValue: target, duration: 180, useNativeDriver: true }).start(() => {
    isHiddenRef.current = true;
  });
};
const showHeader = () => {
  if (!isHiddenRef.current) return;
  Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
    isHiddenRef.current = false;
  });
};


  const THRESHOLD = 10;

  const accumRef = useRef(0);        // جمع دلتا‌های جاری
const lastDirectionRef = useRef(0); // 1 = down, -1 = up, 0 = none

// حساسیت‌ها — اعداد را تست کن و تنظیم کن
const DOWN_THRESHOLD = 170; // چقدر باید به سمت پایین جمع بشه تا هید کنه (حساسیت پایین-> زیاد: عدد کوچکتر)
const UP_THRESHOLD = 130;    // چقدر باید به سمت بالا جمع بشه تا شو کنه (معمولاً کمی کمتر برای آسان‌تر نمایش)
const BIG_JUMP = 40;  

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastYRef.current;

    // update lastYRef early for stable deltas
    lastYRef.current = y;

    // ignore tiny noise
    if (Math.abs(delta) < 0.5) return;

    // big fast swipe => فوری واکنش
    if (Math.abs(delta) >= BIG_JUMP) {
      if (delta > 0) {
        // fast scroll down
        accumRef.current = 0;
        lastDirectionRef.current = 1;
        hideHeader();
      } else {
        // fast scroll up
        accumRef.current = 0;
        lastDirectionRef.current = -1;
        showHeader();
      }
      return;
    }

    const direction = delta > 0 ? 1 : -1;

    // اگر جهت تغییر کرد، ریست کن accumulator
    if (lastDirectionRef.current !== 0 && lastDirectionRef.current !== direction) {
      accumRef.current = 0;
    }

    // جمع کن دلتا (برای پایین مثبت، برای بالا منفی)
    accumRef.current += delta;
    lastDirectionRef.current = direction;

    // وقتی در جهت پایین جمع از آستانه عبور کند -> hide
    if (accumRef.current > DOWN_THRESHOLD) {
      accumRef.current = 0;
      hideHeader();
      return;
    }

    // وقتی در جهت بالا جمع از آستانه (منفی) عبور کند -> show
    if (accumRef.current < -UP_THRESHOLD) {
      accumRef.current = 0;
      showHeader();
      return;
    }

    // اگر نزدیک به بالای صفحه هستیم حتما نشان بده
    if (y <= 5) {
      accumRef.current = 0;
      lastDirectionRef.current = 0;
      showHeader();
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      {/* Animated header wrapper */}
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && Math.abs(h - measuredHeaderHeight) > 0.5) {
            setMeasuredHeaderHeight(h);
            // also ensure translateY is 0 initially
            translateY.setValue(0);
          }
        }}
        style={[
          styles.animatedHeader,
          {
            transform: [{ translateY }],
            // DO NOT set fixed height here -> prevents clipping
            // height: measuredHeaderHeight,  <-- removed
          },
        ]}
    >
        {/* If HomeHeader itself has borderBottom, better to remove it there.
            As fallback, we wrap it and set background to transparent. */}
        <View style={{ flex: 1, backgroundColor: "transparent", overflow: "hidden" }} pointerEvents="box-none">
          <HomeHeader />
        </View>
      </Animated.View>

      <View style={{ flex: 1 }}>
        {messages.length ? (
          <FlatList
            style={{ paddingHorizontal: 15 }}
            data={messages}
            keyExtractor={(item, index) => `${item?.chatId || 'c'}-${item?.id || index}`}
            renderItem={({ item }: any) =>
              item.chatId && (
                <MessageItem
                  data={item}
                  isVisible={visibleIds.includes(item.id)}
                  activeDownload={activeDownloads.includes(item.id)}
                />
              )
            }
            onViewableItemsChanged={onViewRef}
            viewabilityConfig={viewConfigRef.current}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={10}
            contentContainerStyle={{ paddingTop: measuredHeaderHeight + insets.top, paddingBottom: 40 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
          />
        ) : (
          <ActivityIndicator size={"large"} color={"#ddd"} style={{ marginTop: 120 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 25,
    justifyContent: "center",
  },
  animatedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 50,
  },
});