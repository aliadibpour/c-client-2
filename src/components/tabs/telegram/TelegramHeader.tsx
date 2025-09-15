import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, Dimensions, FlatList, TouchableOpacity, StatusBar } from "react-native";

export default function TelegramHeader() {
  const [teams, setTeams] = useState<any>()
  useEffect(() => {
    const getTeams = async () => {
        const teams:any = await AsyncStorage.getItem("teams")
        setTeams(teams ? JSON.parse(teams) : null)
        setTeams(teams?.length > 1 ? ["برای شما", ...Object.values(JSON.parse(teams))] : ["برای شما"])
        console.log(teams)
    }

    getTeams()
  },[])

  const [activeTab, setActiveTab] = useState("برای شما");

  return (
    <View style={styles.headerContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Image source={require("../../../assets/images/corner-logo.png")} style={styles.logo} />

    <FlatList
        data={teams}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item:any, index) => `${item}-${index}`}
        renderItem={({ item }) => {
          const isActive = activeTab === item;
          return (
            <TouchableOpacity onPress={() => setActiveTab(item)} style={[styles.tabItem, isActive && styles.activeTab]}>
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
