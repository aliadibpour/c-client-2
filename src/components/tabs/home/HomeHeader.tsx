// HomeHeader.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redo } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

const teamImages: { [key: string]: any } = {
  'پرسپولیس': require('../../../assets/teams/perspolis.png'),
  'استقلال': require('../../../assets/teams/ss.png'),
  'سپاهان': require('../../../assets/teams/sepahan.png'),
  'تراکتور': require('../../../assets/teams/Tractor.png'),
  'بارسلونا': require('../../../assets/teams/barcelona.webp'),
  'رئال مادرید': require('../../../assets/teams/realmadrid.png'),
  'آرسنال': require('../../../assets/teams/arsenal.webp'),
  'منچستر یونایتد': require('../../../assets/teams/man.webp'),
  'لیورپول': require('../../../assets/teams/liverpool.webp'),
  'چلسی': require('../../../assets/teams/Chelsea.png'),
  'بایرن': require('../../../assets/teams/munich.png'),
  'اینتر': require('../../../assets/teams/inter.png'),
  'میلان': require('../../../assets/teams/milan.png'),
};

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

export default function HomeHeader({ activeTab, setActiveTab, hasNewMessage, onRefresh }: any) {
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    const getTeams = async () => {
      try {
        const raw = await AsyncStorage.getItem("teams");
        if (!raw) return;

        const parsed = JSON.parse(raw);

        // parsed ممکنه به صورت شیء {team1,team2,team3} یا آرایه باشد.
        let values: (string | null)[] = [];

        if (Array.isArray(parsed)) {
          values = parsed.map((v: any) => (typeof v === 'string' ? v : v?.name ?? null));
        } else if (typeof parsed === 'object' && parsed !== null) {
          // ترتیب مهمه: team1, team2, team3
          values = [parsed.team1 ?? null, parsed.team2 ?? null, parsed.team3 ?? null];
        }

        // فیلتر کردن مقادیر null/'' — اما اگر خواستی جای‌خالی نمایش داده شود بگو
        const final = values.filter(v => v && typeof v === 'string') as string[];

        // اگر فقط یک تیم هم بوده، آن را نمایش می‌دهیم (درخواست شما)
        setTeams(final);
      } catch (e) {
        console.warn("HomeHeader: failed to read teams from AsyncStorage", e);
      }
    };

    getTeams();
  }, []);

  // محاسبهٔ عرض هر تب براساس تعداد تیم‌ها
  const widthPercent: any = teams.length === 0 ? 'auto' : `${Math.max(1, Math.floor(100 / teams.length * 1000) / 1000)}%`;
  // توضیح: ضرب و تقسیم برای دقت بیشتر در درصدِ اعشاری (مثلاً 33.333)

  return (
    <View style={styles.headerContainer}>
      <Image source={require("../../../assets/images/corner-logo.png")} style={[styles.logo, teams.length > 1 ? {marginBottom: 0}: {marginBottom:7}]} />

      {/* Tabs grid: supports 1,2,3 items (each fills 100%/50%/33.333%) */}
      <View style={styles.tabsRow}>
        {teams.length > 1 && 
          (
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
                {/* اگر می‌خواهی لوگو نمایش داده شود می‌توانی از teamImages[item] استفاده کنی */}
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {hasNewMessage && (
        <TouchableOpacity style={styles.hasNewbox} onPress={() => onRefresh()}>
          <Text style={styles.hasNewText}>جدیدترین ها</Text>
          <Redo width={15}/>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#111",
    borderBottomWidth: 0.7,
    gap: 6,
    paddingTop: 5,
    backgroundColor: "#000000ef",
    // paddingHorizontal: 8,
  },
  logo: {
    width: 21,
    height: 21,
    borderRadius: 5,
    alignSelf: "center",
  },

  tabsRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    // justifyContent: "space-between", // حذف شد تا هر تب دقیقاً عرض مشخص را بگیرد
    paddingHorizontal: 6,
  },

  tabItemGrid: {
    // هر تب با عرض درصدی که بالا محاسبه می‌کنیم قرار می‌گیرد
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

  emptyBox: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },

  hasNewbox:{
    backgroundColor: "#fffffff6",
    padding:3,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 8,
    marginRight: 6,
    borderRadius: 6,
  },
  hasNewText:{
    color: "#000",
    fontFamily: "SFArabic-Regular",
    fontSize: 12,
    marginRight: 6,
  }
});
