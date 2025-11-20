import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { RFValue } from "react-native-responsive-fontsize";

export default function AppText({ style, children, ...rest }:any) {
  const newStyle = [
    style,
    style?.fontSize ? { fontSize: RFValue(style.fontSize -1.67) } : {}
  ];

  return (
    <Text style={[styles.text, newStyle]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: "SFArabic-Regular"
  }
})