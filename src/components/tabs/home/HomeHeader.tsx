import AsyncStorage from "@react-native-async-storage/async-storage";
import { Filter } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, Dimensions, FlatList, TouchableOpacity } from "react-native";
import { Fire } from "../../../assets/icons";



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
  'برای شما': "esteghlal"
}
export const pepe = (team:string) => {
  return teamRecord[team];
}

export default function HomeHeader({ activeTab, setActiveTab }:any) {
  const [teams, setTeams] = useState<any>([]);

  useEffect(() => {
    const getTeams = async () => {
      const teams: any = await AsyncStorage.getItem("teams");
      const parsed = JSON.parse(teams);
      if (!parsed) return;

      // ✅ شرط: اگر فقط یک تیم بود، "برای شما" نشون داده نشه
      const teamValues = Object.values(parsed);
      if (teamValues.length > 1) {
        setTeams(["برای شما", ...teamValues]);
      } else {
        setTeams(teamValues); // فقط همون یکی
      }
    };

    getTeams();
  }, []);

  return (
    <View style={styles.headerContainer}>
      <Image source={require("../../../assets/images/corner-logo.png")} style={styles.logo} />

      <FlatList
        data={teams}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item: any, index) => `${item}-${index}`}
        renderItem={({ item }) => {
          const isActive = activeTab === pepe(item);
          return (
            <TouchableOpacity onPress={() => setActiveTab(pepe(item))} style={[styles.tabItem, isActive && styles.activeTab]}>
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#111",
    borderBottomWidth: .7,
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 5,
    backgroundColor: "#000000e8",
    overflow: "scroll",
  },
  logo: {
    width: 21,
    height: 21,
    borderRadius: 5,
    marginHorizontal: "auto"
  },
  logoText: {
    color: "#f1f1f1ff",
    fontSize: 10.4,
    fontFamily: "SFArabic-Regular",
  },
  tabItem: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: 5,
    flexDirection: "row",
    alignItems: "center"
  },
  activeTab: {
    borderBottomColor: "#e6e6e6ff", // آبی شبیه X
  },
  tabText: {
    color: "#aaa",
    fontSize: 13.5,
    fontFamily: "SFArabic-Regular",
  },
  activeTabText: {
    color: "#dcdcdcff", // آبی وقتی انتخاب شد
    fontWeight: "600",
  },
});
