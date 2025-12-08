import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/Login';
import VerifyScreen from '../screens/auth/Verify';
import IntroScreen from '../screens/auth/Intro';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from '../services/TelegramService';
import TwoStepScreen from '../screens/auth/TwoStepScreen';

const Stack = createNativeStackNavigator<any>();

export default function AuthNavigator() {
  const [initialRouteName, setInitialRouteName] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const authStatus = await AsyncStorage.getItem("auth-status");
      const route = JSON.parse(authStatus || '{"status":"Intro"}').status || "Intro";
      console.log(authStatus)

      const authStateTdlib = await TelegramService.getAuthState() 
      const authType = JSON.parse(authStateTdlib.data)["@type"];
      if (authType !== "authorizationStateWaitCode" || authType !== "authorizationStateWaitPassword") {
        setInitialRouteName("Intro")
        await AsyncStorage.removeItem("auth-status")
        await AsyncStorage.removeItem("phone-number")
      }
      else {
        setInitialRouteName(route);
      }
    };
    checkAuth();
  }, []);

  
  if (!initialRouteName) {
    return null;
  }
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Intro" component={IntroScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Verify" component={VerifyScreen} />
      <Stack.Screen name="TwoStep" component={TwoStepScreen} />
    </Stack.Navigator>
  );
}
