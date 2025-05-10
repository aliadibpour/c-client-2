import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator } from 'react-native';
import { View } from 'react-native-reanimated/lib/typescript/Animated';

const Stack = createNativeStackNavigator<any>();

export default function RootNavigator() {

  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  useEffect(() => {
    const checkAuth = async () => {
      const authStatus = await AsyncStorage.getItem("auth-status");
      setIsAuth(JSON.parse(authStatus || '{"register": false}').register);
    };

    checkAuth();
  },[])


  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuth ? (
        <Stack.Screen name="Tabs" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}
