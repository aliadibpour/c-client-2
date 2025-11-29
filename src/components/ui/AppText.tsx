import React from 'react';
import { StyleSheet, Text, Dimensions, TextStyle } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base design size (from your design, e.g., Figma)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

export default function AppText({ style, children, ...rest }: any) {
  const flatStyle = StyleSheet.flatten(style) || ({} as TextStyle);

  // ensure fontSize is a finite number (guard against NaN / strings / null)
  const passedFontSize =
    typeof flatStyle.fontSize === "number" && Number.isFinite(flatStyle.fontSize)
      ? flatStyle.fontSize
      : undefined;

  const baseFont = passedFontSize ?? 12;
  // Scale factor based on screen dimensions
  const scaleWidth = SCREEN_WIDTH / BASE_WIDTH;
  const scaleHeight = SCREEN_HEIGHT / BASE_HEIGHT;

  // Take the smaller factor to avoid text being too big
  const scaledFontSize = baseFont * Math.min(scaleWidth, scaleHeight)+0.2;

  const newStyle = [
    styles.text,
    style,
    { fontSize: scaledFontSize },
  ];

  return (
    <Text style={newStyle} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: "SFArabic-Regular",
  },
});
