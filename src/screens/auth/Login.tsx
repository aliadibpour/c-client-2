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
    const a = await TelegramService.getAuthState()
    console.log(a);
    const fullNumber = `+${callingCode}${phoneNumber}`;
    const parsed = parsePhoneNumberFromString(fullNumber);

    if (parsed && parsed.isValid()) {
      console.log('Valid phone number:', parsed.number);
    } else {
      console.log('Invalid phone number for selected country.');
    }

    navigation.navigate("Verify")
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Phone</Text>
      <Text style={styles.subtitle}>Please confirm your country code and enter your phone number.</Text>

      <Keyboard setState={setPhoneNumber}/>

      <View style={styles.phoneBox}>
        <TouchableOpacity style={styles.countryRow} onPress={() => setShowCountryPicker(true)}>
          <CountryPicker
            withFlag
            withCallingCode
            withEmoji
            countryCode={(countryCode as any)}
            withCallingCodeButton={true}
            onSelect={(country) => {
              setCountryCode(country.cca2);
              setCallingCode(country.callingCode[0]);
            }}
            visible={false} // hide the picker here
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
        <Text style={{color: "white"}}>Submit</Text>
      </TouchableOpacity>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
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
    backgroundColor: "#235",
    color: "white",
    alignItems: "center",
    borderRadius: 5,
    padding:10
  }
});

export default LoginScreen;
