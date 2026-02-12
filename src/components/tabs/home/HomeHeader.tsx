import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redo } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { View, Image, StyleSheet, TouchableOpacity } from "react-native";
import AppText from "../../ui/AppText";

// -------------------- Data --------------------
const teamRecord: Record<string, string> = {
  "پرسپولیس": "perspolis",
  "استقلال": "esteghlal",
  "سپاهان": "sepahan",
  "تراکتور": "tractor",
  "بارسلونا": "barcelona",
  "رئال مادرید": "realmadrid",
  "آرسنال": "arsenal",
  "منچستر یونایتد": "manchesterunited",
  "لیورپول": "liverpool",
  "چلسی": "chelsea",
  "بایرن": "bayern",
  "اینتر": "inter",
  "میلان": "milan",
};

export const pepe = (team:string) => { return teamRecord[team]; }

const reverseTeamRecord: Record<string, string> = Object.fromEntries(
  Object.entries(teamRecord).map(([fa, en]) => [en, fa])
);

const charts: Record<number, string[]> = {
  1: ["perspolis", "esteghlal", "tractor", "sepahan"],
  2: ["barcelona", "realmadrid"],
  3: ["arsenal", "manchesterunited", "liverpool", "chelsea"],
  4: ["bayern", "inter", "milan"],
};

const toEn = (fa: string) => teamRecord[fa];
const toFa = (en: string) => reverseTeamRecord[en];

// -------------------- Component --------------------
function HomeHeader({ activeTab, setActiveTab, hasNewMessage, onRefresh }: any) {
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    const getTeams = async () => {
      try {
        const raw = await AsyncStorage.getItem("teams");
        if (!raw) return;

        const parsed = JSON.parse(raw);

        let values: string[] = [];

        if (Array.isArray(parsed)) {
          values = parsed
            .map((v: any) => (typeof v === "string" ? v : v?.name))
            .filter(Boolean);
        } else if (parsed && typeof parsed === "object") {
          values = [parsed.team1, parsed.team2, parsed.team3].filter(Boolean);
        }

        let list = values.map(toEn).filter(Boolean);

        for (const key of Object.keys(charts)) {
          if (list.length >= 4) break;

          const group = charts[+key];
          const hasSame = group.some((t) => list.includes(t));

          if (!hasSame) {
            const random = group[Math.floor(Math.random() * group.length)];
            list.push(random);
          }
        }

        if (mounted) setTeams(list.map(toFa));
      } catch (e) {
        console.warn("HomeHeader: failed to read teams", e);
      }
    };

    getTeams();
    return () => {
      mounted = false;
    };
  }, []);

  const itemWidth = useMemo(() => {
    if (!teams.length) return "auto";
    return `${100 / teams.length}%`;
  }, [teams.length]);

  // -------------------- UI --------------------
  return (
    <View style={styles.container}>
      {/* Logo */}
      <Image source={require("../../../assets/images/cornerLogoCopy.jpg")} style={styles.logo} />

      {/* Tabs */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsRow}>
          {teams.map((faName, idx) => {
            const en = toEn(faName);
            const isActive = activeTab === en;

            return (
              <TouchableOpacity
                key={`${faName}-${idx}`}
                onPress={() => setActiveTab(en)}
                activeOpacity={0.9}
                style={[
                  styles.tabModern,
                  { width: itemWidth },
                  isActive && styles.tabModernActive,
                ]}
              >
                <AppText style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {faName}
                </AppText>

                {/* glowing indicator */}
                {isActive && <View style={styles.activeGlow} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* floating refresh badge */}
      {hasNewMessage && (
        <TouchableOpacity style={styles.newBadge} onPress={onRefresh}>
          <Redo width={14} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(HomeHeader, (prev, next) => {
  return prev.activeTab === next.activeTab && prev.hasNewMessage === next.hasNewMessage;
});

// -------------------- Styles --------------------
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    paddingTop: 3,
    paddingBottom: 0,
    overflow: "visible"
  },

  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 2,
  },

  // outer glass container
  tabsWrapper: {
    marginHorizontal: 5,
    borderRadius: 18,
    backgroundColor: "#0e0e0ed8",
    padding: 3.7,
  },

  tabsRow: {
    flexDirection: "row",
    gap: 1.4,
  },

  // 🔷 ultra modern tab
  tabModern: {
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  tabModernActive: {
    backgroundColor: "#ffffffe8",
    shadowColor: "#ffffff00",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  tabText: {
    color: "#9a9a9a",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
  },

  tabTextActive: {
    color: "#000",
    fontFamily: "SFArabic-Regular",
  },

  // glow line under active tab
  activeGlow: {
    position: "absolute",
    bottom: -2,
    width: "40%",
    height: 3,
    borderRadius: 2,
  },

  // minimal floating refresh button
  newBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});