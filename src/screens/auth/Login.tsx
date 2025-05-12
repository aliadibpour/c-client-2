import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Button } from 'react-native';
import CountryPicker from 'react-native-country-picker-modal';

const LoginScreen = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryCode, setCountryCode] = useState('IR');
  const [callingCode, setCallingCode] = useState('98');

  const handleKeyPress = (digit:any) => {
    if (digit === 'back') {
      setPhoneNumber((prev) => prev.slice(0, -1));
    } else {
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const renderKey = (digit:any) => (
    <TouchableOpacity
      key={digit}
      style={digit ? styles.keyButton : { opacity: 0, width: '30%' }}
      onPress={() => handleKeyPress(digit)}
    >
      <Text style={styles.keyText}>{digit === 'back' ? '⌫' : digit}</Text>
    </TouchableOpacity>
  );

  const keyboard = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back']
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Phone</Text>
      <Text style={styles.subtitle}>Please confirm your country code and enter your phone number.</Text>

      <View style={styles.keyboard}>
        {keyboard.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keyRow}>
            {row.map(renderKey)}
          </View>
        ))}
      </View>

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

      <Button color="primary" title='sumbit'/>

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
  keyboard: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
  },
  keyRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-evenly',
    marginVertical: 8,
  },
  keyButton: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 7,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: 'white',
    fontSize: 22,
  },
  
});

export default LoginScreen;
