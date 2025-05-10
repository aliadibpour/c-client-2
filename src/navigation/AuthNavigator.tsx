import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/Login';
import VerifyScreen from '../screens/auth/Verify';
import IntroScreen from '../screens/auth/Intro';

const Stack = createNativeStackNavigator<any>();

export default function AuthNavigator() {
  return (
      <Stack.Navigator initialRouteName='Intro' screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Intro" component={IntroScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Verify" component={VerifyScreen} />
      </Stack.Navigator>
  );
}
