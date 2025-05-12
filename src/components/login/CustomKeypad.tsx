import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['0', 'del'],
];

const CustomKeypad = ({ onKeyPress }:any) => {
  return (
    <View style={styles.container}>
      {KEYS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.key}
              onPress={() => key && onKeyPress(key)}
            >
              {key === 'del' ? (
                <Text style={styles.keyText}>⌫</Text>
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 6,
  },
  key: {
    backgroundColor: '#333',
    width: 110,
    height: 70,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: 'white',
    fontSize: 26,
  },
});

export default CustomKeypad;
