import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Text,
  FlatList,
  StyleSheet,
  View,
  DeviceEventEmitter,
  ActivityIndicator,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import TdLib from "react-native-tdlib";
import MessageItem from "../../components/tabs/home/MessageItem";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeHeader from "../../components/tabs/home/HomeHeader";
import changeNavigationBarColor from 'react-native-navigation-bar-color';

// ---- CONFIG ----
const BATCH_SIZE = 5; // بچ‌بِچ
const MAX_PREFETCH_BATCHES = 2; // چند بچ آینده رو در بک‌گراند بگیریم
const CONCURRENCY = 3; // چند درخواست همزمان برای هر بچ
const POLL_INTERVAL_MS = 3000; // polling برای visible messages

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<any[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const alreadyViewed = useRef<Set<number>>(new Set());

  // metadata list from server (chatId, messageId, channel)
  const datasRef = useRef<{ chatId: string; messageId: string; channel: string }[]>([]);

  // batching / pagination
  const [currentBatchIdx, setCurrentBatchIdx] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialError, setInitialError] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<boolean>(false);

  // prefetch store: batchIdx -> messages[]
  const prefetchRef = useRef<Map<number, any[]>>(new Map());

  // opened chats management
  const openedChats = useRef<Set<number>>(new Set());

  // polling interval ref
  const pollingInterval = useRef<any>(null);

  // ------------------------- Helper utilities -------------------------
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function limitConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
    const results: R[] = [];
    let i = 0;
    const workers: Promise<void>[] = [];
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        try {
          const r = await fn(items[idx]);
          results[idx] = r as any;
        } catch (err) {
          results[idx] = null as any;
        }
      }
    }
    for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  // try to open chat; if fails optionally search by channel
  const ensureChatOpen = async (chatId?: number, channel?: string) => {
    if (!chatId && !channel) throw new Error("no chatId or channel");
    try {
      if (chatId) {
        if (!openedChats.current.has(chatId)) {
          await TdLib.openChat(chatId);
          openedChats.current.add(chatId);
        }
        return chatId;
      }
      // if no chatId, search using username/channel
      const res = await TdLib.searchPublicChat(channel);
      const foundId = res?.id || res?.chat?.id || res?.chatId || +res;
      if (!foundId) throw new Error("searchPublicChat returned no id");
      if (!openedChats.current.has(foundId)) {
        await TdLib.openChat(foundId);
        openedChats.current.add(foundId);
      }
      return foundId;
    } catch (err) {
      // try searchPublicChat fallback
      if (channel) {
        try {
          const r = await TdLib.searchPublicChat(channel);
          const fid = r?.id || r?.chat?.id || r?.chatId || +r;
          if (fid && !openedChats.current.has(fid)) {
            await TdLib.openChat(fid);
            openedChats.current.add(fid);
          }
          return fid;
        } catch (e) {
          console.log("❌ ensureChatOpen fallback failed:", e);
          throw e;
        }
      }
      throw err;
    }
  };

  const fetchMessageForMeta = async ({ chatId, messageId, channel }: any) => {
    try {
      // try using provided chatId first
      const cid = await ensureChatOpen(chatId ? +chatId : undefined, channel);
      const raw = await TdLib.getMessage(+cid, +messageId);
      const parsed = JSON.parse(raw.raw);
      return parsed;
    } catch (err) {
      console.log("❌ fetchMessageForMeta error:", err);
      return null;
    }
  };

  // fetch a batch (by batch index). returns array of messages (in same order)
  const loadBatch = useCallback(
    async (batchIdx: number) => {
      const start = batchIdx * BATCH_SIZE;
      const metas = datasRef.current.slice(start, start + BATCH_SIZE);
      if (!metas.length) return [];

      const fetched = await limitConcurrency(metas, CONCURRENCY, fetchMessageForMeta);
      // filter nulls and keep order
      return fetched.filter((m) => m && m.id);
    },
    []
  );

  // prefetch next N batches in background
  const prefetchNextBatches = useCallback(
    async (fromBatchIdx: number) => {
      for (let i = 1; i <= MAX_PREFETCH_BATCHES; i++) {
        const idx = fromBatchIdx + i;
        if (prefetchRef.current.has(idx)) continue;
        const start = idx * BATCH_SIZE;
        if (start >= datasRef.current.length) break;
        try {
          const msgs = await loadBatch(idx);
          prefetchRef.current.set(idx, msgs);
        } catch (err) {
          console.log("❌ prefetch batch failed:", err);
        }
      }
    },
    [loadBatch]
  );

  // append batch (use prefetch if available)
  const appendNextBatch = useCallback(
    async (nextBatchIdx: number) => {
      // check prefetch
      const pref = prefetchRef.current.get(nextBatchIdx);
      if (pref) {
        setMessages((prev) => [...prev, ...pref]);
        prefetchRef.current.delete(nextBatchIdx);
        return pref.length;
      }
      const loaded = await loadBatch(nextBatchIdx);
      setMessages((prev) => [...prev, ...loaded]);
      return loaded.length;
    },
    [loadBatch]
  );

  // initial fetch: get metadata list from server, then load first batch(s)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setInitialLoading(true);
        const uuid: any = await AsyncStorage.getItem("userId-corner");
        const res = await fetch(`http://10.99.19.115:9000/feed-message?team=perspolis&uuid=${JSON.parse(uuid || '{}').uuid}`);
        //const res = await fetch(`http://10.99.19.115:9000/messages?team=perspolis`);
        const datass: { chatId: string; messageId: string; channel: string }[] = await res.json();
        console.log(datass)
        // sort by messageId desc and keep a reasonable cap
        const datas = datass.sort((a, b) => +b.messageId - +a.messageId).slice(0, 200);
        datasRef.current = datas;

        // load first two batches quickly (faster perceived load)
        const first = await loadBatch(0);
        if (!mounted) return;
        setMessages(first);
        setCurrentBatchIdx(0);

        // prefetch next batch(s)
        prefetchNextBatches(0);

        // determine hasMore
        setHasMore(datasRef.current.length > first.length);
      } catch (err) {
        console.error("❌ Failed to fetch messages metadata:", err);
        setInitialError(true);
      } finally {
        if (mounted) setInitialLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadBatch, prefetchNextBatches]);

  // polling visible messages periodically to update interactionInfo / latest
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
    pollingInterval.current = setInterval(pollVisibleMessages, POLL_INTERVAL_MS);
    return () => clearInterval(pollingInterval.current);
  }, [pollVisibleMessages]);

  // handle DeviceEventEmitter updates for interactionInfo
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("tdlib-update", (event) => {
      try {
        const update = JSON.parse(event.raw);
        const { type, data } = update;

        if (type === "UpdateMessageInteractionInfo") {
          const { messageId, interactionInfo } = data;
          setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, interactionInfo: { ...msg.interactionInfo, ...interactionInfo } } : msg)));
        }

        if (update.message) {
          const msg = update.message;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
        }
      } catch (err) {
        console.warn("❌ Invalid tdlib update:", event);
      }
    });

    return () => subscription.remove();
  }, []);

  // ---------- visible handling (viewable items) ----------
  const onViewRef = useCallback(({ viewableItems }: any) => {
    const ids = viewableItems.map((vi: any) => vi.item.id);
    setVisibleIds(ids);

    for (let vi of viewableItems) {
      const msg = vi.item;
      if (msg.chatId && msg.id && !alreadyViewed.current.has(msg.id)) {
        TdLib.viewMessages(msg.chatId, [msg.id], false)
          .then(() => {
            alreadyViewed.current.add(msg.id);
          })
          .catch((err: any) => {
            console.log("❌ Failed to view message:", err);
          });
      }
    }
  }, []);

  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  // activeDownloads around visible items (like previous/next 2)
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

  // ensure opened chats for activeDownloads and close others
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
          .catch((err: any) => console.log("❌ openChat error:", err));
      }

      TdLib.viewMessages(chatId, [msg.id], false).catch((err: any) => console.log("❌ viewMessages error:", err));
    }

    // close any opened that are not needed
    openedChats.current.forEach((chatId) => {
      if (!currentChatIds.has(chatId)) {
        TdLib.closeChat(chatId)
          .then(() => {
            openedChats.current.delete(chatId);
          })
          .catch((err: any) => console.log("❌ closeChat error:", err));
      }
    });
  }, [activeDownloads, messages]);

  // ---------- infinite scroll / onEndReached handling ----------
  const isLoadingMoreRef = useRef(false);

const loadMore = useCallback(async () => {
  if (isLoadingMoreRef.current) return;
  isLoadingMoreRef.current = true;
  setLoadingMore(true);

  const nextBatchIdx = currentBatchIdx + 1;
  const start = nextBatchIdx * BATCH_SIZE;

  // ✅ اگر رسیدیم به انتهای لیست محلی، از سرور بخونیم
  if (start >= datasRef.current.length) {
    try {
      const lastMessageId = datasRef.current[datasRef.current.length - 1]?.messageId;
      const uuid: any = await AsyncStorage.getItem("userId-corner");
      const res = await fetch(`http://10.99.19.115:9000/feed-message?team=perspolis&uuid=${JSON.parse(uuid || '{}').uuid}`);
      const newDatas: { chatId: string; messageId: string; channel: string }[] = await res.json();

      if (newDatas.length === 0) {
        setHasMore(false);
      } else {
        datasRef.current = [...datasRef.current, ...newDatas];
        // بعد از آپدیت دوباره appendNextBatch بزنیم
        await appendNextBatch(nextBatchIdx);
        setCurrentBatchIdx(nextBatchIdx);
        prefetchNextBatches(nextBatchIdx);
      }
    } catch (err) {
      console.log("❌ loadMore server fetch error:", err);
      setLoadMoreError(true)
    } finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
    return;
  }

  // ✅ اگر هنوز دیتا توی cache هست
  try {
    const pref = prefetchRef.current.get(nextBatchIdx);
    if (pref) {
      setMessages((prev) => [...prev, ...pref]);
      prefetchRef.current.delete(nextBatchIdx);
    } else {
      await appendNextBatch(nextBatchIdx);
    }

    setCurrentBatchIdx(nextBatchIdx);
    prefetchNextBatches(nextBatchIdx);

    const newStart = (nextBatchIdx + 1) * BATCH_SIZE;
    if (newStart >= datasRef.current.length) setHasMore(false);
  } catch (err) {
    console.log("❌ loadMore error:", err);
  } finally {
    setLoadingMore(false);
    isLoadingMoreRef.current = false;
  }
}, [appendNextBatch, currentBatchIdx, prefetchNextBatches]);

  // onEndReached from FlatList (use threshold to avoid too early triggering)
  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  // cleanup opened chats on blur/unmount
  useFocusEffect(
    useCallback(() => {
      return () => {
        const promises = Array.from(openedChats.current).map((chatId) => {
          return TdLib.closeChat(chatId).catch((err: any) => console.log("❌ closeChat on focus lost error:", err));
        });
        Promise.all(promises).then(() => openedChats.current.clear());
      };
    }, [])
  );

  // ---------------- Header animation (kept from your version) ----------------
  const { width: WINDOW_WIDTH } = Dimensions.get("window");
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

  const THRESHOLD = 10;
  const accumRef = useRef(0);
  const lastDirectionRef = useRef(0);
  const DOWN_THRESHOLD = 170;
  const UP_THRESHOLD = 130;
  const BIG_JUMP = 40;

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
    if (lastDirectionRef.current !== 0 && lastDirectionRef.current !== direction) accumRef.current = 0;
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

  // ---------------- Footer component ----------------
  const FooterLoading = ({ loading }: { loading: boolean }) => {
    return (
      <View style={{ padding: 16, alignItems: "center", justifyContent: "center" }}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : hasMore ? (
          <Text style={{ color: "#999" }}>Pull up to load more</Text>
        ) : (
          <Text style={{ color: "#666" }}>No more items</Text>
        )}
      </View>
    );
  };
useEffect(() => {
  // Set navigation bar to black and icons to light
  changeNavigationBarColor('#000000', false, true);
}, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
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
        {initialLoading ? (
        <ActivityIndicator size="large" color="#ddd" style={{ marginTop: 120 }} />
          ) : initialError ? (
            <View style={{ marginTop: 120, alignItems: "center" }}>
              <Text style={{ color: "rgba(138, 138, 138, 1)", marginBottom: 10, fontFamily: "SFArabic-Regular" }}>از وصل بودن فیاترشکن و اینترنت اطمینان حاصل کنید</Text>
              <TouchableOpacity
                onPress={() => {
                  setInitialError(false);
                }}
                style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#333", borderRadius: 8 }}
              >
                <Text style={{ color: "#fff", fontFamily: "SFArabic-Regular" }}>تلاش دوباره</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <FlatList
            style={{ paddingHorizontal: 12.5 }}
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
            contentContainerStyle={{ paddingTop: measuredHeaderHeight + insets.top, paddingBottom: 20 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              <View style={{ justifyContent: "center", alignItems: "center", paddingVertical: 20 }}>
                <ActivityIndicator color="#888" size="small" />
              </View>
            }
          />
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
