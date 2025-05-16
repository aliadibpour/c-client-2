import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigatore';
import TdLib, { TdLibParameters } from 'react-native-tdlib';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from './src/services/TelegramService';

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
      //await AsyncStorage.clear()
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
      .then(async(r) => {
        console.log('✅ InitialAuthState:', r);
        const state = JSON.parse(r);
        if (state['@type'] === 'authorizationStateReady') {
          getProfile();
          // getLast10Messages(-1001457166593)
          // listenForMessages();
        }
      })
      .catch(err => {
        console.error('❌ TDLib Init or AuthState Error:', err);
      });
    TelegramService.getUpdate()

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





//   const getLast10Messages = async (chatId: number) => {
//   // Step 1: ارسال درخواست برای گرفتن تاریخچه‌ی پیام‌ها
//     try {
//       const a = await TdLib.td_json_client_send({
//       '@type': 'getChatHistory',
//       chat_id: chatId,
//       from_message_id: 0, 
//       limit: 10,
//       only_local: false
//     });
//     console.log('Last 10 messages:', a);
//     } catch (error) {
//       console.log(error)
//     }
//   };

//   const listenForMessages = () => {
//   const interval = setInterval(async () => {
//     const raw = await TdLib.td_json_client_receive();
//     if (!raw) return;

//     const update = typeof raw === 'string' ? JSON.parse(raw) : raw;
//     console.log("📥 TDLib Update:", update);

//     if (update['@type'] === 'messages') {
//       console.log('✅ Last 10 messages:', update.messages);
//       clearInterval(interval); // فقط یک بار می‌خوای
//     }
//   }, 500);
// };



const fetchSupportedLanguages = async () => {
  try {
    const request1 = {
      '@type': 'setOption',
      name: 'localization_target',
      value: {
        '@type': 'optionValueString',
        value: 'android',
      },
    };

    TdLib.td_json_client_send(request1);

    const waitForOk = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const res = await TdLib.td_json_client_receive();
        if (!res) continue;
        const json = JSON.parse(res);
        if (json['@type'] === 'ok') return true;
        if (json['@type'] === 'error') {
          console.error("❌ Error from TDLib:", json);
          return false;
        }
      }
      return false;
    };

    const ok = await waitForOk();
    if (!ok) throw new Error("❌ setOption did not succeed");

    const request2 = {
      '@type': 'getLocalizationTargetInfo',
      only_locales: true,
    };
    TdLib.td_json_client_send(request2);

    const start = Date.now();
    while (Date.now() - start < 5000) {
      const res = await TdLib.td_json_client_receive();
      if (!res) continue;
      const json = JSON.parse(res);
      if (json['@type'] === 'localizationTargetInfo') {
        console.log("✅ Supported languages:", json);
        return;
      }
      if (json['@type'] === 'error') {
        throw new Error(`❌ TDLib error: ${json.message}`);
      }
    }
    throw new Error("❌ Timeout: no response to getLocalizationTargetInfo");

  } catch (err) {
    console.error("❌ fetchSupportedLanguages error:", err);
  }
};


  useEffect(() => {
    fetchSupportedLanguages();
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