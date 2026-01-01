import React from "react";
import {
  Text,
  StyleSheet,
  TextStyle,
  useWindowDimensions,
  PixelRatio,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

const BASE_WIDTH = 375;

// محدودیت منطقی
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.15;

type Props = {
  style?: TextStyle | TextStyle[];
  children: React.ReactNode;
};

export default function AppText({ style, children, ...rest }: Props) {
  const { width } = useWindowDimensions();

  const flatStyle = StyleSheet.flatten(style) || {};
  const baseFont =
    typeof flatStyle.fontSize === "number" ? flatStyle.fontSize : 14;

  // RFValue فقط با baseWidth
  let fontSize = RFValue(baseFont, 730);


  return (
    <Text
      {...rest}
      allowFontScaling={false}
      style={[styles.text, style, { fontSize }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: "SFArabic-Regular",
  },
});
