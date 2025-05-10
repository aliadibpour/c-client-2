import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Home from "./src/screens/tabs/Home";
import IntroScreen from './src/screens/auth/Intro';
import RootNavigator from './src/navigation/RootNavigatore';

// SplashScreen.preventAutoHideAsync();

function App(): React.JSX.Element {
//   const [loaded, error] = useFonts({
//     'vazir': require('./../assets/fonts/vazir-font-v16.1.0/Vazir.ttf'),
//   });

//   useEffect(() => {
//     AsyncStorage.clear()
//     if (loaded || error) {
//       SplashScreen.hideAsync();
//     }
//   }, [loaded, error]);

  // if (!loaded) {
  //   return null;
  // }

  const MyDarkTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#0d0d0d",
      text: "#eef0ed",
      color: "white"
    },
  };


  // const [isAuth, setIsAuth] = useState<boolean | null>(null);
  // useEffect(() => {
  //   const checkAuth = async () => {
  //     const authStatus = await AsyncStorage.getItem("auth-status");
  //     setIsAuth(JSON.parse(authStatus || '{"register": false}').register);
  //   };

  //   checkAuth();
  // },[])

  return (
      <ThemeProvider value={MyDarkTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.contentWrapper}>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </View>
          </View>
        </SafeAreaView>
      </ThemeProvider>
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