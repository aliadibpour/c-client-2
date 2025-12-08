// VerifyScreen.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert, useWindowDimensions, BackHandler, TouchableOpacity,
} from 'react-native';
import {
  CodeField, Cursor, useBlurOnFulfill, useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keyboard } from '../../components/auth/Keyboard';
import { TelegramService } from '../../services/TelegramService';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import ModalMessage from '../../components/auth/ModalMessage';
import AppText from '../../components/ui/AppText';

const CELL_COUNT = 5;
type VerifyScreenRouteProp = RouteProp<{ Verify: { phoneNumber: string } }, 'Verify'>;

export default function VerifyScreen({ navigation }: any) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValid, setIsValid] = useState<null | boolean>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const route = useRoute<VerifyScreenRouteProp>();
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  useEffect(() => {
    const getNumber = async () => {
      try {
        const phone = await AsyncStorage.getItem("phone-number");
        if (phone) {
          const parsed = JSON.parse(phone);
          setPhoneNumber(parsed?.phoneNumber ?? null);
        }
      } catch (e) { /* ignore */ }
    };
    getNumber();
  }, []);

  const ref = useBlurOnFulfill({ value, cellCount: CELL_COUNT });
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({ value, setValue });

  const { width } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        BackHandler.exitApp();
        return true;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

      return () => {
        backHandler.remove();
      };
    }, [])
  );

  // Prevent duplicate submissions
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      if (submitLockRef.current) {
        console.log('[VerifyScreen] submit already in progress, skipping duplicate');
        return;
      }
      submitLockRef.current = true;
      (async () => {
        try {
          await verifyCode();
        } finally {
          submitLockRef.current = false;
        }
      })();
    }
  }, [value]);

  const handleFloodWaitError = (error: any) => {
    if (!error || !error.message) return false;
    const message = error.message;
    if (message.includes("FLOOD_WAIT")) {
      const waitTime = extractWaitTime(message);
      setModalMessage(`شما بیش از حد تلاش کردید. لطفاً ${waitTime} ثانیه دیگر صبر کنید.`);
      setModalVisible(true);
      return true;
    }
    if (message.includes("Too Many Requests") || message.includes("TooManyRequests")) {
      setModalMessage("شما بیش از حد درخواست ارسال کرده‌اید. لطفاً مدتی بعد دوباره تلاش کنید.");
      setModalVisible(true);
      return true;
    }
    return false;
  };

  const extractWaitTime = (message: string): number => {
    const match = message.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1], 10) : 60;
  };

  // ---------- NEW: helper to parse auth state ----------
  const parseAuthState = (authStateRaw: any) => {
    if (!authStateRaw) return null;
    let parsed = authStateRaw;
    try {
      if (authStateRaw && typeof authStateRaw === 'object' && authStateRaw.data) {
        parsed = typeof authStateRaw.data === 'string' ? JSON.parse(authStateRaw.data) : authStateRaw.data;
      } else if (typeof authStateRaw === 'string') {
        parsed = JSON.parse(authStateRaw);
      }
    } catch (e) {
      parsed = authStateRaw;
    }
    const authType = parsed?.["@type"] ?? parsed?.type ?? null;
    return { parsed, authType };
  };

  // ---------- NEW: after-verify branching ----------
  const handlePostVerifyAuth = async () => {
    try {
      const authState: any = await TelegramService.getAuthState();
      const { parsed, authType } = parseAuthState(authState) ?? {};
      console.log('[VerifyScreen] post-verify authType:', authType, parsed);

      // Common TDLib states:
      // authorizationStateReady -> logged in
      // authorizationStateWaitPassword -> 2FA required
      // authorizationStateWaitRegistration -> need to register
      // authorizationStateWaitPhoneNumber / WaitCode -> go back to login
      // authorizationStateClosed -> connection closed / error

      if (authType === 'authorizationStateReady' || authType === 'authorization_state_ready' || authType === 'authorizationStateReady') {
        // fully logged in
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "pick-team" }));
        navigation.navigate("PickTeams");
        return;
      }

      if (authType === 'authorizationStateWaitPassword' || authType === 'authorization_state_wait_password' || (parsed && parsed['@type'] && parsed['@type'].toLowerCase().includes('password'))) {
        // 2-step/password required -> go to TwoStep screen
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "TwoStep" }));
        navigation.navigate("TwoStep", { phoneNumber });
        return;
      }

      if (authType === 'authorizationStateWaitRegistration' || authType === 'authorization_state_wait_registration') {
        // account needs registration (rare for existing TG account)
        setModalMessage("حساب شما نیاز به ثبت نام دارد. لطفا مراحل ثبت نام را انجام دهید.");
        setModalVisible(true);
        // optionally navigate to a Register screen if you have one:
        // navigation.navigate("Register");
        return;
      }

      if (authType === 'authorizationStateWaitCode' || authType === 'authorization_state_wait_code') {
        // still waiting for code (maybe code not yet arrived)
        setModalMessage("کد هنوز آماده نشده. اگر کد را دریافت نکردید، دوباره شماره را ارسال کنید.");
        setModalVisible(true);
        return;
      }

      if (authType === 'authorizationStateClosed' || authType === 'authorization_state_closed') {
        setModalMessage("ارتباط با سرور قطع شد. لطفا دوباره تلاش کنید.");
        setModalVisible(true);
        return;
      }

      // fallback: unknown/unexpected state
      setModalMessage("حالت احراز هویت نامشخص است. لطفا دوباره شماره را ارسال کنید یا اپ را ری‌استارت کنید.");
      setModalVisible(true);
      // optionally route user back to Login
      // navigation.navigate("Login");
    } catch (e: any) {
      console.warn('[handlePostVerifyAuth] failed', e);
      // If the error message contains PASSWORD-related hint, go to TwoStep
      const errMsg = e?.message ?? '';
      if (errMsg && errMsg.toUpperCase().includes('PASSWORD')) {
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "TwoStep" }));
        navigation.navigate("TwoStep", { phoneNumber });
        return;
      }
      setModalMessage("خطا در بررسی وضعیت احراز هویت. لطفا دوباره تلاش کنید.");
      setModalVisible(true);
    }
  };

  const verifyCode = async () => {
    if (loading) {
      console.log('[verifyCode] already loading, skip');
      return;
    }
    setLoading(true);
    try {
      const verifyRes:any = await TelegramService.verifyCode(value);
      console.log('[verifyCode] result', verifyRes);

      // If the service returns explicit success
      if (verifyRes?.success === true) {
        setIsValid(true);
        // After successful verify, check the auth state and route accordingly
        await handlePostVerifyAuth();
        return;
      }

      // If verifyRes explicitly indicates password required (some wrappers do)
      if (verifyRes?.error && typeof verifyRes.error === 'object') {
        const errMsg = (verifyRes.error.message ?? '') as string;
        if (errMsg.toUpperCase().includes('PASSWORD') || errMsg.toUpperCase().includes('TWO-STEP') || errMsg.toUpperCase().includes('TWO_STEP')) {
          await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "TwoStep" }));
          navigation.navigate("TwoStep", { phoneNumber });
          return;
        }
        const isFlood = handleFloodWaitError(verifyRes.error);
        if (isFlood) {
          setLoading(false);
          return;
        }
      }

      // default: show invalid
      setIsValid(false);
      setTimeout(() => {
        setValue('');
        setIsValid(null);
      }, 1500);
    } catch (err: any) {
      console.warn('[verifyCode] caught', err);

      // If exception message suggests 2FA password required, route to TwoStep
      const msg = err?.message ?? '';
      if (msg.toUpperCase().includes('PASSWORD') || msg.toUpperCase().includes('TWO-STEP') || msg.toUpperCase().includes('PASSWORD_HASH')) {
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "two-step" }));
        navigation.navigate("TwoStep", { phoneNumber });
        setLoading(false);
        return;
      }

      const isFlood = handleFloodWaitError(err);
      if (isFlood) {
        setLoading(false);
        return;
      }

      Alert.alert('خطا', 'کد وارد شده اشتباه است');
    } finally {
      setLoading(false);
    }
  };

  const editNumber = async () => {
    await AsyncStorage.removeItem("auth-status");
    await AsyncStorage.removeItem("phone-number");
    navigation.navigate("Login");
  };

  // initial check (on mount) — optional
  useEffect(() => {
    (async () => {
      try {
        const authState: any = await TelegramService.getAuthState();
        const { authType } = parseAuthState(authState) ?? {};
        if (authType && authType !== "authorizationStateWaitCode" && authType !== "authorization_state_wait_code") {
          // if not waiting for code, show hint
          console.log('[VerifyScreen] initial authType', authType);
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  return (
    <View style={[styles.container, { paddingHorizontal: width * 0.08 }]}>
      <AppText style={styles.title}>برنامه تلگرامتون رو چک کنید</AppText>
      <AppText style={styles.description}>{`ما کد رو فرستادیم به برنامه تلگرام با شماره ی ${phoneNumber ?? ''}`}</AppText>

      <CodeField
        ref={ref}
        {...props}
        value={value}
        onChangeText={setValue}
        cellCount={CELL_COUNT}
        rootStyle={styles.codeFieldRoot}
        editable={false}
        showSoftInputOnFocus={false}
        textContentType="oneTimeCode"
        renderCell={({ index, symbol, isFocused }) => {
          const isError = isValid === false;
          const isSuccess = isValid === true;
          const isTyping = isFocused && value.length < CELL_COUNT && isValid === null;

          const cellStyle = [
            styles.cell,
            symbol && styles.filledCell,
            isSuccess && styles.successCell,
            isError && styles.errorCell,
            isTyping && styles.focusCell,
          ];

          return (
            <View key={index} style={cellStyle} onLayout={getCellOnLayoutHandler(index)}>
              <AppText style={styles.cellText}>
                {symbol || (isFocused ? <Cursor /> : null)}
              </AppText>
            </View>
          );
        }}
      />

      <ModalMessage
        visible={modalVisible}
        errorMessage={modalMessage}
        onClose={() => setModalVisible(false)}
        navigateText='ارسال دوباره'
        onNavigate={() => navigation.navigate("Login")}
        title='متاسفم'
      />

      <TouchableOpacity onPress={() => editNumber()}>
        <AppText style={styles.editNumber}>ویرایش شماره تلفن</AppText>
      </TouchableOpacity>

      <Keyboard setState={setValue} />

      {loading && <ActivityIndicator size="large" color="#fff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  title: { fontSize: 24, fontFamily: "SFArabic-Regular", color: '#fff', textAlign: 'center', marginBottom:8, marginTop: 95 },
  description: { fontSize: 14.5, lineHeight: 24, color: '#aaa', textAlign: 'center', marginBottom: 22, fontFamily: "SFArabic-Regular" },
  codeFieldRoot: { justifyContent: "center", flexDirection: 'row', gap: 12, direction: "ltr" },
  cell: { width: 39, height: 39, borderRadius: 5, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#333', borderColor: '#333' },
  filledCell: { borderColor: '#444' },
  cellText: { color: '#fff', fontSize: 20, fontFamily: 'vazir' },
  focusCell: { borderColor: '#555' },
  errorCell: { borderColor: '#ff4d4f' },
  successCell: { borderColor: '#00aaffff' },
  editNumber: { color: "#54afff", fontFamily: "SFArabic-Regular", fontSize:15, textAlign: "center", marginTop: 22 }
});
