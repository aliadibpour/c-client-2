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
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
  const route = useRoute();
  const { phone } = route.params as { phone: string };

  const { width } = useWindowDimensions();

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      verifyCode();
    }
  }, [value]);

  const verifyCode = async () => {
    console.log('phone:', phone);
    console.log('code:', value);

    setLoading(true);
    try {
      await AsyncStorage.setItem("auth-status", JSON.stringify({ register: false, route: "pick-teams" }));
      navigation.replace('PickTeams');
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

      <CodeField
        ref={ref}
        {...props}
        value={value}
        onChangeText={setValue}
        cellCount={CELL_COUNT}
        rootStyle={styles.codeFieldRoot}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        renderCell={({ index, symbol, isFocused }) => (
          <View
            key={index}
            style={[styles.cell, isFocused && styles.focusCell]}
            onLayout={getCellOnLayoutHandler(index)}
          >
            <Text style={styles.cellText}>
              {symbol || (isFocused ? <Cursor /> : null)}
            </Text>
          </View>
        )}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    paddingTop: 60,
  },
  title: {
    fontSize: 22,
    textAlign: 'right',
    fontWeight: '600',
    marginBottom: 32,
    color: '#fff',
    fontFamily: 'vazir',
  },
  codeFieldRoot: {
    marginBottom: 30,
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  cell: {
    width: 44,
    height: 50,
    borderBottomWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'vazir',
  },
  focusCell: {
    borderColor: '#1E90FF',
  },
});
