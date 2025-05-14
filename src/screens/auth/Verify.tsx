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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Keyboard } from '../../components/auth/Keyboard';
import { TelegramService } from '../../services/TelegramService';

I18nManager.forceRTL(true);

const CELL_COUNT = 5;

type RootStackParamList = {
  Verify: { phone: string };
  PickTeams: undefined;
};

export default function VerifyScreen() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const ref = useBlurOnFulfill({ value, cellCount: CELL_COUNT });
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({ value, setValue });

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      verifyCode();
    }
  }, [value]);

  const verifyCode = async () => {
    setLoading(true);
    await TelegramService.verifyCode(value)
    const a = await TelegramService.getAuthState()
    console.log(a);
    try {
      await AsyncStorage.setItem("auth-status", JSON.stringify({ register: false, route: "pick-teams" }));
      //navigation.replace('PickTeams');
    } catch (err: any) {
      Alert.alert('خطا', err.message);
      setValue('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingHorizontal: width * 0.08 }]}>
      <Text style={styles.title}>کد تأیید رو وارد کن</Text>
      <Text style={styles.description}>کد به تلگرام شما در دستگاه دیگه ارسال شده</Text>

      <CodeField
        ref={ref}
        {...props}
        value={value}
        onChangeText={setValue}
        cellCount={CELL_COUNT}
        rootStyle={styles.codeFieldRoot}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        editable={false}
        renderCell={({ index, symbol, isFocused }) => (
          <View
            key={index}
            style={[
              styles.cell,
              isFocused && styles.focusCell,
              symbol && styles.filledCell,
            ]}
            onLayout={getCellOnLayoutHandler(index)}
          >
            <Text style={styles.cellText}>
              {symbol || (isFocused ? <Cursor /> : null)}
            </Text>
          </View>
        )}
      />


      <Keyboard setState={setValue}/>

      {loading && <ActivityIndicator size="large" color="#fff" />}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    marginTop: 100
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'vazir',
  },
  description: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: 'vazir',
  },
  codeFieldRoot: {
    justifyContent: "center",
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 10,
    direction: "ltr"
  },
  cell: {
    width: 40,
    height: 40,
    borderRadius: 5,
    borderWidth: 1.4,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  filledCell: {
    borderColor: '#fff',
  },
  cellText: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'vazir',
  },
  focusCell: {
    borderColor: '#1E90FF',
  },
});
