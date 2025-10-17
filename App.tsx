import { SafeAreaView } from 'react-native-safe-area-context';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigatore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from './src/services/TelegramService';
import { StatusBar } from "react-native";
import changeNavigationBarColor from 'react-native-navigation-bar-color';

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
    const configTdlib = async () => {
      await TelegramService.start()
      const authState = await TelegramService.getAuthState()
      console.log(authState.data)
    }
    configTdlib()
  }, []);
  
  useEffect(() => {
    const setNavBar = () => {
      changeNavigationBarColor('#000000', false, true);
    }

    setNavBar(); // برای mount اولیه

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNavBar(); // وقتی اپ به foreground برمی‌گردد
      }
    });

    return () => subscription.remove();
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