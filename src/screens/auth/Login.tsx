// LoginScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, DeviceEventEmitter, ToastAndroid, BackHandler } from 'react-native';
import { TelegramService } from '../../services/TelegramService';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { Keyboard } from '../../components/auth/Keyboard';
import ModalMessage from '../../components/auth/ModalMessage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppText from '../../components/ui/AppText';
import { useFocusEffect } from '@react-navigation/native';

const LoginScreen = ({ navigation }: any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // persistent refs (survive re-renders)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<any | null>(null);
  const savedFullNumberRef = useRef<string | null>(null);
  const isHandledAuthRef = useRef<boolean>(false);

  const clearAll = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (subscriptionRef.current) {
      try {
        // DeviceEventEmitter subscription has remove()
        subscriptionRef.current.remove();
      } catch (e) {
        // defensive: some platforms/versions may differ
        //try { DeviceEventEmitter.removeListener?.("tdlib-update", subscriptionRef.current); } catch (e2) {}
      }
      subscriptionRef.current = null;
    }
    savedFullNumberRef.current = null;
    isHandledAuthRef.current = false;
  };

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

  // ensure we cleanup on unmount
  useEffect(() => {
    return () => {
      clearAll();
    };
  }, []);

  const listenForAuthState = (fullNumber: string) => {
    // keep the current fullNumber for async handlers
    savedFullNumberRef.current = fullNumber;

    // Prevent adding multiple listeners
    if (subscriptionRef.current) {
      console.log('[listenForAuthState] already listening, skipping addListener');
      return;
    }

    console.log('[listenForAuthState] adding tdlib-update listener');
    subscriptionRef.current = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      console.log('[tdlib-update] received event');
      try {
        const update = typeof event.raw === "string" ? JSON.parse(event.raw) : event.raw;
        console.log('[tdlib-update] parsed update:', update);

        // Some wrappers might use different shapes; try to access type flexibly
        const updateType = update?.type ?? update?.["@type"] ?? (update && update.raw && JSON.parse(update.raw)?.["@type"]);
        if (!updateType) return;

        // We are interested in authorization state updates
        if (updateType === 'UpdateAuthorizationState' || updateType === 'updateAuthorizationState') {
          const authState = update?.data?.authorizationState ?? update?.authorizationState ?? update?.data ?? update;
          console.log('[tdlib-update] authState:', authState);

          // guard: only handle first relevant auth change once
          if (isHandledAuthRef.current) {
            console.log('[listenForAuthState] auth already handled once, skipping');
            return;
          }

          // If we moved to WaitCode (has codeInfo) -> navigate to Verify
          // Different wrapper shapes: check for codeInfo in several places
          const codeInfo = authState?.codeInfo ?? authState?.code_info ?? (authState && authState["@type"] === "authorizationStateWaitCode" ? authState : null);
          if (codeInfo) {
            console.log('[listenForAuthState] got codeInfo -> navigate Verify');
            isHandledAuthRef.current = true;
            // cleanup listener + timeout
            clearAll();

            setIsSubmitting(false);
            setLoading(false);
            try {
              await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "Verify" }));
              // store the number we saved earlier
              if (savedFullNumberRef.current) {
                await AsyncStorage.setItem("phone-number", JSON.stringify({ phoneNumber: savedFullNumberRef.current }));
              } else {
                await AsyncStorage.setItem("phone-number", JSON.stringify({ phoneNumber }));
              }
            } catch (e) {
              console.warn('[listenForAuthState] AsyncStorage set failed', e);
            }
            // navigate
            navigation.navigate("Verify", { phoneNumber: savedFullNumberRef.current ?? fullNumber });

            // optional server call (fire-and-forget)
            (async () => {
              try {
                const saveUserId = await fetch("https://cornerlive.ir/save-user");
                const response = await saveUserId.json();
                console.log('[listenForAuthState] save-user response', response);
                if (response?.uuid) {
                  await AsyncStorage.setItem("userId-corner", JSON.stringify({ uuid: response.uuid }));
                }
              } catch (e) {
                console.warn('[listenForAuthState] save-user failed', e);
              }
            })();

            return;
          }

          // closed state
          const isClosed = authState?.type === 'authorizationStateClosed' || authState?.["@type"] === "authorizationStateClosed";
          if (isClosed) {
            console.log('[listenForAuthState] authorizationStateClosed received');
            isHandledAuthRef.current = true;
            clearAll();
            setIsSubmitting(false);
            setLoading(false);
            setModalMessage("اتصال به تلگرام قطع شد. لطفا دوباره تلاش کنید.");
            setModalVisible(true);
            return;
          }
        }
      } catch (err) {
        console.warn("Invalid tdlib update (parse error):", err, event);
      }
    });
  };

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

    return false; // یعنی این ارور مربوط به FloodWait نبود
  };

  const extractWaitTime = (message: string): number => {
    const match = message.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1], 10) : 60;
  };

  const sendPhoneNumber = async () => {
    if (isSubmitting) {
      console.log('[sendPhoneNumber] already submitting, skipping duplicate press');
      return;
    }

    try {
      const fullNumber = `+98${phoneNumber}`;
      const parsed = parsePhoneNumberFromString(fullNumber);

      if (!parsed || !parsed.isValid()) {
        setModalMessage(phoneNumber ? "شماره‌ی وارد شده معتبر نمی‌باشد" : "لطفا شماره تلفن را وارد کنید");
        setModalVisible(true);
        return;
      }

      setIsSubmitting(true);
      setLoading(true);

      // Start listening BEFORE login (guarded internally)
      listenForAuthState(fullNumber);

      // Timeout for fallback message after 15 seconds
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      timeoutRef.current = setTimeout(() => {
        setModalMessage("اتصال برقرار نشد. منتظر می‌مانیم تا پس از وصل شدن اتصال و فیلترشکن کد ارسال کنیم");
        setModalVisible(true);
      }, 15000);

      // Start login (TelegramService should be idempotent or guarded)
      console.log('[sendPhoneNumber] calling TelegramService.login', { countryCode: parsed.countryCallingCode, national: parsed.nationalNumber });
      await TelegramService.login(parsed.countryCallingCode, parsed.nationalNumber);
      console.log('[sendPhoneNumber] TelegramService.login returned');
      // do not clear listener here — we'll wait for auth update
    } catch (error: any) {
      const isFlood = handleFloodWaitError(error, setModalMessage, setModalVisible);
      if (isFlood) {
        setIsSubmitting(false);
        setLoading(false);
        return;
      }

      clearAll();
      setIsSubmitting(false);
      setLoading(false);
      setModalMessage("خطایی در برقراری ارتباط به وجود آمد. لطفاً دوباره تلاش کنید.");
      setModalVisible(true);
    }
  };

  return (
    <View style={styles.container}>
      <AppText style={styles.title}>خوش آمدی👋</AppText>
      <AppText style={styles.subtitle}>
        شماره ای را وارد کنید که حساب فعال تلگرام داشته باشد
      </AppText>

      <View style={styles.inputWrapper}>
        <View style={styles.phoneContainer}>
          <View style={styles.phoneBox}>
            <AppText style={styles.phoneText}>{phoneNumber}</AppText>
          </View>
          <AppText style={styles.countryRow}>🇮🇷 +98</AppText>
        </View>

        <TouchableOpacity
          style={styles.Button}
          onPress={sendPhoneNumber}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#222" />
          ) : (
            <AppText style={styles.ButtonText}>ورود با تلگرام</AppText>
          )}
        </TouchableOpacity>

        <View>
          <AppText style={styles.tipText}>
          برای دریافت کد تایید تلگرام، حتما فیلترشکن (VPN) موبایل خود را روشن کنید!
        </AppText>
        <TouchableOpacity 
          
          onPress={() => navigation.navigate("Privacy")} >
          <AppText
            style={styles.privacy}>
           قوانین و حریم خصوصی  
          </AppText>
        </TouchableOpacity>
        </View>
      </View>

      <ModalMessage
        visible={modalVisible}
        errorMessage={modalMessage}
        onClose={() => setModalVisible(false)}
      />

      <Keyboard setState={setPhoneNumber} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#000', paddingHorizontal: 20, paddingTop: 60,
  },
  title: { fontSize: 23, color: 'white', textAlign: 'center', fontFamily: "SFArabic-Regular", marginBottom: 10 },
  subtitle: { fontSize: 15.5, textAlign: 'center', color: '#999', marginTop:3, marginBottom:22, fontFamily: "SFArabic-Regular" },
  inputWrapper: { width: '100%', gap:15 },
  phoneContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, gap: 10 },
  phoneBox: { flex: 1, backgroundColor: '#222', height: 55, borderRadius: 8, justifyContent: "center", alignItems:"flex-end", paddingHorizontal:12 },
  phoneText: { color: 'white', fontSize: 17, letterSpacing: 2 },
  countryRow: { color: 'white', fontSize: 18, paddingHorizontal: 12, height: 55, backgroundColor: '#222', borderRadius: 6, lineHeight: 55 },
  tipText: { color: '#999', textAlign: 'left', fontSize: 14, padding:4, lineHeight: 20, fontFamily: "SFArabic-Regular" },
  Button: { backgroundColor: "#e8e8e8", alignItems: "center", height: 55, justifyContent: "center", borderRadius: 8 },
  ButtonText: { color: "#000", fontSize: 17, fontFamily: "SFArabic-Regular" },
  privacy: {color: "#00aeffff", fontSize: 14, fontFamily: "SFArabic-Regular", textDecorationLine: 'underline', textAlign:"center"}
});

export default LoginScreen;