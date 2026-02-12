// AuthNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/Login';
import VerifyScreen from '../screens/auth/Verify';
import IntroScreen from '../screens/auth/Intro';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TelegramService } from '../services/TelegramService';
import TwoStepScreen from '../screens/auth/TwoStepScreen';

const Stack = createNativeStackNavigator<any>();

// helper: robust parse of various shapes returned by TelegramService.getAuthState()
const parseTdlibAuthState = (raw: any) => {
  try {
    if (!raw) return { authType: null, parsed: null };
    let parsed = raw;
    // some wrappers return { data: "..." } or { data: {...} } or a raw string
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw);
    } else if (raw && typeof raw === 'object' && raw.data) {
      if (typeof raw.data === 'string') parsed = JSON.parse(raw.data);
      else parsed = raw.data;
    }
    const authType = parsed?.['@type'] ?? parsed?.type ?? null;
    return { authType, parsed };
  } catch (e) {
    // fallback: try to read common fields defensively
    try {
      const maybe = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const authType = maybe?.['@type'] ?? maybe?.type ?? null;
      return { authType, parsed: maybe };
    } catch {
      return { authType: null, parsed: null };
    }
  }
};

export default function AuthNavigator() {
  const [initialRouteName, setInitialRouteName] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      // read saved route (fallback)
      const authStatus = await AsyncStorage.getItem("auth-status");
      const savedRoute = (authStatus ? (JSON.parse(authStatus).status) : "Intro") || "Intro";

      try {
        const authStateRaw: any = await TelegramService.getAuthState();
        const { authType } = parseTdlibAuthState(authStateRaw);

        // If TDLib explicitly says we are waiting for code -> go to Verify
        if (authType === "authorizationStateWaitCode" || authType === "authorization_state_wait_code" || authType === "authorizationStateWaitCodeType") {
          setInitialRouteName("Verify");
          return;
        }

        // If TDLib explicitly says password needed -> go to TwoStep
        if (authType === "authorizationStateWaitPassword" || authType === "authorization_state_wait_password") {
          setInitialRouteName("TwoStep");
          return;
        }

        // Other explicit ready / closed states -> fallback to Intro
        if (authType === "authorizationStateReady" || authType === "authorization_state_ready" || authType === "authorizationStateClosed" || authType === "authorization_state_closed") {
          setInitialRouteName("Intro");
          // optionally you might clear auth-status here if you want to force fresh login:
          // await AsyncStorage.removeItem("auth-status");
          return;
        }

        // If TDLib gave nothing useful, use saved AsyncStorage route
        setInitialRouteName(savedRoute);
      } catch (e) {
        // If getAuthState fails for any reason, fallback to saved route
        console.warn('[AuthNavigator] getAuthState failed, falling back to savedRoute', e);
        setInitialRouteName(savedRoute);
      }
    };

    checkAuth();
  }, []);

  if (!initialRouteName) {
    return null; // یا یک Splash ساده
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
