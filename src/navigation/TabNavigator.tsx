// TabNavigator.tsx

import React, { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, Platform, StyleSheet } from "react-native";
import Home from "../screens/tabs/Home/Home";
import LiveMatch from "../screens/tabs/LiveMatch";
import Profile from "../screens/tabs/Profile";
import Telegram from "../screens/tabs/Telegram";
import Comments from "../screens/tabs/Home/Comments";
import {
  HouseIcon,
  TelegramIcon,
  ProfileIcon,
  FootballPitchIcon,
  CommentsIcon,
} from "../assets/icons/index";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PickTeams from "../screens/setup/PickTeams";

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const iconSize = Platform.select({ web: 22, default: 22 });
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const authStatus = await AsyncStorage.getItem("auth-status");
      setIsAuth(JSON.parse(authStatus || '{"register": false}').register);
    };

    checkAuth();
  }, []);

  if (isAuth === null) return null;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <HouseIcon size={iconSize} outline={!focused} />
              <Text style={[styles.iconText, focused && styles.activeText]}>خانه</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Telegram"
        component={Telegram}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <TelegramIcon size={iconSize} outline={!focused} />
              <Text style={[styles.iconText, focused && styles.activeText]}>تلگرام</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="LiveMatch"
        component={LiveMatch}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <FootballPitchIcon size={iconSize} outline={focused} />
              <Text style={[styles.iconText, focused && styles.activeText]}>بازی‌ها</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <ProfileIcon size={iconSize} outline={!focused} />
              <Text style={[styles.iconText, focused && styles.activeText]}>پروفایل</Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#0d0d0d",
    paddingTop: 12,
    paddingBottom: 8,
    height: 60,
    borderTopWidth: 0.4,
    borderColor: "#222"
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
  },
  iconText: {
    fontSize: 10,
    marginTop: 6,
    color: "rgba(255, 255, 255, 0.4)",
    fontFamily: "vazir",
  },
  activeText: {
    color: "#ffffff",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0d0d0d",
    justifyContent: "center",
    alignItems: "center",
  },
});
