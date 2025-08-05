import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  I18nManager,
  useWindowDimensions,
  ToastAndroid,
  BackHandler,
  TouchableOpacity,
} from 'react-native';
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keyboard } from '../../components/auth/Keyboard';
import { TelegramService } from '../../services/TelegramService';
import { RouteProp, useRoute } from '@react-navigation/native';
import ModalMessage from '../../components/auth/ModalMessage';

I18nManager.forceRTL(true);

const CELL_COUNT = 5;
type VerifyScreenRouteProp = RouteProp<{ Verify: { phoneNumber: string } }, 'Verify'>;

export default function VerifyScreen({ navigation }: any) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValid, setIsValid] = useState<null | boolean>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const route = useRoute<VerifyScreenRouteProp>();
  //const { phoneNumber } = route.params;
  const [phoneNumber, setPhoneNumber] = useState()
  useEffect(() => {
    const getNumber = async () => {
      const phone = await AsyncStorage.getItem("phone-number")
      setPhoneNumber(JSON.parse(phone || "{phoneNumber: false}").phoneNumber)
      console.log(phoneNumber)
    }
    getNumber()
  }, [])

  const ref = useBlurOnFulfill({ value, cellCount: CELL_COUNT });
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({ value, setValue });

  const { width } = useWindowDimensions();

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

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      checkAuthState()
      verifyCode();
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

    return false; // یعنی این ارور مربوط به FloodWait نبود
  };

  const extractWaitTime = (message: string): number => {
    const match = message.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1], 10) : 60;
  };

  const verifyCode = async () => {
    //navigation.navigate("PickTeams");
    setLoading(true);
    try {
      const verifyCode = await TelegramService.verifyCode(value);
      console.log(verifyCode);
      
      if (verifyCode.success === true) {
        setIsValid(true);
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "pick-team"}));
        navigation.navigate("PickTeams");
      } else {
        const isFlood = handleFloodWaitError(verifyCode.error, setModalMessage, setModalVisible);
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
      Alert.alert('خطا', 'کد وارد شده اشتباه است');
    } finally {
      setLoading(false);
    }
  };

  const checkAuthState = async() => {
      const authState: any = await TelegramService.getAuthState();
      const authType = JSON.parse(authState.data)["@type"];
      console.log("Auth State:", authType);
        
      if (authType !== "authorizationStateWaitCode") {
        setModalMessage("کد تایید شما منقضی شده. لطفا دوباره شماره تلفن را ارسال کنید")
        setModalVisible(true)
      }
  }

  const editNumber = async () => {
    await AsyncStorage.removeItem("auth-status")
    await AsyncStorage.removeItem("phone-number")
    navigation.navigate("Login")
  }

  //chack the code is expire or no
  useEffect(() => {
    checkAuthState()
  },[])

  return (
    <View style={[styles.container, { paddingHorizontal: width * 0.08 }]}>
      <Text style={styles.title}>برنامه تلگرامتون رو چک کنید</Text>
      <Text style={styles.description}>{`ما کد رو فرستادیم به برنامه تلگرام با شماره ی ${phoneNumber}`}</Text>

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
            <View
              key={index}
              style={cellStyle}
              onLayout={getCellOnLayoutHandler(index)}
            >
              <Text style={styles.cellText}>
                {symbol || (isFocused ? <Cursor /> : null)}
              </Text>
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
        <Text style={styles.editNumber}>ویرایش شماره تلفن</Text>
      </TouchableOpacity>

      <Keyboard setState={setValue} />

      {loading && <ActivityIndicator size="large" color="#fff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    marginTop: 100,
  },
  title: {
    fontSize: 24,
    fontFamily: "SFArabic-Regular",
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 22,
    fontFamily: "SFArabic-Regular",
  },
  codeFieldRoot: {
    justifyContent: "center",
    flexDirection: 'row',
    gap: 12,
    direction: "ltr",
  },
  cell: {
    width: 39,
    height: 39,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
    borderColor: '#333',
  },
  filledCell: {
    borderColor: '#444',
  },
  cellText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'vazir',
  },
  focusCell: {
    borderColor: '#555',
  },
  errorCell: {
    borderColor: '#ff4d4f',
  },
  successCell: {
    borderColor: '#00aaffff',
  },
  editNumber: {
    color: "#54afff",
    fontFamily: "SFArabic-Regular",
    fontSize:15,
    textAlign: "center",
    marginTop: 22
  }
});
