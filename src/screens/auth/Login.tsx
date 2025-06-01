import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Button, Alert, Modal } from 'react-native';
import { TelegramService } from '../../services/TelegramService';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { Keyboard } from '../../components/auth/Keyboard';
import { ActivityIndicator } from 'react-native';
import ModalMessage from '../../components/auth/ModalMessage';
import TdLib from 'react-native-tdlib';

const LoginScreen = ({navigation} :any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendPhoneNumber = async () => {
  //await TelegramService.logout()
  navigation.navigate("Verify",
    { phoneNumber:"99245086534" }
  );

  if (isSubmitting) return;
  try {
    const fullNumber = `+98${phoneNumber}`;
    const parsed = parsePhoneNumberFromString(fullNumber);
    if (!parsed || !parsed.isValid()) {
      if (phoneNumber) setModalMessage("شماره‌ی وارد شده معتبر نمی‌باشد");
      else setModalMessage("لطفا شماره تلفن را وارد کنید");
      setModalVisible(true);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setLoading(true); 

    const timeout = setInterval(async () => {
      setModalMessage("اتصال برقرار نشد. منتظر میمانیم تا پس از وصل شدن اتصال و فیلترشکن کد ارسال کنیم");
      setModalVisible(true);
    }, 15000);

    await TelegramService.login(parsed.countryCallingCode, parsed.nationalNumber);

    const interval = setInterval(async () => {
      try {
        const authState: any = await TelegramService.getAuthState();
        const authType = JSON.parse(authState.data)["@type"];
        console.log("Auth State:", authType);
        
        if (authType === "authorizationStateWaitCode") {
          clearTimeout(timeout);
          clearInterval(interval);
          navigation.navigate("Verify",
             { phoneNumber:fullNumber }
          );
        }
      } catch (err) {
        clearTimeout(timeout);
        clearInterval(interval);
        setModalMessage("خطایی در دریافت وضعیت احراز هویت به وجود آمد");
        setModalVisible(true);
      }
    }, 500);

    } catch (error: any) {
      //await TelegramService.logout(); // اگر login خودش خطا داد
      setModalMessage("خطایی در برقراری ارتباط به وجود آمد. لطفاً دوباره تلاش کنید.");
      setModalVisible(true);
      setIsSubmitting(false);
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
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15.5,
    textAlign: 'center',
    color: '#999',
    marginTop:3,
    marginBottom:22
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
    fontWeight: "bold",
  },
});


export default LoginScreen;
