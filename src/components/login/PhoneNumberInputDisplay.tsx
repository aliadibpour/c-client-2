import React from 'react';
import { Text, StyleSheet, View } from 'react-native';

const PhoneNumberInputDisplay = ({ phoneNumber }: any) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{phoneNumber}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 18,
    textAlign: 'left',
  },
});

export default PhoneNumberInputDisplay;
