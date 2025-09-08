// screens/HomeScreen.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
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
import normalizeServerMessage from "../../../utils/normalizeServerMessage";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const alreadyViewed = useRef<Set<number>>(new Set());
  const openedChats = useRef<Set<number>>(new Set());

  // fetch initial messages from server (normalized)
  useEffect(() => {
    const fetchBestMessages = async () => {
      try {
        const res = await fetch(`http://10.226.97.115:9000/messages?team=perspolis`);
        const serverList: any[] = await res.json();
        console.log(serverList)
        const normalized = serverList
          .map((s) => normalizeServerMessage(s))
          .filter(Boolean)
          .slice(0, 30)
          .sort((a: any, b: any) => +b.id - +a.id);

        setMessages(normalized);
      } catch (error) {
        console.error("❌ Failed to fetch messages:", error);
      }
    };

    fetchBestMessages();
  }, []);

  // viewability callback just updates visibleIds — activeDownloads effect handles open/view/download
  const onViewRef = useCallback(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => String(vi.item.id));
    setVisibleIds(ids);

    // optional: mark view immediately via TdLib.viewMessages for items visible (keeps counts updated)
    // (This will only work if you want client to call viewMessages; else send to server endpoint)
    for (let vi of viewableItems) {
      const msg = vi.item;
      if (msg.chatId && msg.id && !alreadyViewed.current.has(Number(msg.id))) {
        TdLib.viewMessages(Number(msg.chatId), [Number(msg.id)], false)
          .then(() => {
            alreadyViewed.current.add(Number(msg.id));
          })
          .catch((err: any) => {
            // ignore if cannot view
          });
      }
    }
  }, []);

  // compute activeDownloads (near current visible top)
  const activeDownloads = useMemo(() => {
    if (!visibleIds.length) return [];

    const selected: string[] = [];
    const currentMessageId = visibleIds[0];
    const currentIndex = messages.findIndex((msg) => String(msg.id) === String(currentMessageId));
    if (currentIndex === -1) return [];

    if (currentIndex - 2 >= 0) selected.push(String(messages[currentIndex - 2].id));
    if (currentIndex - 1 >= 0) selected.push(String(messages[currentIndex - 1].id));
    selected.push(String(messages[currentIndex].id));
    if (currentIndex + 1 < messages.length) selected.push(String(messages[currentIndex + 1].id));
    if (currentIndex + 2 < messages.length) selected.push(String(messages[currentIndex + 2].id));

    return selected;
  }, [visibleIds, messages]);

  // activeDownloads effect: ensure openChat, getMessage, viewMessages, download media (small concurrency)
  useEffect(() => {
    let cancelled = false;
    const concurrency = 3;
    let running = 0;
    const queue: string[] = [...activeDownloads];

    async function worker() {
      while (queue.length && !cancelled) {
        if (running >= concurrency) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        const id = queue.shift();
        if (!id) continue;
        running++;
        try {
          const msg = messages.find((m) => String(m.id) === String(id));
          if (!msg) {
            running--;
            continue;
          }
          const chatIdNum = Number(msg.chatId);

          // open chat if not opened
          if (!openedChats.current.has(chatIdNum)) {
            try {
              if (msg.channel) {
                await TdLib.searchPublicChat(msg.channel).catch(() => {});
              }
              await TdLib.openChat(chatIdNum);
              openedChats.current.add(chatIdNum);
            } catch (e) {
              // open failed
            }
          }

          // view message once (client side)
          if (!alreadyViewed.current.has(Number(id))) {
            try {
              await TdLib.viewMessages(chatIdNum, [Number(id)], false);
              alreadyViewed.current.add(Number(id));
            } catch (e) {}
          }

          // get fresh message to populate local file info
          try {
            const raw = await TdLib.getMessage(chatIdNum, Number(id));
            const fresh = JSON.parse(raw.raw);
            const normalized = normalizeServerMessage(fresh);

            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.findIndex((x) => String(x.id) === String(id));
              if (idx !== -1) copy[idx] = normalized;
              return copy;
            });

            // attempt media downloads (adapt download API to your wrapper)
            const content = fresh?.content ?? {};
            if (content.photo) {
              const sizes = content.photo.sizes ?? [];
              const best = sizes[sizes.length - 1] ?? sizes[0];
              const photoObj = best?.photo ?? best;
              const local = photoObj?.local;
              const remote = photoObj?.remote;
              if (local && !local.is_downloading_completed) {
                try {
                  // Replace with real download API if your wrapper differs:
                  await (TdLib as any).downloadFile?.(photoObj) ?? Promise.resolve();
                } catch (e) {}
              } else if (remote && (!local || !local.is_downloading_completed)) {
                try {
                  await (TdLib as any).downloadFile?.(remote.id ?? remote) ?? Promise.resolve();
                } catch (e) {}
              }
            }

            if (content.video) {
              const videoObj = content.video.video ?? content.video;
              const local = videoObj?.local;
              const remote = videoObj?.remote;
              if (local && !local.is_downloading_completed) {
                try {
                  await (TdLib as any).downloadFile?.(videoObj) ?? Promise.resolve();
                } catch (e) {}
              } else if (remote && (!local || !local.is_downloading_completed)) {
                try {
                  await (TdLib as any).downloadFile?.(remote.id ?? remote) ?? Promise.resolve();
                } catch (e) {}
              }
            }

            // re-fetch after download to capture local.path
            try {
              const raw2 = await TdLib.getMessage(chatIdNum, Number(id));
              const fresh2 = JSON.parse(raw2.raw);
              const normalized2 = normalizeServerMessage(fresh2);
              if (!cancelled) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const idx = copy.findIndex((x) => String(x.id) === String(id));
                  if (idx !== -1) copy[idx] = normalized2;
                  return copy;
                });
              }
            } catch (e) {}
          } catch (e) {
            // getMessage failed
          }
        } catch (err) {
          // worker error
        } finally {
          running--;
        }
      }
    }

    // spawn workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());

    // close chats not in activeDownloads after short delay
    const closeTimer = setTimeout(() => {
      const keep = new Set<number>();
      for (const id of activeDownloads) {
        const m = messages.find((x) => String(x.id) === String(id));
        if (m && m.chatId) keep.add(Number(m.chatId));
      }
      openedChats.current.forEach(async (chatId) => {
        if (!keep.has(chatId)) {
          try {
            await TdLib.closeChat(chatId);
            openedChats.current.delete(chatId);
          } catch (e) {}
        }
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(closeTimer);
    };
  }, [activeDownloads, messages]);

  // subscribe to local TdLib updates (for activeDownloads)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event: any) => {
      try {
        const update = JSON.parse(event.raw);
        if (update.type === "UpdateMessageInteractionInfo" || update._ === "updateMessageInteractionInfo" || update['@type'] === "updateMessageInteractionInfo") {
          const messageId = update.messageId ?? update.message_id ?? update.data?.messageId;
          const chatId = update.chatId ?? update.chat_id ?? update.data?.chatId;
          if (!messageId) return;
          if (!activeDownloads.includes(String(messageId))) return;
          try {
            const raw = await TdLib.getMessage(Number(chatId), Number(messageId));
            const full = JSON.parse(raw.raw);
            const normalized = normalizeServerMessage(full);
            setMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? normalized : m)));
          } catch (err) {}
        } else if (update.message) {
          const msg = update.message;
          const idx = messages.findIndex((m) => String(m.chatId) === String(msg.chatId) && String(m.id) === String(msg.id));
          if (idx !== -1) {
            try {
              const raw = await TdLib.getMessage(Number(msg.chatId), Number(msg.id));
              const full = JSON.parse(raw.raw);
              const normalized = normalizeServerMessage(full);
              setMessages((prev) => {
                const copy = [...prev];
                copy[idx] = normalized;
                return copy;
              });
            } catch (err) {}
          }
        }
      } catch (e) {
        // ignore invalid update
      }
    });

    return () => subscription.remove();
  }, [messages, activeDownloads]);

  // close opened chats when screen loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        const promises = Array.from(openedChats.current).map((chatId) => {
          return TdLib.closeChat(chatId)
            .then(() => {})
            .catch(() => {});
        });

        Promise.all(promises).then(() => {
          openedChats.current.clear();
        });
      };
    }, [])
  );

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  const DEFAULT_HEADER = 70;
  const lastYRef = useRef(0);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(DEFAULT_HEADER);
  const translateY = useRef(new Animated.Value(0)).current;
  const isHiddenRef = useRef(false);
  const EXTRA_HIDE = 2;

  const hideHeader = () => {
    if (isHiddenRef.current) return;
    const target = -(measuredHeaderHeight + EXTRA_HIDE);
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

  const DOWN_THRESHOLD = 170;
  const UP_THRESHOLD = 130;
  const BIG_JUMP = 40;
  const accumRef = useRef(0);
  const lastDirectionRef = useRef(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastYRef.current;
    lastYRef.current = y;
    if (Math.abs(delta) < 0.5) return;
    if (Math.abs(delta) >= BIG_JUMP) {
      if (delta > 0) {
        accumRef.current = 0;
        lastDirectionRef.current = 1;
        hideHeader();
      } else {
        accumRef.current = 0;
        lastDirectionRef.current = -1;
        showHeader();
      }
      return;
    }
    const direction = delta > 0 ? 1 : -1;
    if (lastDirectionRef.current !== 0 && lastDirectionRef.current !== direction) {
      accumRef.current = 0;
    }
    accumRef.current += delta;
    lastDirectionRef.current = direction;
    if (accumRef.current > DOWN_THRESHOLD) {
      accumRef.current = 0;
      hideHeader();
      return;
    }
    if (accumRef.current < -UP_THRESHOLD) {
      accumRef.current = 0;
      showHeader();
      return;
    }
    if (y <= 5) {
      accumRef.current = 0;
      lastDirectionRef.current = 0;
      showHeader();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && Math.abs(h - measuredHeaderHeight) > 0.5) {
            setMeasuredHeaderHeight(h);
            translateY.setValue(0);
          }
        }}
        style={[styles.animatedHeader, { transform: [{ translateY }] }]}
      >
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
                  isVisible={visibleIds.includes(String(item.id))}
                  activeDownload={activeDownloads.includes(String(item.id))}
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
  animatedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 50,
  },
});
