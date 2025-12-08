// TelegramScreen.tsx — with programmatic scroll guard to avoid viewability race
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  View,
  SafeAreaView,
  Dimensions,
  I18nManager,
} from "react-native";
import TelegramHeader, { teamRecord } from "../../components/tabs/telegram/TelegramHeader";
import ChannelItem from "../../components/tabs/telegram/ChannelItem";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const REVERSE_CHANNEL_ITEMS = true; // اگر نیاز نیست false کن

function arraysEqual(a: string[] | undefined, b: string[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export default function TelegramScreen() {
  // cache channels per team
  const [channelsByTeam, setChannelsByTeam] = useState<Record<string, any[]>>({});
  const [globalLoading, setGlobalLoading] = useState<boolean>(false);

  // orderedPersianTeams will be supplied by header via onOrderedTeamsChange
  const [orderedPersianTeams, setOrderedPersianTeams] = useState<string[]>(Object.keys(teamRecord));
  const teamsSlugs = orderedPersianTeams.map((p) => teamRecord[p]).filter(Boolean);

  // selected logical index (index into teamsSlugs)
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const selectedIndexRef = useRef<number>(selectedIndex);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);

  const latestFetchForTeamRef = useRef<string | null>(null);
  const scrollRef = useRef<any>(null); // Animated.FlatList ref (use any to access scrollToIndex)
  const scrollX = useRef(new Animated.Value(0)).current;

  // --- programmatic scroll guard ---
  // when we programmatically ask the pager to scroll, set a timestamp.
  // viewability handler will ignore events within GUARD_MS after a programmatic scroll.
  const programmaticScrollTsRef = useRef<number>(0);
  const GUARD_MS = 700; // adjust if necessary (700ms is a safe start)

  const now = () => new Date().getTime();

  // logical <-> visual mapping for RTL support (if needed later)
  const logicalToVisual = (logicalIdx: number) => I18nManager.isRTL ? Math.max(0, teamsSlugs.length - 1 - logicalIdx) : logicalIdx;
  const visualToLogical = (visualIdx: number) => I18nManager.isRTL ? Math.max(0, teamsSlugs.length - 1 - visualIdx) : visualIdx;

  // keep selectedIndex valid when teamsSlugs changes (avoid infinite loops)
  useEffect(() => {
    if (!teamsSlugs || teamsSlugs.length === 0) return;
    const currentSlug = teamsSlugs[selectedIndexRef.current];
    if (currentSlug) return;
    const defaultIdx = Math.max(0, teamsSlugs.indexOf("perspolis"));
    setSelectedIndex(defaultIdx >= 0 ? defaultIdx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsSlugs]);

  // fetch channels for a slug
  const fetchForTeam = async (teamSlug: string) => {
    if (!teamSlug) return;
    if (Array.isArray(channelsByTeam[teamSlug])) {
      setGlobalLoading(false);
      return;
    }
    setGlobalLoading(true);
    latestFetchForTeamRef.current = teamSlug;
    try {
      const res: any = await fetch(`https://cornerlive.ir/feed-channel?team=${encodeURIComponent(teamSlug)}`);
      const data = await res.json();
      if (latestFetchForTeamRef.current !== teamSlug) return;
      const arr = Array.isArray(data) ? data : [];
      setChannelsByTeam(p => ({ ...p, [teamSlug]: arr }));
      setGlobalLoading(false);
    } catch (err) {
      console.error('fetchChannelsList error:', err);
      setChannelsByTeam(p => ({ ...p, [teamSlug]: [] }));
      setGlobalLoading(false);
    }
  };

  // when selectedIndex changes -> ensure data present
  useEffect(() => {
    const slug = teamsSlugs[selectedIndex];
    if (slug) fetchForTeam(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsSlugs, selectedIndex]);

  // header reports ordered teams via this handler — only set if changed
  const handleOrderedTeamsChange = (ordered: string[]) => {
    if (!ordered || ordered.length === 0) return;
    if (!arraysEqual(ordered, orderedPersianTeams)) {
      setOrderedPersianTeams(ordered);
    }
  };

  // header tapped -> find slug and set selectedIndex & scroll (guarded & robust)
  const onHeaderTeamChange = (slug: string) => {
    if (!slug) return;
    const logicalIdx = teamsSlugs.indexOf(slug);
    if (logicalIdx === -1) return;
    if (logicalIdx === selectedIndexRef.current) return;

    // set selected index (so internal state aligns)
    setSelectedIndex(logicalIdx);

    // fetch immediately to reduce visible loading time
    fetchForTeam(slug);

    // scroll to visual index robustly (map logical->visual for RTL)
    const visualIdx = logicalIdx;

    // mark programmatic scroll time so we can ignore near-term viewability events
    programmaticScrollTsRef.current = now();

    try {
      // prefer scrollToOffset (more stable across RN versions)
      scrollRef.current?.scrollToOffset({ offset: visualIdx * SCREEN_WIDTH, animated: true });
    } catch (err) {
      try {
        scrollRef.current?.scrollToIndex({ index: visualIdx, animated: true });
      } catch {
        // ignore if both fail
      }
    }
  };

  // viewability API — guarded to avoid stomping programmatic scrolls
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 52 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    // guard: if we recently did a programmatic scroll, ignore viewability updates until guard expires
    const lastProg = programmaticScrollTsRef.current;
    if (lastProg && now() - lastProg < GUARD_MS) {
      // ignore — still in programmatic scroll window
      // (optional: uncomment console.log to debug)
      // console.log('[TelegramScreen] viewable ignored due to programmatic guard');
      return;
    }

    if (!viewableItems || viewableItems.length === 0) return;
    const first = viewableItems.find((v: any) => v && v.index != null);
    if (!first) return;
    const visualIdx = first.index;
    const logicalIdx = visualIdx; // logical === visual because teamsSlugs built from orderedPersianTeams (if not using RTL mapping)
    if (logicalIdx !== selectedIndexRef.current) {
      setSelectedIndex(logicalIdx);
    }
  }).current;

  // onMomentumScrollEnd: authoritative for user-driven swipes (LiveMatch pattern)
  const onMomentumScrollEnd = (event: any) => {
    const rawX = event.nativeEvent.contentOffset.x;
    const visualIdx = Math.round(rawX / SCREEN_WIDTH);
    const logicalIdx = visualToLogical(visualIdx);

    // set selectedIndex only if changed
    if (logicalIdx !== selectedIndexRef.current) {
      setSelectedIndex(logicalIdx);
      // fetch for new logical index
      const slug = teamsSlugs[logicalIdx];
      if (slug) fetchForTeam(slug);
    }
    // clear programmatic guard as momentum ended (optional)
    programmaticScrollTsRef.current = 0;
  };

  const renderPage = ({ item: slug }: { item: string }) => {
    const teamChannels = channelsByTeam[slug] ?? [];
    const isActive = teamsSlugs[selectedIndex] === slug;

    const displayChannels = REVERSE_CHANNEL_ITEMS ? (Array.isArray(teamChannels) ? [...teamChannels].reverse() : teamChannels) : teamChannels;

    return (
      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <FlatList
          data={displayChannels}
          keyExtractor={(item, index) =>
            (item?.id || item?.id === 0) ? `${slug}__id_${item.id}` :
            (item?.username ? `${slug}__user_${String(item.username)}` : `${slug}__idx_${index}`)
          }
          renderItem={({ item }) => <ChannelItem channel={item} onReady={() => {}} />}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews={true}
          extraData={displayChannels}
        />
        {isActive && globalLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffffff" />
          </View>
        )}
      </View>
    );
  };

  const initialIndex = Math.max(0, selectedIndex);

  return (
    <SafeAreaView style={styles.safe}>
      <TelegramHeader
        selectedSlug={teamsSlugs[selectedIndex]}
        onTeamChange={onHeaderTeamChange}
        initialTeam={teamsSlugs[selectedIndex]}
        onOrderedTeamsChange={handleOrderedTeamsChange} // <<--- pass handler so header reports true ordering
      />

      <View style={styles.container}>
        <Animated.FlatList
          ref={(r) => {
            // Animated wrapper may expose getNode(); prefer actual node if available
            // @ts-ignore
            scrollRef.current = r && typeof (r as any).getNode === "function" ? (r as any).getNode() : r;
          }}
          data={teamsSlugs}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s}
          renderItem={renderPage}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          onMomentumScrollEnd={onMomentumScrollEnd}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
          extraData={[channelsByTeam, selectedIndex, orderedPersianTeams, globalLoading]}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
          removeClippedSubviews={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
