// components/.../MessageVideo.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  View,
  Dimensions,
  StyleSheet,
  Image,
  TouchableOpacity,
  Text,
} from "react-native";
import Video from "react-native-video";
import { Download, Pause, Play, X } from "lucide-react-native";
import { startDownload, cancelDownload, subscribeToFile } from "../../../hooks/useMediaDownloadManager";

const screenWidth = Dimensions.get("window").width;
const START_THRESHOLD_BYTES = 120 * 1024; // when prefix >= this, we can start streaming
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

type Props = {
  video: any;
  isVisible: boolean;
  activeDownload?: any;
  context?: "channel" | "explore";
};

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [playerKey, setPlayerKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const thumbnailPath = video?.thumbnail?.file?.local?.path;
  const minithumbnailData = video?.minithumbnail?.data;
  let thumbnailUri: string | null = null;
  if (thumbnailPath) thumbnailUri = "file://" + thumbnailPath;
  else if (minithumbnailData?.length) {
    try {
      const binary = Uint8Array.from(minithumbnailData).reduce((acc, byte) => acc + String.fromCharCode(byte), "");
      let base64 = null as string | null;
      if (typeof btoa !== "undefined") base64 = btoa(binary);
      else if (typeof Buffer !== "undefined") base64 = Buffer.from(binary, "binary").toString("base64");
      if (base64) thumbnailUri = `data:image/jpeg;base64,${base64}`;
    } catch (e) {}
  }

  const fileId = video?.video?.id ?? video?.file?.id;
  const size = video?.video?.size ?? video?.size ?? 0;
  const duration = video?.video?.duration ?? video?.duration ?? 0;

  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  const maxWidth = screenWidth * 0.92;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 320;

  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  const finalWidth = displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth;
  const finalHeight = displayHeight < 160 ? 160 : displayHeight;
  const borderRadius = context === "channel" ? 8 : 12;

  const preferStream = size >= LARGE_FILE_THRESHOLD || duration >= 120;

  // local state from manager subscription
  const [mgrState, setMgrState] = useState<{ status: string; path?: string | null; progress?: number; total?: number | null }>({
    status: "idle",
    path: null,
    progress: 0,
    total: null,
  });

  // canStream when enough prefix or completed
  const canStream = (() => {
    const completed = mgrState.status === "completed";
    const progressPercent = mgrState.progress ?? 0;
    // decision: either completed or downloaded bytes (approx via percent and total) >= threshold
    if (completed) return true;
    if (mgrState.total && mgrState.total > 0) {
      const downloadedBytes = Math.floor(((mgrState.progress ?? 0) / 100) * mgrState.total);
      return downloadedBytes >= START_THRESHOLD_BYTES;
    }
    // fallback: if progress percent > 10% and no total, allow streaming (best-effort)
    if (!mgrState.total && (mgrState.progress ?? 0) >= 10) return true;
    return false;
  })();

  // subscribe to manager updates
  useEffect(() => {
    if (!fileId) return;
    const unsub = subscribeToFile(fileId, (s) => {
      setMgrState({ status: s.status, path: s.path ?? null, progress: s.progress ?? 0, total: s.total ?? null });
    });
    return () => unsub();
  }, [fileId]);

  // if manager gives us a path and canStream or completed -> mount player
  useEffect(() => {
    if (mgrState.path && (canStream || mgrState.status === "completed")) {
      setPlayerKey((k) => k + 1);
    }
  }, [mgrState.path, canStream, mgrState.status]);

  // auto-start small files
  useEffect(() => {
    if (!fileId) return;
    if (mgrState.status === "idle") {
      if (!preferStream && size > 0 && size < LARGE_FILE_THRESHOLD) {
        startDownload(fileId).catch(() => {});
      }
    }
  }, [fileId, preferStream, size, mgrState.status]);

  // respond to activeDownload toggle
  useEffect(() => {
    if (!fileId) return;
    if (activeDownload) {
      if (mgrState.status === "idle" || mgrState.status === "paused" || mgrState.status === "error") {
        startDownload(fileId).catch(() => {});
      }
    } else {
      // when not active, best-effort pause/cancel
      if (mgrState.status === "downloading") {
        cancelDownload(fileId);
      }
    }
  }, [activeDownload, fileId, mgrState.status]);

  const isCompleted = mgrState.status === "completed" && !!mgrState.path;

  // if no path yet or cannot stream, show thumbnail + overlays
  if (!mgrState.path || (!canStream && !isCompleted)) {
    return (
      <View
        style={{
          width: finalWidth,
          height: finalHeight,
          borderRadius,
          overflow: "hidden",
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {thumbnailUri && (
          <Image source={{ uri: thumbnailUri }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} resizeMode="cover" />
        )}

        <View style={styles.topLeftOverlay} pointerEvents="box-none">
          {mgrState.status === "downloading" && (
            <View style={styles.topLeftRow}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => cancelDownload(fileId)}>
                <Pause width={14} height={14} color="#fff" />
              </TouchableOpacity>
              <View style={styles.smallProgContainer}>
                <Text style={styles.smallProgText}>{mgrState.progress}%</Text>
              </View>
            </View>
          )}

          {mgrState.status === "paused" && (
            <TouchableOpacity style={styles.smallCircle} onPress={() => startDownload(fileId)}>
              <Play width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}

          {(mgrState.status === "idle" || mgrState.status === "error") && (
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => startDownload(fileId)}>
                <Download width={14} height={14} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.sizeLabel}>{(size / (1024 * 1024)).toFixed(1)} MB</Text>
            </View>
          )}
        </View>

        {mgrState.status === "downloading" && (
          <View style={styles.bottomBar} pointerEvents="none">
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${mgrState.progress ?? 0}%` }]} />
            </View>
            <Text style={styles.bottomText}>{mgrState.progress ?? 0}%</Text>
          </View>
        )}

        {mgrState.status === "downloading" && (
          <View style={styles.loadingSpinner}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  }

  // player (only when path exists and streaming allowed / completed)
  return (
    <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000" }}>
      <Video
        key={playerKey}
        source={{ uri: mgrState.path! }}
        style={{ width: "100%", height: "100%" }}
        resizeMode={isFullscreen ? "contain" : "cover"}
        controls
        paused={!isVisible}
        repeat={true}
        onError={(e) => console.warn("[MessageVideo] player error:", e)}
        onLoad={() => {}}
        onBuffer={() => {}}
        onFullscreenPlayerWillPresent={() => setIsFullscreen(true)}
        onFullscreenPlayerWillDismiss={() => setIsFullscreen(false)}
      />

      {!isCompleted && (
        <View style={styles.cornerOverlay} pointerEvents="box-none">
          {mgrState.status === "downloading" && (
            <View style={styles.smallRow}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => cancelDownload(fileId)}>
                <Pause width={14} height={14} color="#fff" />
              </TouchableOpacity>
              <View style={styles.smallProgContainer}>
                <Text style={styles.smallProgText}>{mgrState.progress ?? 0}%</Text>
              </View>
            </View>
          )}

          {mgrState.status === "paused" && (
            <TouchableOpacity style={styles.smallCircle} onPress={() => startDownload(fileId)}>
              <Play width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topLeftOverlay: {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 30,
  },
  topLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  smallCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  smallProgContainer: {
    marginLeft: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  smallProgText: {
    color: "#fff",
    fontSize: 12,
  },
  bottomBar: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    overflow: "hidden",
    marginRight: 8,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  bottomText: {
    color: "#fff",
    fontSize: 12,
  },
  loadingSpinner: {
    position: "absolute",
    bottom: 40,
  },
  cornerOverlay: {
    position: "absolute",
    left: 8,
    bottom: 8,
    zIndex: 30,
  },
  smallRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sizeLabel: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
});
