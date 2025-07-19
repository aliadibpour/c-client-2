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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhoto?: {
    minithumbnail?: { data: number[] };
  };
  usernames: {
    activeUsernames: string[];
  };
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const flatListRef = useRef<FlatList<string>>(null);

  // Get Profile once (no loading needed)
  useEffect(() => {
    (async () => {
      try {
        const profileRaw = await TdLib.getProfile();
        const parsed = JSON.parse(profileRaw);
        console.log("📥 Profile loaded:", parsed);
        setProfile(parsed);
      } catch (e) {
        console.error("❌ Error loading profile", e);
      }
    })();
  }, []);

  // Get Profile Photos (with loading only for photos)
  useEffect(() => {
    if (!profile?.id) return;

    (async () => {
      try {
        setLoadingPhotos(true);
        const photoListRaw = await TdLib.getUserProfilePhotos(profile.id, 0, 10);
        const parsedPhotos = JSON.parse(photoListRaw);
        const uris: string[] = [];

        for (let photo of parsedPhotos.photos || []) {
          const biggest = photo.sizes[photo.sizes.length - 1];
          const result: any = await TdLib.downloadFile(biggest.photo.id);
          const file = JSON.parse(result.raw);

          if (file.local?.isDownloadingCompleted && file.local.path) {
            uris.push(`file://${file.local.path}`);
          }
        }

        const reversed = uris.reverse();
        setPhotos(reversed);
        setCurrentIndex(reversed.length - 1);

        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: reversed.length - 1,
            animated: false,
          });
        }, 100);
      } catch (e) {
        console.error("❌ Error loading profile photos", e);
      } finally {
        setLoadingPhotos(false);
      }
    })();
  }, [profile?.id]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
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

  const renderFallback = () => {
    if (profile?.profilePhoto?.minithumbnail?.data) {
      const base64 = fromByteArray(profile.profilePhoto.minithumbnail.data as any);
      return (
        <View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${base64}` }}
            style={styles.image}
          />
          {renderName()}
          {renderInformation()}
        </View>
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

  const renderName = () => (
    <Text style={styles.nameText}>
      {profile?.firstName} {profile?.lastName}
    </Text>
  );

  const renderInformation = () => (
    <View style={styles.informationBox}>
      {
        profile?.phoneNumber && (
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>
              {profile.phoneNumber.startsWith("+") ? profile.phoneNumber : `${profile.phoneNumber}+`}
            </Text>
            <Text style={styles.infoLabel}>شماره تماس</Text>
          </View>
        )
      }

      {
        profile?.usernames.activeUsernames[0] && (
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>
              @{profile.usernames.activeUsernames[0]}
            </Text>
            <Text style={styles.infoLabel}>نام کاربری</Text>
          </View>
        )
      }
    </View>
  );


  const renderLineIndicator = () => {
    if (photos.length <= 1) return null;
    const width = 100 / photos.length;
    return (
      <View style={styles.indicatorContainer}>
        {[...photos].reverse().map((_, i) => {
          const realIndex = photos.length - 1 - i;
          return (
            <View
              key={i}
              style={[
                { width: `${width}%` },
                styles.indicator,
                currentIndex === realIndex && styles.indicatorActive,
              ]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      {loadingPhotos ? (
        <View style={styles.centered}>
          {renderFallback()}
        </View>
      ) : photos.length > 0 ? (
        <>
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
                {/* Go next */}
                <TouchableWithoutFeedback onPress={goNext}>
                  <View style={styles.touchRight} />
                </TouchableWithoutFeedback>
                {/* Go previous */}
                <TouchableWithoutFeedback onPress={goPrevious}>
                  <View style={styles.touchLeft} />
                </TouchableWithoutFeedback>
                {renderName()}
              </View>
            )}
            onMomentumScrollEnd={onMomentumScrollEnd}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 100);
            }}
            />
          {renderLineIndicator()}
        </>
      ) : (
        renderFallback()
      )}
      {renderInformation()}
      
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
    position: "absolute",
    left: 20,
    bottom: 10,
    fontFamily: "SFArabic-Heavy",
  },
  phoneText: {
    color: "#ccc",
    fontSize: 14,
    marginTop: 2,
    fontFamily: "SFArabic-Regular",
  },
  centered: {
    height: 370,
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    position: "absolute",
    top: 6,
    width: SCREEN_WIDTH,
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "flex-start",
    gap:20
  },
  infoRow: {
  
  },
  infoValue: {
    color: "#ccc",
    fontSize: 16,
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
