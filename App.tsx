import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigatore';
import TdLib, { TdLibParameters } from 'react-native-tdlib';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

    const parameters = {
      api_id: 19661737,
      api_hash: "28b0dd4e86b027fd9a2905d6c343c6bb"
  } as TdLibParameters;

  useEffect(() => {
    const setAuthJwt = async() => {
      const authStatus = await AsyncStorage.getItem("auth-status");
      if (!authStatus) await AsyncStorage.setItem("auth-status", JSON.stringify({register: false, route: "Intro"}))// to default open intro screen
    }
    setAuthJwt()
  },[])

  useEffect(() => {
    TdLib.startTdLib(parameters)
      .then(r => {
        console.log('✅ StartTdLib:', r);
        return TdLib.getAuthorizationState();
      })
      .then(r => {
        console.log('✅ InitialAuthState:', r);
        const state = JSON.parse(r);
        if (state['@type'] === 'authorizationStateReady') {
          getProfile();
        }
      })
      .catch(err => {
        console.error('❌ TDLib Init or AuthState Error:', err);
      });
  }, []);



  const [profile, setProfile] = React.useState<any>(null);
  const getProfile = useCallback(() => {
    TdLib.getProfile().then(result => {
      console.log('User Profile:', result);
      const profile = Platform.select({
        ios: result,
        android: JSON.parse(result),
      });
      setProfile(profile);
    });
  }, []);
  return (
    <NavigationContainer>
      <ThemeProvider value={MyDarkTheme}>
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