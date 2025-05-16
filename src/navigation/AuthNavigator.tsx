import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/Login';
import VerifyScreen from '../screens/auth/Verify';
import IntroScreen from '../screens/auth/Intro';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator<any>();

export default function AuthNavigator() {
  const [initialRouteName, setInitialRouteName] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const authStatus = await AsyncStorage.getItem("auth-status");
      const route = JSON.parse(authStatus || '{"route":"Intro"}').route;
      console.log(authStatus)
      setInitialRouteName(route);
    };
    checkAuth();
  }, []);

  
  if (!initialRouteName) {
    return null;
  }
  return (
    <Stack.Navigator initialRouteName={"Intro"} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Intro" component={IntroScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Verify" component={VerifyScreen} />
    </Stack.Navigator>
  );
}
