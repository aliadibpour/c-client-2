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

  const submitHandle = async () => {
    //await TelegramService.logout()
    const a = await TelegramService.getAuthState()
    console.log(a);
    await TelegramService.login("+98", "9924508531")
    const fullNumber = `+${callingCode}${phoneNumber}`;
    const parsed = parsePhoneNumberFromString(fullNumber);

    if (parsed && parsed.isValid()) {
      console.log('Valid phone number:', parsed.number);
    } else {
      console.log('Invalid phone number for selected country.');
    }

    //navigation.navigate("Verify")
  }

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
              backgroundColor: '#111',
              onBackgroundTextColor: 'white',
              filterPlaceholderTextColor: '#888',
            }}
          />
        </TouchableOpacity>
        <Text style={styles.phoneText}>{phoneNumber}</Text>
      </View>
      <TouchableOpacity style={styles.Button} onPress={() => submitHandle()}>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
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
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingVertical: 13,
    marginVertical: 35
  },
  phoneText: {
    marginHorizontal:14,
    color: 'white',
    fontSize: 17,
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
