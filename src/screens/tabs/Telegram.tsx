// TelegramScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  View,
  SafeAreaView,
  Dimensions,
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
  const scrollRef = useRef<Animated.FlatList<any>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // keep selectedIndex valid when teamsSlugs changes (avoid infinite loops)
  useEffect(() => {
    if (!teamsSlugs || teamsSlugs.length === 0) return;
    // if current selectedIndex points to same slug, keep it; otherwise pick perspolis if exists, else 0
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
      const res: any = await fetch(`https://cornerlive.ir:9000/feed-channel?team=${encodeURIComponent(teamSlug)}`);
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
  }, [selectedIndex, teamsSlugs]);

  // header reports ordered teams via this handler — only set if changed
  const handleOrderedTeamsChange = (ordered: string[]) => {
    if (!ordered || ordered.length === 0) return;
    if (!arraysEqual(ordered, orderedPersianTeams)) {
      setOrderedPersianTeams(ordered);
    }
  };

  // header tapped -> find slug and set selectedIndex & scroll (guarded)
  const onHeaderTeamChange = (slug: string) => {
    if (!slug) return;
    const logicalIdx = teamsSlugs.indexOf(slug);
    if (logicalIdx === -1) return;
    if (logicalIdx === selectedIndexRef.current) return;
    setSelectedIndex(logicalIdx);
    scrollRef.current?.scrollToOffset({ offset: logicalIdx * SCREEN_WIDTH, animated: true });
  };

  // viewability API for robust detection of active page (guard setState)
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const first = viewableItems[0];
    if (first.index == null) return;
    const visualIdx = first.index;
    const logicalIdx = visualIdx; // logical === visual because teamsSlugs built from orderedPersianTeams
    if (logicalIdx !== selectedIndexRef.current) {
      setSelectedIndex(logicalIdx);
    }
  }).current;

  const renderPage = ({ item: slug }: { item: string }) => {
    const teamChannels = channelsByTeam[slug] ?? [];
    const isActive = teamsSlugs[selectedIndex] === slug;

    // reverse on render if server sends reversed order (do NOT mutate original)
    const displayChannels = teamChannels;

    return (
      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <FlatList
          data={displayChannels}
          keyExtractor={(item, index) =>
            (item?.id && String(item.id)) ||
            (item?.username && String(item.username)) ||
            `${slug}_${index}`
          }
          renderItem={({ item, index }) => <ChannelItem channel={item} onReady={() => {}} />}
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
          ref={scrollRef}
          data={teamsSlugs}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s}
          renderItem={renderPage}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
          extraData={[channelsByTeam, selectedIndex, orderedPersianTeams, globalLoading]}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
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
