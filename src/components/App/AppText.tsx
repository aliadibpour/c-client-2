// src/components/AppText.tsx
import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';

const AppText = (props: TextProps) => {
  return (
    <Text
      {...props}
      style={[styles.text, props.style]}
    >
      {props.children}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    fontFamily: 'SFArabic-Regular',
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default AppText;
