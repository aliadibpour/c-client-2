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


export default function HomeHeader() {
  const [teams, setTeams] = useState<any>()
  useEffect(() => {
    const getTeams = async () => {
        const teams = await AsyncStorage.getItem("teams")
        setTeams(teams ? JSON.parse(teams) : null)
        console.log(teams)
    }

    getTeams()
  },[])

  const [activeTab, setActiveTab] = useState("برای شما");

  const tabs = ["برای شما", ...(teams ? Object.values(teams) : [])];

  return (
    <View style={styles.headerContainer}>
        <Image source={require("../../../assets/images/corner-logo.png")} style={styles.logo} />

    <FlatList
        data={tabs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item:any, index) => `${item}-${index}`}
        renderItem={({ item }) => {
          const isActive = activeTab === item;
          return (
            <TouchableOpacity onPress={() => setActiveTab(item)}>
              <View style={[styles.tabItem, isActive && styles.activeTab]}>
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {item}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#222",
    borderBottomWidth: .7,
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 5,
    backgroundColor: "#000000d7",
    overflow: "scroll",
  },
  logo: {
    width: 20.5,
    height: 20.5,
    borderRadius: 5,
    marginHorizontal: "auto"
  },
    tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: 8,
  },
  activeTab: {
    borderBottomColor: "#e6e6e6ff", // آبی شبیه X
  },
  tabText: {
    color: "#aaa",
    fontSize: 15,
    fontFamily: "SFArabic-Regular",
  },
  activeTabText: {
    color: "#dcdcdcff", // آبی وقتی انتخاب شد
    fontWeight: "600",
  },
});
