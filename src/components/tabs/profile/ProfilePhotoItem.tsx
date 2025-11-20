import React, { useEffect, useState } from "react";
import { View, Image, StyleSheet, Dimensions, TouchableWithoutFeedback, Text } from "react-native";
import AppText from "../../ui/AppText";

const SCREEN_WIDTH = Dimensions.get("window").width;

export function ProfilePhotoItem({ uri, index, profile, goNext, goPrevious }:any) {
  const [source, setSource] = useState<{ uri: string } | null>(null);

  useEffect(() => {
    if (uri) {
      setSource({ uri });
    }
  }, [uri]);

  return (
    <View style={{ width: SCREEN_WIDTH, height: 370 }}>
      {source ? (
        <Image source={source} style={styles.image} />
      ) : (
        <View style={styles.placeholder} />
      )}

      {/* نیمه راست → عکس بعدی */}
      <TouchableWithoutFeedback onPress={goNext}>
        <View style={styles.touchRight} />
      </TouchableWithoutFeedback>

      {/* نیمه چپ ← عکس قبلی */}
      <TouchableWithoutFeedback onPress={goPrevious}>
        <View style={styles.touchLeft} />
      </TouchableWithoutFeedback>

      <AppText style={styles.nameText}>
        {profile?.firstName} {profile?.lastName}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: SCREEN_WIDTH,
    height: 370,
    resizeMode: "cover",
    backgroundColor: "#111",
  },
  placeholder: {
    width: SCREEN_WIDTH,
    height: 370,
    backgroundColor: "#444",
  },
  nameText: {
    color: "white",
    fontSize: 25,
    position: "absolute",
    bottom: 10,
    right: 20,
  },
  touchRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: SCREEN_WIDTH / 3,
    height: "100%",
  },
  touchLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH / 3,
    height: "100%",
  },
});
