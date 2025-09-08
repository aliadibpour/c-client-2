import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, DeviceEventEmitter, ToastAndroid, BackHandler } from 'react-native';
import { TelegramService } from '../../services/TelegramService';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { Keyboard } from '../../components/auth/Keyboard';
import ModalMessage from '../../components/auth/ModalMessage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LoginScreen = ({ navigation }: any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  let timeout: NodeJS.Timeout | undefined;
  let subscription: any;

  const clearAll = () => {
    if (timeout) clearTimeout(timeout);
    if (subscription) subscription.remove();
  };

  const backPressCount = useRef(0);
  useEffect(() => {
    const backAction = () => {
      if (backPressCount.current === 0) {
        backPressCount.current = 1;
        ToastAndroid.show('برای خروج دوباره کلیک کنید', ToastAndroid.SHORT);
        setTimeout(() => { backPressCount.current = 0; }, 2000);
        return true;
      } else {
        BackHandler.exitApp();
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const listenForAuthState = (fullNumber: string) => {
    subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
      console.log("Received tdlib update");
      try {
        const update = JSON.parse(event.raw);
        console.log(update);

        if (update.type === 'UpdateAuthorizationState') {
          const authState = update.data.authorizationState;

          // اگر codeInfo وجود داشت یعنی وارد WaitCode شدیم
          if (authState.codeInfo) {
            clearAll();
            setIsSubmitting(false);
            setLoading(false);
            await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "Verify"}));
            await AsyncStorage.setItem("phone-number", JSON.stringify({ phoneNumber }))
            navigation.navigate("Verify", { phoneNumber: fullNumber });

            const saveUserId = await fetch("http://192.168.1.102:9000/save-user")
            const response = await saveUserId.json()
            console.log(response, "save user id response");
            await AsyncStorage.setItem("userId-corner", JSON.stringify({ uuid: response.uuid }));
            return;
          }

          // اگر به هر دلیلی استیت کلوزد شد
          if (authState.type === 'authorizationStateClosed') {
            clearAll();
            setIsSubmitting(false);
            setLoading(false);
            setModalMessage("اتصال به تلگرام قطع شد. لطفا دوباره تلاش کنید.");
            setModalVisible(true);
          }
        }

      } catch (err) {
        console.warn("Invalid tdlib update:", event);
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
     //await TelegramService.logout()
    if (isSubmitting) return;

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

      // Start listening before login
      listenForAuthState(fullNumber);

      // Timeout for fallback message after 15 seconds
      timeout = setTimeout(() => {
        setModalMessage("اتصال برقرار نشد. منتظر می‌مانیم تا پس از وصل شدن اتصال و فیلترشکن کد ارسال کنیم");
        setModalVisible(true);
      }, 15000);

      // Start login
      await TelegramService.login(parsed.countryCallingCode, parsed.nationalNumber);

    } catch (error) {
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
      <Text style={styles.title}>خوش آمدی👋</Text>
      <Text style={styles.subtitle}>
        شماره ای را وارد کنید که حساب فعال تلگرام داشته باشد
      </Text>

      <View style={styles.inputWrapper}>
        <View style={styles.phoneContainer}>
          <View style={styles.phoneBox}>
            <Text style={styles.phoneText}>{phoneNumber}</Text>
          </View>
          <Text style={styles.countryRow}>🇮🇷 +98</Text>
        </View>

        <TouchableOpacity
          style={styles.Button}
          onPress={sendPhoneNumber}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#222" />
          ) : (
            <Text style={styles.ButtonText}>ورود با تلگرام</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.tipText}>
          برای دریافت کد تایید تلگرام، حتما فیلترشکن (VPN) موبایل خود را روشن کنید!
        </Text>
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
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 23,
    color: 'white',
    textAlign: 'center',
    fontFamily: "SFArabic-Regular",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15.5,
    textAlign: 'center',
    color: '#999',
    marginTop:3,
    marginBottom:22,
    fontFamily: "SFArabic-Regular",
  },
  inputWrapper: {
    width: '100%',
    gap:15
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    gap: 10,
  },
  phoneBox: {
    flex: 1,
    backgroundColor: '#222',
    height: 55,
    borderRadius: 8,
    justifyContent: "center",
    alignItems:"flex-end",
    paddingHorizontal:12
  },
  phoneText: {
    color: 'white',
    fontSize: 17,
    letterSpacing: 2,
  },
  countryRow: {
    color: 'white',
    fontSize: 18,
    paddingHorizontal: 12,
    height: 55,
    backgroundColor: '#222',
    borderRadius: 6,
    lineHeight: 55
  },
    tipText: {
    color: '#999',
    textAlign: 'left',
    fontSize: 14,
    padding:4,
    lineHeight: 20,
    fontFamily: "SFArabic-Regular"
  },
  Button: {
    backgroundColor: "#e8e8e8",
    alignItems: "center",
    height: 55,
    justifyContent: "center",
    borderRadius: 8,
  },
  ButtonText: {
    color: "#000",
    fontSize: 17,
    fontFamily: "SFArabic-Regular"
  },
});

export default LoginScreen;
