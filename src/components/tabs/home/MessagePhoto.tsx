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
  fileIdProp?: string | number | null; // optional override to force key/remount
}

function safeParse(raw: any) {
  try {
    if (!raw) return raw;
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object" && raw.raw) {
      try { return JSON.parse(raw.raw); } catch { return raw.raw; }
    }
    return raw;
  } catch (e) {
    return raw;
  }
}

export default function MessagePhoto({
  photo,
  context = "channel",
  activeDownload,
  width,
  height,
  fileIdProp = null,
}: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation: any = useNavigation();
  const tokenRef = useRef<symbol | null>(null);
  const mountedRef = useRef(true);

  const screenWidth = Dimensions.get("window").width;

  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1] || {};
  // robust fileId extraction (try multiple possible shapes)
  const detectedFileId =
    fileIdProp ??
    biggest?.photo?.id ??
    biggest?.photo?.fileId ??
    photo?.id ??
    photo?.file?.id ??
    (biggest?.photo && (biggest.photo.id || biggest.photo.file_id)) ??
    null;

  const fileId = detectedFileId;

  const originalWidth = biggest?.width || 320;
  const originalHeight = biggest?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  const maxWidth = screenWidth * 0.85;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 300;

  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);

  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

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

  const thumbnailBase64 = useMemo(() => {
    const mini = photo?.minithumbnail?.data;
    try {
      if (!mini) return null;
      // if mini is already base64 string, don't convert
      if (typeof mini === "string" && mini.length > 0 && !Array.isArray(mini)) return mini;
      return fromByteArray(mini);
    } catch (e) {
      return null;
    }
  }, [photo]);

  // If tdlib has already local path in the shape, prefer it immediately
  const existingLocalPath =
    biggest?.photo?.local?.path ||
    photo?.local?.path ||
    (biggest?.photo?.local && biggest.photo.local.isDownloadingCompleted && biggest.photo.local.path) ||
    null;

  useEffect(() => {
    // reset on fileId changes
    setPhotoPath(null);
    setLoading(true);

    const myToken = Symbol("dl");
    tokenRef.current = myToken;

    if (!fileId) {
      setLoading(false);
      return;
    }

    // immediate local path if exists
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
        const parsed = safeParse(res);
        const localPath =
          parsed?.local?.path ||
          (parsed?.local && parsed.local.isDownloadingCompleted && parsed.local.path) ||
          parsed?.file?.local?.path ||
          parsed?.path ||
          null;

        if (!mountedRef.current || tokenRef.current !== myToken || cancelled) return;

        if (localPath) {
          setPhotoPath(`file://${localPath}`);
          setLoading(false);
        } else {
          // download started but not completed yet — keep spinner until subsequent updates
          setLoading(false);
        }
      } catch (err) {
        if (!mountedRef.current || tokenRef.current !== myToken || cancelled) return;
        setLoading(false);
      }
    };

    const doCancel = async () => {
      try {
        // cancel only if we have a valid fileId
        if (fileId) await cancelDownload(fileId);
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
            height: height ? height : displayHeight < 160 ? 160 : displayHeight,
            borderRadius: context !== "channel" ? 10 : undefined,
            borderBottomLeftRadius: context === "channel" ? 3 : undefined,
            borderBottomRightRadius: context === "channel" ? 3 : undefined,
            backgroundColor: "#111",
            overflow: "hidden",
          }}
        >
          <Image
            // force remount when fileId changes
            key={String(fileId ?? Math.random())}
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
