import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  I18nManager,
  useWindowDimensions,
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
  const { phoneNumber } = route.params;

  const ref = useBlurOnFulfill({ value, cellCount: CELL_COUNT });
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({ value, setValue });

  const { width } = useWindowDimensions();

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      checkAuthState()
      verifyCode();
    }
  }, [value]);

  const verifyCode = async () => {
    navigation.navigate("PickTeams");
    setLoading(true);
    try {
      const verifyCode = await TelegramService.verifyCode(value);
      if (verifyCode.success === true) {
        setIsValid(true);
        await AsyncStorage.setItem("auth-status", JSON.stringify({ register: false, route: "PickTeams" }));
        navigation.navigate("PickTeams");
      } else {
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
        keyboardType="number-pad"
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
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'vazir',
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: 'vazir',
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
    borderColor: '#229ED9',
  },
  cellText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'vazir',
  },
  focusCell: {
    borderColor: '#1E90FF',
  },
  errorCell: {
    borderColor: '#ff4d4f',
  },
  successCell: {
    borderColor: '#4caf50',
  },
});
