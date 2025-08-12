import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { useRoute } from "@react-navigation/native";
import { Phone, User } from "lucide-react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhoto?: {
    minithumbnail?: { data: number[] };
  };
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const flatListRef = useRef<FlatList<string>>(null);
  const route = useRoute()
  const { data }: any = route.params || {};

  useEffect(() => {
    (async () => {
      try {
        setProfile(data);
        const userId = data.id;
        setLoadingPhotos(true);
        const photoListRaw = await TdLib.getUserProfilePhotos(userId, 0, 100);
        const parsedPhotos = JSON.parse(photoListRaw);
        console.log(data, userId)
        console.log(parsedPhotos, "d")
        const uris: string[] = [];

        for (let photo of parsedPhotos.photos || []) {
          const biggest = photo.sizes[photo.sizes.length - 1];
          const result: any = await TdLib.downloadFile(biggest.photo.id);
          const file = JSON.parse(result.raw);

          if (file.local?.isDownloadingCompleted && file.local.path) {
            uris.push(`file://${file.local.path}`);
          }
        }

        setPhotos(uris);
        setLoadingPhotos(false);
      } catch (e) {
        console.error("❌ Error loading profile or photos", e);
        setLoadingPhotos(false);
      }
    })();
  }, [data]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const renderFallback = () => {
    if (profile?.profilePhoto?.minithumbnail?.data) {
      const base64 = fromByteArray(profile.profilePhoto.minithumbnail.data as any);
      return (
        <Image
          source={{ uri: `data:image/jpeg;base64,${base64}` }}
          style={styles.image}
        />
      );
    }

    return (
      <View style={styles.placeholder}>
        <Text style={styles.initial}>
          {profile?.firstName?.[0]?.toUpperCase() || "?"}
        </Text>
      </View>
    );
  };

  const renderLineIndicator = () => {
    if (photos.length <= 1) return null;
    const width:number = 100 / photos.length;
    return (
      <View style={styles.indicatorContainer}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={[
              {width: `${width}%`},
              styles.indicator,
              currentIndex === i && styles.indicatorActive,
            ]}
          />
        ))}
      </View>
    );
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: false });
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goNext = () => {
    if (currentIndex < photos.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: false });
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      {loadingPhotos ? (
        renderFallback()
      ) : photos.length > 0 ? (
        <View>
          <FlatList
            ref={flatListRef}
            data={photos}
            horizontal
            pagingEnabled
            scrollEnabled
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, height: 370 }}>
                <Image source={{ uri: item }} style={styles.image} />

                {/* نیمه راست → عکس بعدی */}
                <TouchableWithoutFeedback onPress={goNext}>
                  <View style={styles.touchRight} />
                </TouchableWithoutFeedback>

                {/* نیمه چپ ← عکس قبلی */}
                <TouchableWithoutFeedback onPress={goPrevious}>
                  <View style={styles.touchLeft} />
                </TouchableWithoutFeedback>


                  <Text style={styles.nameText}>
                    {profile?.firstName} {profile?.lastName}
                  </Text>
              </View>
            )}
            onMomentumScrollEnd={onMomentumScrollEnd}
            showsHorizontalScrollIndicator={false}
          />
          {renderLineIndicator()}
        </View>
      ): renderFallback()}

      <View style={styles.informationBox}>
        {
          profile?.phoneNumber && (
            <View style={{flexDirection: "row", gap:5, alignItems: "flex-start"}}>
              <Phone color={"#999"} width={15} />
              <View>
                <Text style={styles.infoValue}>
                  {profile.phoneNumber.startsWith("+") ? profile.phoneNumber : `${profile.phoneNumber}+`}
                </Text>
                <Text style={styles.infoLabel}>شماره تماس</Text>
              </View>
            </View>
          )
        }

        {
          profile?.usernames?.activeUsernames[0] && (
            <View style={{flexDirection: "row", gap:5, alignItems: "flex-start"}}>
              <User color={"#999"} width={15} />
              <View>
                <Text style={styles.infoValue}>
                  @{profile.usernames.activeUsernames[0]}
                </Text>
                <Text style={styles.infoLabel}>نام کاربری</Text>
              </View>
            </View>
          )
        }
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
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
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontSize: 50,
    color: "white",
  },
  nameText: {
    color: "white",
    fontSize: 25,
    fontFamily: "SFArabic-Heavy",
    position: "absolute",
    bottom: 10,
    right: 20,
  },
  centered: {
    height: 370,
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    position: "absolute",
    top:5,
    paddingHorizontal:20
  },
  indicator: {
    height: 2.3,
    backgroundColor: "#999",
    borderRadius: 2,
  },
  indicatorActive: {
    backgroundColor: "#fff",
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
    informationBox: {
    paddingHorizontal:10,
    paddingVertical: 16,
    alignItems: "flex-start",
    gap:20,
    backgroundColor: "#111"
  },
  infoValue: {
    color: "#ccc",
    fontSize: 15,
    textAlign: "right",
    fontFamily: "SFArabic-Regular",
  },
  infoLabel: {
    color: "#999",
    fontSize: 12,
    textAlign: "left",
    fontFamily: "SFArabic-Light",
    marginTop: 1,
  },

});