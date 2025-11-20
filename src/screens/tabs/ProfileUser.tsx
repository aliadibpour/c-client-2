import React, { useCallback, useEffect, useRef, useState } from "react";
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
import AppText from "../../components/ui/AppText";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhoto?: {
    minithumbnail?: { data: number[] };
  };
  // possible bio/about fields
  bio?: string;
  about?: string;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | any>(null);

  // uris array will contain either string (file://...) or null if not downloaded yet
  const [uris, setUris] = useState<(string | null)[]>([]);
  const [metaPhotos, setMetaPhotos] = useState<any[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const downloadingRef = useRef<Set<number>>(new Set());
  const highestDownloadedRef = useRef<number>(-1);

  const flatListRef = useRef<FlatList<string | null> | null>(null);
  const route = useRoute();
  const { data }: any = route.params || {};

  const CHUNK_SIZE = 3;
  const PREFETCH_THRESHOLD = 1;

  // visibleVersion used to force re-render of FlatList when visible item updated
  const [visibleVersion, setVisibleVersion] = useState(0);

  // current index state + ref (ref used inside async callbacks to avoid stale closures)
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef<number>(0);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    (async () => {
      try {
        if (!data) return;
        setProfile(data);
        setLoadingInitial(true);

        const userId = data.id;
        const photoListRaw = await TdLib.getUserProfilePhotos(userId, 0, 100);
        const parsedPhotos = JSON.parse(photoListRaw);
        const photosArray = parsedPhotos.photos || [];

        setMetaPhotos(photosArray);
        setUris(new Array(photosArray.length).fill(null));

        // try to fetch full user info (bio/about) if available
        try {
          const userRaw = await TdLib.getUserFull?.(userId);
          if (userRaw) {
            const userParsed = JSON.parse(userRaw);
            console.log(userParsed)
            // try common fields for bio/about
            const bio = userParsed.bio || userParsed.about || userParsed.description || userParsed.aboutText;
            if (bio) {
              setProfile((prev: any) => ({ ...prev, bio, ...userParsed }));
            } else {
              setProfile((prev: any) => ({ ...prev, ...userParsed }));
            }
          }
        } catch (e) {
          // TdLib wrapper may not expose getUser or it may fail — ignore gracefully
          console.warn("could not fetch full user info (bio)", e);
        }

        if (photosArray.length > 0) {
          await loadChunk(0, CHUNK_SIZE, photosArray);
        }

        setLoadingInitial(false);
      } catch (e) {
        console.error("❌ Error loading profile or photos", e);
        setLoadingInitial(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const loadChunk = useCallback(
    async (startIndex: number, size = CHUNK_SIZE, photosList = metaPhotos) => {
      if (!photosList || photosList.length === 0) return;
      const end = Math.min(startIndex + size - 1, photosList.length - 1);

      const indicesToDownload: number[] = [];
      for (let i = startIndex; i <= end; i++) {
        const val = uris[i];
        // if already have a string uri, skip
        if (typeof val === "string" && val.length > 0) continue;
        if (downloadingRef.current.has(i)) continue;
        // push for download (covers both null and undefined)
        indicesToDownload.push(i);
        downloadingRef.current.add(i);
      }

      if (indicesToDownload.length === 0) return;

      await Promise.all(
        indicesToDownload.map(async (idx) => {
          try {
            const photo = photosList[idx];
            const biggest = photo.sizes[photo.sizes.length - 1];
            const result: any = await TdLib.downloadFile(biggest.photo.id);
            const file = JSON.parse(result.raw);

            if (file.local?.isDownloadingCompleted && file.local.path) {
              const uri = `file://${file.local.path}`;
              setUris((prev) => {
                const copy = [...prev];
                copy[idx] = uri;
                return copy;
              });

              // update highest downloaded index
              highestDownloadedRef.current = Math.max(highestDownloadedRef.current, idx);

              // If the downloaded index is currently visible, bump visibleVersion so FlatList re-renders
              if (idx === currentIndexRef.current) {
                setVisibleVersion((v) => v + 1);
              }
            } else {
              // mark as null (failed or not available)
              setUris((prev) => {
                const copy = [...prev];
                copy[idx] = null;
                return copy;
              });
            }
          } catch (err) {
            console.warn("download failed for index", idx, err);
            setUris((prev) => {
              const copy = [...prev];
              copy[idx] = null;
              return copy;
            });
          } finally {
            downloadingRef.current.delete(idx);
          }
        })
      );
    },
    // include uris and metaPhotos so we inspect latest values
    [metaPhotos, uris]
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);

      const nextChunkStart = highestDownloadedRef.current + 1;
      const shouldPrefetch =
        index + PREFETCH_THRESHOLD >= highestDownloadedRef.current &&
        nextChunkStart < metaPhotos.length &&
        !downloadingRef.current.has(nextChunkStart);

      if (shouldPrefetch) {
        loadChunk(nextChunkStart, CHUNK_SIZE);
      }
    },
    [loadChunk, metaPhotos.length]
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const first = viewableItems[0].index ?? 0;
      setCurrentIndex(first);
      currentIndexRef.current = first;

      const nextChunkStart = highestDownloadedRef.current + 1;
      if (
        first + PREFETCH_THRESHOLD >= highestDownloadedRef.current &&
        nextChunkStart < metaPhotos.length &&
        !downloadingRef.current.has(nextChunkStart)
      ) {
        loadChunk(nextChunkStart, CHUNK_SIZE);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const scrollToIndexSafe = useCallback(
    (index: number) => {
      if (index < 0 || index >= uris.length) return;
      flatListRef.current?.scrollToIndex({ index, animated: true });
      const chunkStart = Math.floor(index / CHUNK_SIZE) * CHUNK_SIZE;
      loadChunk(chunkStart, CHUNK_SIZE);
    },
    [uris.length, loadChunk]
  );

  const renderFallback = () => {
    if (profile?.profilePhoto?.minithumbnail?.data) {
      const base64 = fromByteArray(profile.profilePhoto.minithumbnail.data as any);
      return <Image source={{ uri: `data:image/jpeg;base64,${base64}` }} style={styles.image} />;
    }

    return (
      <View style={styles.placeholder}>
        <AppText style={styles.initial}>{profile?.firstName?.[0]?.toUpperCase() || "?"}</AppText>
      </View>
    );
  };

  const renderLineIndicator = () => {
    if (uris.length <= 1) return null;

    // compute pixel width per indicator, ensure at least 1px
    const paddingHorizontal = 10; // same as container paddingHorizontal
    const availableWidth = Math.max(1, SCREEN_WIDTH - paddingHorizontal * 2);
    const per = Math.max(1, Math.floor(availableWidth / uris.length));

    return (
      <View style={[styles.indicatorContainer, { left: 0, right: 0, paddingHorizontal }]}>
        {uris.map((_, i) => (
          <View
            key={i}
            style={[
              styles.indicator,
              { width: per, marginRight: 3 },
              currentIndex === i && styles.indicatorActive,
            ]}
          />
        ))}
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: string | null; index: number }) => {
    // use item (provided by FlatList) directly so updates to data trigger re-render
    const uri = item;
    const isDownloading = downloadingRef.current.has(index);

    return (
      <View style={{ width: SCREEN_WIDTH, height: 370 }}>
        {uri ? (
          // key changes when URI changes so Image remounts immediately
          <Image key={uri} source={{ uri }} style={styles.image} />
        ) : isDownloading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={"#fff"} size="large" />
          </View>
        ) : profile?.profilePhoto?.minithumbnail?.data ? (
          <Image
            key={`thumb-${index}`}
            source={{
              uri: `data:image/jpeg;base64,${fromByteArray(profile.profilePhoto.minithumbnail.data as any)}`,
            }}
            style={styles.image}
          />
        ) : (
          <View style={styles.placeholder}>
            <AppText style={styles.initial}>{profile?.firstName?.[0]?.toUpperCase() || "?"}</AppText>
          </View>
        )}

        <TouchableWithoutFeedback
          onPress={() => {
            const nextIndex = Math.min(index + 1, uris.length - 1);
            scrollToIndexSafe(nextIndex);
          }}
        >
          <View style={styles.touchRight} />
        </TouchableWithoutFeedback>

        <TouchableWithoutFeedback
          onPress={() => {
            const prevIndex = Math.max(index - 1, 0);
            scrollToIndexSafe(prevIndex);
          }}
        >
          <View style={styles.touchLeft} />
        </TouchableWithoutFeedback>

        {/* name removed from here so it won't scroll with FlatList */}
      </View>
    );
  };

  if (loadingInitial) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        <ActivityIndicator color={"#fff"} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      {uris.length > 0 ? (
        <View>
          <FlatList
            ref={flatListRef}
            data={uris}
            extraData={[uris, visibleVersion]} // ensure FlatList re-renders when visible item updated
            horizontal
            pagingEnabled
            scrollEnabled
            keyExtractor={(_, index) => index.toString()} // stable key based on index
            renderItem={renderItem}
            onMomentumScrollEnd={onMomentumScrollEnd}
            showsHorizontalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            initialNumToRender={3}
            windowSize={5}
            removeClippedSubviews={false} // avoid clipping/mounting issues
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
          />
          {renderLineIndicator()}

          {/* name fixed on top of FlatList so it doesn't scroll */}
          <AppText style={styles.nameText} pointerEvents="none">
            {profile?.firstName} {profile?.lastName}
          </AppText>
        </View>
      ) : (
        renderFallback()
      )}

      <View style={styles.informationBox}>
        {profile?.phoneNumber && (
          <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-start" }}>
            <Phone color={"#999"} width={15} />
            <View>
              <AppText style={styles.infoValue}>
                {profile.phoneNumber.startsWith("+") ? profile.phoneNumber : `${profile.phoneNumber}+`}
              </AppText>
              <AppText style={styles.infoLabel}>شماره تماس</AppText>
            </View>
          </View>
        )}

        {profile?.usernames?.activeUsernames?.[0] && (
          <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-start" }}>
            <User color={"#999"} width={15} />
            <View>
              <AppText style={styles.infoValue}>@{profile.usernames.activeUsernames[0]}</AppText>
              <AppText style={styles.infoLabel}>نام کاربری</AppText>
            </View>
          </View>
        )}

        {/* Bio display (try several possible field names) */}
        {(profile?.bio || profile?.about || profile?.description || profile?.aboutText) && (
          <View style={{ marginTop: 6 }}>
            <AppText style={[styles.infoValue, { fontSize: 13 }]}>
              {profile?.bio || profile?.about || profile?.description || profile?.aboutText}
            </AppText>
            <AppText style={styles.infoLabel}>بیو</AppText>
          </View>
        )}
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
    bottom: 8,
    left: 20,
    zIndex: 20,
  },
  centered: {
    height: 370,
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    // don't center horizontally — we'll start from left and show all indicators
    position: "absolute",
    top: 5,
    // paddingHorizontal added dynamically in renderLineIndicator
    // ensure it sits above images
    zIndex: 15,
  },
  indicator: {
    height: 2.3,
    backgroundColor: "#999",
    borderRadius: 2,
  },
  indicatorActive: {
    backgroundColor: "#fff",
    // make active slightly taller so visible even when width=1
    height: 3.6,
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
    paddingHorizontal: 10,
    paddingVertical: 16,
    alignItems: "flex-start",
    gap: 20,
    backgroundColor: "#111",
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
