import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigatore';
import TdLib, { TdLibParameters } from 'react-native-tdlib';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from './src/services/TelegramService';
import { StatusBar } from "react-native";

function App(): React.JSX.Element {

  const MyDarkTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#0d0d0d",
      text: "#eef0ed",
      color: "white"
    },
  };


  useEffect(() => {
    const setAuthJwt = async() => {
      //await AsyncStorage.clear()
      const authStatus = await AsyncStorage.getItem("auth-status");
      if (!authStatus) await AsyncStorage.setItem("auth-status", JSON.stringify({register: false, route: "Intro"}))// to default open intro screen
    }
    setAuthJwt()
  },[])

  useEffect(() => {
    TelegramService.start()
    TelegramService.getAuthState()
  }, []);

  return (
    <NavigationContainer>
      <ThemeProvider value={MyDarkTheme}>
        <StatusBar
          backgroundColor="#000"
          barStyle="light-content"
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.contentWrapper}>
              <RootNavigator />
            </View>
          </View>
        </SafeAreaView>
      </ThemeProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0d0d0d",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contentWrapper: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: 1000,
  },
});

export default App;