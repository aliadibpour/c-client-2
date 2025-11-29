// TelegramHeader.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ListRenderItem,
} from "react-native";
import AppText from "../../ui/AppText";

export const teamRecord: Record<string, string> = {
  'پرسپولیس': 'perspolis',
  'استقلال': 'esteghlal',
  'سپاهان': 'sepahan',
  'تراکتور': 'tractor',
  'بارسلونا': 'barcelona',
  'رئال مادرید': 'realmadrid',
  'آرسنال': 'arsenal',
  'منچستر یونایتد': 'manchesterunited',
  'لیورپول': 'liverpool',
  'چلسی': 'chelsea',
  'بایرن': 'bayern',
  'اینتر': 'inter',
  'میلان': 'milan',
};

const IRANIAN_TEAMS = new Set<string>(['پرسپولیس', 'استقلال', 'سپاهان', 'تراکتور']);

function normalizeStoredTeams(parsed: unknown): string[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  if (typeof parsed === 'object' && parsed !== null) {
    try {
      return Object.values(parsed as Record<string, unknown>).map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  if (typeof parsed === 'string') {
    const str = parsed.trim();
    try {
      const p = JSON.parse(str);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
      if (typeof p === 'object' && p !== null) return Object.values(p).map(String).filter(Boolean);
    } catch {}
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function buildOrderedTeams(favoritesRaw: string[], allTeamsOrdered: string[]): string[] {
  const favorites: string[] = [];
  const seen = new Set<string>();
  for (let t of favoritesRaw) {
    if (!t) continue;
    let teamName = t;
    if (!allTeamsOrdered.includes(teamName)) {
      const key = Object.keys(teamRecord).find(k => teamRecord[k] === teamName);
      if (key) teamName = key;
    }
    if (allTeamsOrdered.includes(teamName) && !seen.has(teamName)) {
      favorites.push(teamName);
      seen.add(teamName);
    }
  }
  const remaining = allTeamsOrdered.filter(t => !seen.has(t));
  const remainingIran = remaining.filter(t => IRANIAN_TEAMS.has(t));
  const remainingForeign = remaining.filter(t => !IRANIAN_TEAMS.has(t));
  if (favorites.length > 0) {
    const firstFavIsIranian = IRANIAN_TEAMS.has(favorites[0]);
    return favorites.concat(firstFavIsIranian ? remainingIran.concat(remainingForeign) : remainingForeign.concat(remainingIran));
  }
  return remainingIran.concat(remainingForeign);
}

/** helper: shallow array compare */
function arraysEqual(a: string[] | undefined, b: string[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

type Props = {
  onTeamChange?: (teamSlug: string) => void; // receives slug like 'perspolis'
  initialTeam?: string; // can be slug or Persian name
  selectedSlug?: string; // optional controlled slug (slug string) — header will sync activeTab when this prop changes
  onOrderedTeamsChange?: (orderedPersianTeams: string[]) => void; // NEW: report ordered Persian team names to parent
};

const TelegramHeader: React.FC<Props> = ({ onTeamChange, initialTeam, selectedSlug, onOrderedTeamsChange }) => {
  const allTeamsOrdered = useMemo(() => Object.keys(teamRecord), []);
  const [rawTeams, setRawTeams] = useState<string[]>([]);
  const orderedTeams = useMemo(() => buildOrderedTeams(rawTeams, allTeamsOrdered), [rawTeams, allTeamsOrdered]);
  const flatListRef = useRef<FlatList>(null);

  // keep track of what we last reported to parent to avoid repeated callbacks
  const lastReportedOrderedRef = useRef<string[] | null>(null);
  const lastEmittedSlugRef = useRef<string | null>(null);

  const slotInitial = (): string => {
    if (!initialTeam) return orderedTeams.length > 0 ? orderedTeams[0] : "";
    const asSlug = String(initialTeam).trim();
    const foundPersian = Object.keys(teamRecord).find(k => teamRecord[k] === asSlug);
    if (foundPersian) return foundPersian;
    if (allTeamsOrdered.includes(asSlug)) return asSlug;
    return orderedTeams.length > 0 ? orderedTeams[0] : "";
  };

  const [activeTab, setActiveTab] = useState<string>(slotInitial);

  // keep activeTab valid when orderedTeams changes
  useEffect(() => {
    if (orderedTeams.length > 0) {
      if (!orderedTeams.includes(activeTab)) {
        setActiveTab(orderedTeams[0]);
      }
    } else {
      if (activeTab !== "") setActiveTab("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTeams]);

  // REPORT orderedTeams to parent but only if changed
  useEffect(() => {
    if (typeof onOrderedTeamsChange === "function") {
      if (!arraysEqual(lastReportedOrderedRef.current ?? undefined, orderedTeams)) {
        try {
          lastReportedOrderedRef.current = orderedTeams.slice();
          onOrderedTeamsChange(orderedTeams.slice());
        } catch (err) {
          console.warn("onOrderedTeamsChange callback error", err);
        }
      }
    }
  }, [orderedTeams, onOrderedTeamsChange]);

  // If parent passes selectedSlug (slug string), map to Persian name and set activeTab
  useEffect(() => {
    if (!selectedSlug) return;
    const persian = Object.keys(teamRecord).find((k) => teamRecord[k] === selectedSlug);
    if (persian && persian !== activeTab && orderedTeams.includes(persian)) {
      setActiveTab(persian);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug, orderedTeams]);

  // notify parent with slug when active tab changes
  useEffect(() => {
    const slug = activeTab ? teamRecord[activeTab] : null;
    if (slug && typeof onTeamChange === "function") {
      // only call if different from what we already emitted / parent selectedSlug
      if (lastEmittedSlugRef.current !== slug && slug !== selectedSlug) {
        lastEmittedSlugRef.current = slug;
        try {
          onTeamChange(slug);
        } catch (err) {
          console.warn("onTeamChange callback error", err);
        }
      }
    }

    const idx = Math.max(0, orderedTeams.indexOf(activeTab));
    if (typeof flatListRef.current?.scrollToIndex === "function") {
      try {
        flatListRef.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        // ignore if out of range
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const getTeamsFromStorage = async () => {
      try {
        const stored = await AsyncStorage.getItem("teams");
        if (!stored) {
          setRawTeams([]);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(stored);
        } catch {
          parsed = stored;
        }
        const normalized = normalizeStoredTeams(parsed);
        setRawTeams(normalized);
      } catch (err) {
        console.warn("TelegramHeader AsyncStorage read error", err);
        setRawTeams([]);
      }
    };
    getTeamsFromStorage();
  }, []);

  const renderItem: ListRenderItem<string> = ({ item }) => {
    const isActive = activeTab === item;
    return (
      <TouchableOpacity onPress={() => setActiveTab(item)} style={[styles.tabItem, isActive && styles.activeTab]}>
        <AppText style={[styles.tabText, isActive && styles.activeTabText]}>{item}</AppText>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.headerContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Image source={require("../../../assets/images/cornerLogoCopy.jpg")} style={styles.logo} />

      <FlatList
        ref={flatListRef}
        data={orderedTeams}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={renderItem}
      />
    </View>
  );
};

export default TelegramHeader;

const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#111",
    borderBottomWidth: 0.7,
    gap: 7,
    paddingHorizontal: 8,
    paddingTop: 5,
    backgroundColor: "#000",
  },
  logo: {
    width: 35,
    height: 35,
    borderRadius: 5,
    alignSelf: "center",
  },
  tabItem: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: 5,
    width: 90,
  },
  activeTab: {
    borderBottomColor: "#e6e6e6ff",
  },
  tabText: {
    color: "#aaa",
    fontSize: 13.3,
    fontFamily: "SFArabic-Regular",
    textAlign: "center",
  },
  activeTabText: {
    color: "#dcdcdcff",
    fontWeight: "600",
  },
});
