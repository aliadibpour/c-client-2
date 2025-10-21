// TelegramHeader.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
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

type Props = {
  onTeamChange?: (teamPersian: string) => void;
  initialTeam?: string;
};

const TelegramHeader: React.FC<Props> = ({ onTeamChange, initialTeam }) => {
  const allTeamsOrdered = useMemo(() => Object.keys(teamRecord), []);
  const [rawTeams, setRawTeams] = useState<string[]>([]);
  const orderedTeams = useMemo(() => buildOrderedTeams(rawTeams, allTeamsOrdered), [rawTeams, allTeamsOrdered]);

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (initialTeam && allTeamsOrdered.includes(initialTeam)) return initialTeam;
    return orderedTeams.length > 0 ? orderedTeams[0] : "";
  });

  // if orderedTeams changes, ensure activeTab valid
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

  // notify parent when activeTab changes
  useEffect(() => {
    if (activeTab && typeof onTeamChange === "function") {
      onTeamChange(activeTab);
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
        // eslint-disable-next-line no-console
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
        <Text style={[styles.tabText, isActive && styles.activeTabText]}>{item}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.headerContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Image source={require("../../../assets/images/corner-logo.png")} style={styles.logo} />

      <FlatList
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
    gap: 9,
    paddingHorizontal: 8,
    paddingTop: 5,
    backgroundColor: "#000",
    overflow: "scroll",
  },
  logo: {
    width: 21,
    height: 21,
    borderRadius: 5,
    alignSelf: "center",
  },
  tabItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  activeTab: {
    borderBottomColor: "#e6e6e6ff",
  },
  tabText: {
    color: "#aaa",
    fontSize: 13.5,
    fontFamily: "SFArabic-Regular",
  },
  activeTabText: {
    color: "#dcdcdcff",
    fontWeight: "600",
  },
});
