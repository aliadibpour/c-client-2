import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  View,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { useNavigation } from "@react-navigation/native";
import { cancelDownload } from "../../../hooks/useMediaDownloadManager";

interface Props {
  photo: any;
  context?: "channel" | "explore";
  activeDownload?: any;
  width?: number;
  height?: number;
}

export default function MessagePhoto({ photo, context = "channel", activeDownload, width, height }: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation: any = useNavigation();
  const tokenRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const screenWidth = Dimensions.get("window").width;

  // سایز اصلی
  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1] || {};
  const fileId = biggest?.photo?.id || photo?.id;
  const originalWidth = biggest?.width || 320;
  const originalHeight = biggest?.height || 240;

  const aspectRatio = originalWidth / originalHeight;

  // محدودیت‌ها
  const maxWidth = screenWidth * 0.85;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 300;

  // محاسبه عرض/ارتفاع نمایشی
  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);

  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  // حالت مخصوص explore: عرض مشخص و border متفاوت
  if (context === "explore") {
    displayWidth = screenWidth * 0.9;
    displayHeight = displayWidth / aspectRatio;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // تصویر کوچک base64
  const thumbnailBase64 = useMemo(() => {
    const mini = photo?.minithumbnail?.data;
    return mini ? fromByteArray(mini) : null;
  }, [photo]);

  // detect existing local path on the photo object (if tdlib provided it earlier)
  const existingLocalPath =
    biggest?.photo?.local?.path ||
    photo?.local?.path ||
    (biggest?.photo?.local && biggest.photo.local.isDownloadingCompleted && biggest.photo.local.path) ||
    null;

  useEffect(() => {
    // reset per fileId
    setPhotoPath(null);
    setLoading(true);

    const myToken = Symbol("dl");
    tokenRef.current = myToken;

    if (!fileId) {
      setLoading(false);
      return;
    }

    // if local already exists, use it immediately
    if (existingLocalPath) {
      if (mountedRef.current && tokenRef.current === myToken) {
        setPhotoPath(`file://${existingLocalPath}`);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;

    const startDownload = async () => {
      try {
        const res: any = await TdLib.downloadFile(fileId);
        let parsed: any = res;
        try {
          parsed = res?.raw ? JSON.parse(res.raw) : res;
        } catch (e) {
          parsed = res;
        }
        const localPath =
          parsed?.local?.path ||
          (parsed?.local && parsed.local.isDownloadingCompleted && parsed.local.path) ||
          parsed?.file?.local?.path ||
          null;

        if (!mountedRef.current || tokenRef.current !== myToken || cancelled) return;

        if (localPath) {
          setPhotoPath(`file://${localPath}`);
          setLoading(false);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current && tokenRef.current === myToken) setLoading(false);
      }
    };

    const doCancel = async () => {
      try {
        await cancelDownload(fileId);
      } catch (e) {}
    };

    if (activeDownload) startDownload();
    else doCancel().catch(() => {});

    return () => {
      cancelled = true;
      tokenRef.current = Symbol("cancelled");
      doCancel().catch(() => {});
    };
  }, [fileId, activeDownload, existingLocalPath, photo]);

  const handleOpenFull = () => {
    if (photoPath) {
      navigation.navigate("FullPhoto", { photoPath });
    }
  };

  return (
    <View style={[styles.container]}>
      <TouchableOpacity onPress={handleOpenFull} disabled={loading}>
        <View
          style={{
            width: width ? width : displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth,
            height: height ? height : displayHeight < 160 ? 160 : displayHeight, // حداقل ارتفاع
            borderRadius: context !== "channel" ? 10 : undefined,
            borderBottomLeftRadius: context === "channel" ? 3 : undefined,
            borderBottomRightRadius: context === "channel" ? 3 : undefined,
            backgroundColor: "#111",
            overflow: "hidden",
          }}
        >
          <Image
            source={{
              uri: photoPath ? photoPath : (thumbnailBase64 ? `data:image/jpeg;base64,${thumbnailBase64}` : undefined),
            }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
  },
});
