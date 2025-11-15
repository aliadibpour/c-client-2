// App.tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppState, I18nManager, Platform, StyleSheet, View, DevSettings } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native';
import React, { useEffect } from 'react';
import RootNavigator from './src/navigation/RootNavigatore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from './src/services/TelegramService';
import { StatusBar } from "react-native";
import changeNavigationBarColor from 'react-native-navigation-bar-color';
import TdLib from 'react-native-tdlib';
import RNRestart from 'react-native-restart'; 

const RTL_FLAG_KEY = 'rtl_applied_v1'; // وقتی خواستی مجددا تست کنی، مقدار این کلید را پاک کن

function App(): React.JSX.Element {
  useEffect(() => {
    (async () => {
      try {
        // only apply once: check storage
        const applied = await AsyncStorage.getItem(RTL_FLAG_KEY);

        // if not RTL yet, and haven't applied before -> enable and restart once
        if (!I18nManager.isRTL && applied !== '1') {
          try {
            // Allow and force RTL
            I18nManager.allowRTL(true);
            I18nManager.forceRTL(true);

            // persist flag BEFORE restart to ensure next run won't restart again
            await AsyncStorage.setItem(RTL_FLAG_KEY, '1');

            // prefer RNRestart if available, else try DevSettings.reload as fallback
            if (RNRestart && typeof RNRestart.Restart === 'function') {
              // restart app (native + js)
              RNRestart.Restart();
            } else {
              // fallback: reload JS — may not fully apply native layout direction in all cases
              // On Android it sometimes suffice; on iOS a full relaunch may be required.
              try {
                DevSettings.reload();
              } catch (err) {
                console.warn('Restart fallback failed; please reopen the app manually.', err);
              }
            }
          } catch (err) {
            console.warn('Failed to apply RTL + restart:', err);
          }
        }
      } catch (e) {
        console.warn('[RTL init] storage check failed', e);
      }
    })();
  }, []);

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
      await TelegramService.start();
      try {
        const authState = await TdLib.getAuthorizationState();
        const data = JSON.parse(authState);
        console.log(data);
        if (data['@type'] !== "authorizationStateReady") {
          await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "intro" }));
        }
      } catch (e) {
        console.warn('[TdLib] getAuthorizationState failed', e);
      }
    };
    configTdlib();
  }, []);

  useEffect(() => {
    const setNavBar = () => {
      changeNavigationBarColor('#000000', false, true);
    };

    setNavBar(); // برای mount اولیه

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNavBar(); // وقتی اپ به foreground برمی‌گردد
      }
    });

    // return () => subscription.remove();
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
