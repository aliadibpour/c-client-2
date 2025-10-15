import {
  Image,
  View,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import React, { useEffect, useMemo, useState, useRef } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { useNavigation } from "@react-navigation/native";
import { cancelDownload } from "../../../hooks/useMediaDownloadManager";

/**
 * MessagePhoto (keeps structure, no loading UI)
 *
 * - Try download by remoteId first, fallback to fileId if remote missing or fails
 * - Cache finished downloads across mounts to avoid re-downloading
 * - Reuse inflight promises to avoid duplicate concurrent downloads
 * - Cancel download on unmount or when activeDownload toggles off
 */

// module-level caches (persist across component mounts)
const downloadCache = new Map<string, string>(); // key -> file://path
const inflight = new Map<string, Promise<{ ok: boolean; path?: string }>>(); // key -> promise

function safeParseRaw(res: any) {
  if (!res) return null;
  if (typeof res === "string") {
    try {
      return JSON.parse(res);
    } catch (e) {
      return null;
    }
  }
  if (res.raw && typeof res.raw === "string") {
    try {
      return JSON.parse(res.raw);
    } catch (e) {
      return null;
    }
  }
  return res;
}

function extractLocalPath(fileObj: any): string | undefined {
  if (!fileObj) return undefined;
  const local = fileObj?.local ?? fileObj?.file ?? fileObj;
  return local?.path ?? local?.file_path ?? local?.path_;
}

function makeKeyForRemote(remoteId: any) {
  return `r:${String(remoteId)}`;
}
function makeKeyForFileId(fileId: any) {
  return `f:${String(fileId)}`;
}

interface Props {
  photo: any;
  context?: "channel" | "explore";
  activeDownload?: any;
  width?: number;
  height?: number;
}

export default function MessagePhoto({
  photo,
  context = "channel",
  activeDownload,
  width,
  height,
}: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const navigation: any = useNavigation();
  const isMounted = useRef(true);
  const cancelKeyRef = useRef<string | null>(null); // which id we asked to cancel on unmount

  const screenWidth = Dimensions.get("window").width;

  // sizes
  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1] || {};
  const fileId = biggest?.photo?.id ?? biggest?.id ?? undefined;

  // find a remote id if any size has a remote object (largest preferred)
  const remoteId = useMemo(() => {
    if (!Array.isArray(sizes) || sizes.length === 0) return undefined;
    const lastWithRemote = [...sizes].reverse().find((s) => s?.photo?.remote?.id != null);
    return lastWithRemote?.photo?.remote?.id ?? undefined;
  }, [sizes]);

  const originalWidth = biggest?.width || 320;
  const originalHeight = biggest?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  // display constraints
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

  // thumbnail base64 (mini) -> data url
  const thumbnailBase64 = useMemo(() => {
    const mini = photo?.minithumbnail?.data;
    return mini ? fromByteArray(mini) : null;
  }, [photo]);

  // safe set state only if mounted
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // If cached path exists, set it immediately and skip downloads
  useEffect(() => {
    let keyRemote: string | undefined;
    let keyFile: string | undefined;

    if (remoteId != null) {
      keyRemote = makeKeyForRemote(remoteId);
      const cached = downloadCache.get(keyRemote);
      if (cached) {
        setPhotoPath(cached);
        return;
      }
    }
    if (fileId != null) {
      keyFile = makeKeyForFileId(fileId);
      const cached = downloadCache.get(keyFile);
      if (cached) {
        setPhotoPath(cached);
        return;
      }
    }
    // else do nothing here; actual download happens in the next effect when activeDownload true
  }, [remoteId, fileId]);

  // main download flow (triggered only when activeDownload truthy)
  useEffect(() => {
    if (!activeDownload) {
      // if cancel requested, cancel any inflight for fileId
      if (fileId != null) {
        try {
          cancelDownload(fileId);
        } catch (e) {
          // ignore
        }
      }
      return;
    }

    // prefer remoteId then fileId
    const remoteKey = remoteId != null ? makeKeyForRemote(remoteId) : undefined;
    const fileKey = fileId != null ? makeKeyForFileId(fileId) : undefined;

    // If we already have cached path, set and exit
    if (remoteKey && downloadCache.has(remoteKey)) {
      setPhotoPath(downloadCache.get(remoteKey)!);
      return;
    }
    if (fileKey && downloadCache.has(fileKey)) {
      setPhotoPath(downloadCache.get(fileKey)!);
      return;
    }

    let cancelled = false;

    // helper to call TdLib.downloadFileByRemoteId and parse result, with caching/inflight reuse
    async function downloadByRemoteId(rid: any) {
      if (rid == null) return { ok: false };
      const key = makeKeyForRemote(rid);
      // reuse inflight
      if (inflight.has(key)) return inflight.get(key)!;

      const promise = (async () => {
        try {
          const res: any = await TdLib.downloadFileByRemoteId(rid);
          const parsed = safeParseRaw(res);
          const path = extractLocalPath(parsed);
          if (path) {
            const uri = `file://${path}`;
            downloadCache.set(key, uri);
            return { ok: true, path: uri };
          }
          return { ok: false };
        } catch (err) {
          return { ok: false, error: err };
        } finally {
          inflight.delete(key);
        }
      })();

      inflight.set(key, promise);
      return promise;
    }

    // helper to call TdLib.downloadFile(fileId) (native) with caching
    async function downloadByFileIdentifier(fid: any) {
      if (fid == null) return { ok: false };
      const key = makeKeyForFileId(fid);
      if (inflight.has(key)) return inflight.get(key)!;

      const promise = (async () => {
        try {
          const res: any = await TdLib.downloadFile(Number(fid));
          const parsed = safeParseRaw(res);
          const path = extractLocalPath(parsed);
          if (path) {
            const uri = `file://${path}`;
            downloadCache.set(key, uri);
            return { ok: true, path: uri };
          }
          return { ok: false };
        } catch (err) {
          return { ok: false, error: err };
        } finally {
          inflight.delete(key);
        }
      })();

      inflight.set(key, promise);
      return promise;
    }

    (async () => {
      // try remoteId first (if present)
      if (remoteId != null) {
        const res = await downloadByRemoteId(remoteId);
        if (!cancelled && res?.ok && res.path) {
          // set and return
          if (isMounted.current) setPhotoPath(res.path);
          // also ensure fileId cache mapping: if we have fileId, map fileKey -> same path
          if (fileId != null) {
            downloadCache.set(makeKeyForFileId(fileId), res.path);
          }
          return;
        }
      }

      // fallback try fileId
      if (fileId != null) {
        const res2 = await downloadByFileIdentifier(fileId);
        if (!cancelled && res2?.ok && res2.path) {
          if (isMounted.current) setPhotoPath(res2.path);
          // also set remote cache if remoteId exists
          if (remoteId != null) {
            downloadCache.set(makeKeyForRemote(remoteId), res2.path);
          }
          return;
        }
      }
      // if neither worked, leave thumbnail visible (no loading state)
    })();

    // store cancel key for unmount cancellation
    if (fileId != null) cancelKeyRef.current = String(fileId);

    return () => {
      cancelled = true;
      // cancel via provided hook for the fileId
      if (cancelKeyRef.current) {
        try {
          cancelDownload(Number(cancelKeyRef.current));
        } catch (e) {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDownload, remoteId, fileId]);

  const handleOpenFull = () => {
    if (photoPath) {
      navigation.navigate("FullPhoto", { photoPath });
    }
  };

  // image uri: use downloaded path if present, otherwise thumbnail base64 if present
  const imageUri = photoPath ? photoPath : thumbnailBase64 ? `data:image/jpeg;base64,${thumbnailBase64}` : undefined;

  return (
    <View style={[styles.container]}>
      <TouchableOpacity onPress={handleOpenFull}>
        <View
          style={{
            width: width ? width : displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth,
            height: height ? height : displayHeight < 160 ? 160 : displayHeight,
            borderRadius: context !== "channel" ? 10 : "",
            borderBottomLeftRadius: context === "channel" ? 3 : "",
            borderBottomRightRadius: context === "channel" ? 3 : "",
            backgroundColor: "#111",
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            source={{
              uri: imageUri,
            }}
            style={{
              width: "100%",
              height: "100%",
            }}
            resizeMode="cover"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    //marginBottom: 6,
  },
});
