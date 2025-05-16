import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Button, Alert } from 'react-native';
import CountryPicker from 'react-native-country-picker-modal';
import { TelegramService } from '../../services/TelegramService';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { Keyboard } from '../../components/auth/Keyboard';

const LoginScreen = ({navigation} :any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryCode, setCountryCode] = useState('IR');
  const [callingCode, setCallingCode] = useState('98');

  const sendPhoneNumber = async () => {
    //await TelegramService.logout()
    try {
      const fullNumber = `+${callingCode}${phoneNumber}`;
      const parsed = parsePhoneNumberFromString(fullNumber);

      if (!parsed || !parsed.isValid()) {
        Alert.alert("شماره اشتباه است", "لطفا شماره معتبر وارد کنید.");
        return;
      }

      const result = await TelegramService.login(parsed.countryCallingCode, parsed.nationalNumber);
      console.log(result)
      const interval = setInterval(async () => {
        const authState = await TelegramService.getAuthState();
        console.log("Auth State:", authState);
        const state = JSON.parse(authState);
        console.log("aaa", state);
        
        if (state["@type"] === "authorizationStateWaitCode") {
          clearInterval(interval);
          navigation.navigate("Verify");
        }
      }, 500);
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("خطا", "مشکلی در ارسال شماره پیش آمده است.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Phone</Text>
      <Text style={styles.subtitle}>Please confirm your country code and enter your phone number.</Text>

      <View style={styles.phoneBox}>
        <TouchableOpacity style={styles.countryRow} onPress={() => setShowCountryPicker(true)}>
          <CountryPicker
            withFlag
            withEmoji
            countryCode={(countryCode as any)}
            withCallingCodeButton={true}
            onSelect={(country) => {
              setCallingCode(country.callingCode[0]);
              setCountryCode(country.cca2);
            }}
            visible={false}
            theme={{
              backgroundColor: '#000',
              onBackgroundTextColor: 'white',
              filterPlaceholderTextColor: '#888',
              primaryColorVariant: "#222",
            }}
          />
        </TouchableOpacity>
        <Text style={[styles.phoneText, phoneNumber === "" && {color: "#666"}]}>
          {phoneNumber === '' ? '0000 000 000' : phoneNumber}
        </Text>
      </View>
      <TouchableOpacity style={styles.Button} onPress={() => sendPhoneNumber()}>
        <Text style={{color: "#000"}}>==</Text>
      </TouchableOpacity>

      <Keyboard setState={setPhoneNumber}/>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    color: 'white',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    color: 'gray',
    marginVertical: 8,
  },
  countryRow: {
    backgroundColor: "#222",
    padding: 12,
    paddingHorizontal: 10,
  },
  countryText: {
    color: 'white',
    fontSize: 18,
  },
  codeText: {
    color: 'white',
    fontSize: 18,
  },
  phoneBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1.3,
    borderColor: '#444',
    marginVertical: 35,
    borderRadius:5,
    overflow: "scroll"
  },
  phoneText: {
    marginHorizontal:14,
    color: 'white',
    fontSize: 18,
    letterSpacing: 2,
  },
  Button: {
    justifyContent: "center",
    width: 60,
    height: 60,
    backgroundColor: "#fff",
    color: "white",
    alignItems: "center",
    borderRadius: "100%",
    padding:8,
    marginBottom:100
  }
});

export default LoginScreen;
