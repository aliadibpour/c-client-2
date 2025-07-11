import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PickTeamsScreen from '../screens/setup/PickTeams';
import RankTeamsScreen from '../screens/setup/RankTeams';
import Comments from '../screens/tabs/Home/Comments';
import FullPhotoScreen from '../screens/tabs/Home/FullPhotoScreen';
import ChannelScreen from '../screens/tabs/Channel';
import ChannelDetailScreen from '../screens/tabs/ChannelDetail.Screen';

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
      {!isAuth ? (
        <Stack.Screen name="Tabs" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
      <Stack.Screen name="PickTeams" component={PickTeamsScreen} />
      <Stack.Screen name="Priority" component={RankTeamsScreen} />
      <Stack.Screen name="Comments" component={Comments} />
      <Stack.Screen name="FullPhoto" component={FullPhotoScreen} />
      <Stack.Screen name="Channel" component={ChannelScreen} />
      <Stack.Screen name="ChannelDetail" component={ChannelDetailScreen} />
    </Stack.Navigator>
  );
}
