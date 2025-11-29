// VerifyScreen.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert, useWindowDimensions, ToastAndroid, BackHandler, TouchableOpacity,
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

  const backPressCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        // فقط یک بار فشار -> خارج شدن از اپ
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
      // avoid duplicate triggers
      if (submitLockRef.current) {
        console.log('[VerifyScreen] submit already in progress, skipping duplicate');
        return;
      }
      submitLockRef.current = true;
      (async () => {
        try {
          // optional: check auth state before verify
          await checkAuthState();
          await verifyCode();
        } finally {
          submitLockRef.current = false;
        }
      })();
    }
  }, [value]);

  const handleFloodWaitError = (error: any, setModalMessage: Function, setModalVisible: Function) => {
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

  const verifyCode = async () => {
    if (loading) {
      console.log('[verifyCode] already loading, skip');
      return;
    }
    setLoading(true);
    try {
      const verifyRes = await TelegramService.verifyCode(value);
      console.log('[verifyCode] result', verifyRes);

      if (verifyRes?.success === true) {
        setIsValid(true);
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "pick-team" }));
        navigation.navigate("PickTeams");
      } else {
        const isFlood = handleFloodWaitError(verifyRes?.error, setModalMessage, setModalVisible);
        if (isFlood) {
          setLoading(false);
          return;
        }
        setIsValid(false);
        setTimeout(() => {
          setValue('');
          setIsValid(null);
        }, 1500);
      }
    } catch (err: any) {
      console.warn('[verifyCode] caught', err);
      Alert.alert('خطا', 'کد وارد شده اشتباه است');
    } finally {
      setLoading(false);
    }
  };

  const checkAuthState = async() => {
    try {
      const authState: any = await TelegramService.getAuthState();
      // authState.data may be string or object
      let parsedData: any = authState;
      if (authState && typeof authState === 'object' && authState.data) {
        try {
          parsedData = typeof authState.data === 'string' ? JSON.parse(authState.data) : authState.data;
        } catch (e) {
          parsedData = authState.data;
        }
      } else if (typeof authState === 'string') {
        try { parsedData = JSON.parse(authState); } catch (e) { parsedData = authState; }
      }

      const authType = parsedData?.["@type"] ?? parsedData?.type ?? null;
      console.log('[checkAuthState] Auth State:', authType);

      if (authType !== "authorizationStateWaitCode") {
        setModalMessage("کد تایید شما منقضی شده. لطفا دوباره شماره تلفن را ارسال کنید");
        setModalVisible(true);
      }
    } catch (e) {
      console.warn('[checkAuthState] failed', e);
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
      await checkAuthState();
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
