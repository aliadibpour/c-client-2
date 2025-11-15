import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useNavigation } from '@react-navigation/native';

import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import PickTeamsScreen from '../screens/setup/PickTeams';
import RankTeamsScreen from '../screens/setup/RankTeams';
import Comments from '../screens/tabs/Comments';
import FullPhotoScreen from '../screens/tabs/FullPhotoScreen';
import ChannelScreen from '../screens/tabs/Channel';
import ChannelDetailScreen from '../screens/tabs/ChannelDetail.Screen';
import ProfileUser from '../screens/tabs/ProfileUser';
import TdLib from 'react-native-tdlib';

const Stack = createNativeStackNavigator<any>();

function RootStack({ isAuth }: { isAuth: string }) {
  const navigation = useNavigation();

  useEffect(() => {
    if (isAuth === 'home') {
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] } as any);
    } else if (isAuth === 'pick-team') {
      navigation.reset({ index: 0, routes: [{ name: 'PickTeams' }] } as any);
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Auth' }] } as any);
    }
  }, [isAuth]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="PickTeams" component={PickTeamsScreen} />
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Priority" component={RankTeamsScreen} />
      <Stack.Screen name="Comments" component={Comments} />
      <Stack.Screen name="FullPhoto" component={FullPhotoScreen} />
      <Stack.Screen name="ProfileUser" component={ProfileUser} />
      <Stack.Screen name="Channel" component={ChannelScreen} />
      <Stack.Screen name="ChannelDetail" component={ChannelDetailScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const [isAuth, setIsAuth] = useState<string>('loading');

  useEffect(() => {
    const checkAuth = async () => {
      //await AsyncStorage.removeItem("auth-status")
      //await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "home" }))
      const authStatus = await AsyncStorage.getItem('auth-status');
      const teams = await AsyncStorage.getItem("teams")
      const userId = await AsyncStorage.getItem("userId-corner")
      console.log(teams, authStatus, ';;;');
      console.log(userId);
      setIsAuth(JSON.parse(authStatus || '{"status": "auth"}').status);
    };

    checkAuth();
  }, []);

  if (isAuth === 'loading') return null; // یا یک Splash Screen

  return (
      <RootStack isAuth={isAuth} />
  );
}
