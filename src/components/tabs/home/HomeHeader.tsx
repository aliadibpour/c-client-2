// HomeHeader.tsx (ویرایش شده)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redo } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

const teamRecord : { [key: string]: string } = {
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
export const pepe = (team:string) => {
  return teamRecord[team];
}

function HomeHeaderInner({ activeTab, setActiveTab, hasNewMessage, onRefresh }: any) {
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const getTeams = async () => {
      try {
        const raw = await AsyncStorage.getItem("teams");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        let values: (string | null)[] = [];
        if (Array.isArray(parsed)) {
          values = parsed.map((v: any) => (typeof v === 'string' ? v : v?.name ?? null));
        } else if (typeof parsed === 'object' && parsed !== null) {
          values = [parsed.team1 ?? null, parsed.team2 ?? null, parsed.team3 ?? null];
        }
        const final = values.filter(v => v && typeof v === 'string') as string[];
        if (mounted) setTeams(final);
      } catch (e) {
        console.warn("HomeHeader: failed to read teams from AsyncStorage", e);
      }
    };
    getTeams();
    return () => { mounted = false; };
  }, []);

  const widthPercent: any = teams.length === 0 ? 'auto' : `${Math.max(1, Math.floor(100 / teams.length * 1000) / 1000)}%`;

  return (
    <View style={styles.headerContainer}>
      <Image source={require("../../../assets/images/cornerLogoCopy.jpg")} style={[styles.logo, teams.length > 1 ? {marginBottom: 0}: {marginBottom:0}]} />

      <View style={styles.tabsRow}>
        {teams.length > 1 &&
          teams.slice(0, 3).map((item: string, idx: number) => {
            const isActive = activeTab === pepe(item);
            return (
              <TouchableOpacity
                key={`${item}-${idx}`}
                onPress={() => setActiveTab(pepe(item))}
                activeOpacity={0.8}
                style={[
                  styles.tabItemGrid,
                  { width: widthPercent },
                  isActive && styles.activeTab,
                ]}
              >
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })
        }
      </View>

      {/* این باکس خارج از جریانِ layout قرار گرفته تا هیچ shift ای ایجاد نکند */}
      {hasNewMessage && (
        <TouchableOpacity style={styles.hasNewboxAbsolute} onPress={() => onRefresh()}>
          <Text style={styles.hasNewText}>جدیدترین ها</Text>
          <Redo width={15}/>
        </TouchableOpacity>
      )}
    </View>
  );
}

// memo با مقایسه‌ی propsِ ضروری
export default React.memo(HomeHeaderInner, (prev, next) => {
  return prev.activeTab === next.activeTab && prev.hasNewMessage === next.hasNewMessage;
});

const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#111",
    borderBottomWidth: 0.7,
    gap: 6,
    paddingTop: 5,
    backgroundColor: "#000000ff",
    minHeight: 50,
    // paddingHorizontal: 8,
  },
  logo: {
    width: 35,
    height: 35,
    borderRadius: 5,
    alignSelf: "center",
  },

  tabsRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop:1
  },

  tabItemGrid: {
    paddingVertical: 6,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    paddingHorizontal: 8,
  },

  activeTab: {
    borderBottomColor: "#e6e6e6",
  },

  tabText: {
    color: "#aaa",
    fontSize: 13.3,
    fontFamily: "SFArabic-Regular",
  },
  activeTabText: {
    color: "#dcdcdcff",
    fontWeight: "600",
  },

  hasNewboxAbsolute:{
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "#fffffff6",
    paddingHorizontal:8,
    paddingVertical:4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    // elevation/ shadow اگر خواستی اضافه کن برای برجسته شدن
  },
  hasNewText:{
    color: "#000",
    fontFamily: "SFArabic-Regular",
    fontSize: 12,
    marginRight: 6,
    textAlign: "center",
  }
});
