import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

type ChannelProp = string | number | any;

// simple module-level cache to avoid re-downloading same remoteId
const remoteDownloadCache = new Map<string, string | null>();
const DEBUG = false;

export default function ChannelItem({
  channel,
  onPress,
  onReady,
}: {
  channel: ChannelProp;
  onPress?: (c: any) => void;
  onReady?: (uniqueId: string | number | null | undefined) => void;
}) {
  const navigation: any = useNavigation();
  //console.log(channel)
  const [title, setTitle] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [miniAvatarUri, setMiniAvatarUri] = useState<string | null>(null);
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");
  const [lastMsgThumbUri, setLastMsgThumbUri] = useState<string | null>(null);
  const [resolvedChatId, setResolvedChatId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const calledReadyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ---------- helpers ----------
  function log(...args: any[]) {
    if (DEBUG) console.log('[ChannelItem]', ...args);
  }

  function safeParseRaw(res: any) {
    if (!res) return null;
    // if native wrapper returns { raw: "..." }
    if (typeof res === 'object' && res.raw && typeof res.raw === 'string') {
      try {
        return JSON.parse(res.raw);
      } catch (e) {
        // fallthrough
      }
    }
    // if res itself is JSON string
    if (typeof res === 'string') {
      try {
        return JSON.parse(res);
      } catch (e) {
        return null;
      }
    }
    // already parsed object
    if (typeof res === 'object') return res;
    return null;
  }

  function extractLocalPath(parsed: any): string | undefined {
    if (!parsed) return undefined;
    // check common shapes:
    // parsed.local.path
    if (parsed.local && parsed.local.path) return parsed.local.path;
    // parsed.path
    if (parsed.path) return parsed.path;
    // parsed.file && parsed.file.local.path
    if (parsed.file && parsed.file.local && parsed.file.local.path) return parsed.file.local.path;
    // parsed.file_path
    if (parsed.file_path) return parsed.file_path;
    // sometimes wrapper returns nested in file object
    if (parsed.result && parsed.result.local && parsed.result.local.path) return parsed.result.local.path;
    return undefined;
  }

  function normalizeToFileUri(p?: string | null) {
    if (!p) return null;
    if (p.startsWith('file://')) return p;
    return `file://${p}`;
  }

  // robust download using native wrapper result parsing + cache + small retry
  const tryDownloadRemoteFile = async (remoteId: string): Promise<string | null> => {
    if (!remoteId) return null;

    // return cached value if present (could be null for known-failed)
    if (remoteDownloadCache.has(remoteId)) {
      log('cache hit for', remoteId, remoteDownloadCache.get(remoteId));
      return remoteDownloadCache.get(remoteId) ?? null;
    }

    // small helper to call native and parse
    const callAndParse = async (): Promise<string | null> => {
      try {
        log('calling TdLib.downloadFileByRemoteId for', remoteId);
        const res: any = await TdLib.downloadFileByRemoteId(remoteId);
        log('raw response from native:', res);
        const parsed = safeParseRaw(res);
        log('parsed download response:', parsed);
        const localPath = extractLocalPath(parsed);
        if (localPath) {
          const uri = normalizeToFileUri(localPath);
          return uri;
        }
        // fallback: sometimes native returns top-level path string
        if (typeof res === 'string' && res.length > 0) {
          return normalizeToFileUri(res);
        }
        // sometimes native returns { path: '...' } directly
        if (res && typeof res === 'object' && (res.path || res.local?.path)) {
          const p = res.path ?? res.local?.path;
          return normalizeToFileUri(p);
        }
        return null;
      } catch (e: any) {
        log('downloadFileByRemoteId error:', e?.message ?? e);
        return null;
      }
    };

    // try up to 2 attempts (first attempt often succeeds if underlying flow already prepared)
    let attempts = 0;
    let result: string | null = null;
    while (attempts < 2 && !result) {
      attempts++;
      result = await callAndParse();
      if (result) break;
      // small delay before retry
      await new Promise((r) => setTimeout(r, 250 * attempts));
    }

    // cache result (including null to avoid rapid retries)
    remoteDownloadCache.set(remoteId, result);
    log('download finished for', remoteId, '->', result);
    return result;
  };

  // ---------- UI logic (unchanged mostly) ----------
  const setMiniFromBase64 = (b64: string | null | undefined, setter: (s: string | null) => void) => {
    if (!b64) { setter(null); return; }
    if (b64.startsWith("data:")) { setter(b64); return; }
    try {
      const trimmed = b64.trim();
      if (trimmed.length > 0) {
        setter(`data:image/jpeg;base64,${trimmed}`);
        return;
      }
    } catch { setter(null); return; }
  };

  const extractPreviewAndThumb = (obj: any) => {
    const msgText = obj?.lastMessageText ?? obj?.lastMessage ?? null;
    if (msgText && typeof msgText === "string") {
      const cleaned = msgText.replace(/\s+/g, " ").trim();
      const max = 60;
      setLastMessagePreview(cleaned.length > max ? cleaned.slice(0, max).trim() + "…" : cleaned);
    } else {
      setLastMessagePreview("");
    }

    const lThumb = obj?.lastMessageMiniThumbnail ?? null;
    setLastMsgThumbUri(null);
    if (typeof lThumb === "string" && lThumb.length > 0) {
      if (lThumb.startsWith("data:")) {
        setLastMsgThumbUri(lThumb);
      } else if (lThumb.startsWith("/9j") || lThumb.length > 100) {
        setMiniFromBase64(lThumb, setLastMsgThumbUri);
      } else {
        (async () => {
          const p = await tryDownloadRemoteFile(lThumb);
          if (p && mountedRef.current) {
            setLastMsgThumbUri(p);
          }
        })();
      }
    }
  };

  const applyServerChannel = (ch: any) => {
    if (!ch) return;
    if (ch.title) setTitle(ch.title);

    const chatIdVal = ch.chatId ?? ch.id ?? ch.username ?? null;
    if (chatIdVal !== null && chatIdVal !== undefined) setResolvedChatId(chatIdVal);

    if (ch.miniThumbnailBase64) {
      setMiniFromBase64(ch.miniThumbnailBase64, setMiniAvatarUri);
    } else {
      setMiniAvatarUri(null);
    }

    if (ch.avatarRemoteId) {
      // background download; use cached/inflight behavior inside tryDownloadRemoteFile
      (async () => {
        const p = await tryDownloadRemoteFile(ch.avatarRemoteId);
        if (p && mountedRef.current) {
          setAvatarUri(p);
        }
      })();
    } else {
      setAvatarUri(null);
    }

    extractPreviewAndThumb(ch);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    calledReadyRef.current = false;

    const init = async () => {
      if (typeof channel === "object" && channel !== null) {
        applyServerChannel(channel);
        return;
      }
      if (typeof channel === "string" || typeof channel === "number") {
        setTitle(String(channel));
        setResolvedChatId(channel);
        setMiniAvatarUri(null);
        setAvatarUri(null);
        setLastMessagePreview("");
        setLastMsgThumbUri(null);
        setLoading(false);
        return;
      }
      setTitle("بدون عنوان");
      setMiniAvatarUri(null);
      setAvatarUri(null);
      setLastMessagePreview("");
      setLastMsgThumbUri(null);
      setLoading(false);
    };

    if (mounted) init();

    return () => { mounted = false; };
  }, [channel]);

  useEffect(() => {
    if (!loading && !calledReadyRef.current) {
      onReady?.(resolvedChatId ?? channel);
      calledReadyRef.current = true;
    }
  }, [loading, resolvedChatId, channel, onReady]);

  const handlePress = async() => {
    console.log(channel)
    navigation.navigate("Channel", { chatId: +channel.chatId, cache: true, username: channel.username });
  };

  if (loading) return null;
  if (!miniAvatarUri) return null;

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      {avatarUri || miniAvatarUri ? (
        <Image
          source={{ uri: avatarUri || miniAvatarUri || '' }}
          style={styles.avatar}
        />
      ) : null}
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text numberOfLines={1} style={styles.title}>
          {title || (typeof channel === "string" ? channel : "بدون عنوان")}
        </Text>
        <View style={styles.lastRow}>
          <Text numberOfLines={1} style={styles.lastMessage}>
            {lastMessagePreview}
          </Text>
          {lastMsgThumbUri ? (
            <Image source={{ uri: lastMsgThumbUri }} style={styles.lastThumb} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 0.9,
    borderColor: "#222222ac",
    backgroundColor: "#0e0e0eff",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 25.5,
    marginRight: 8,
  },
  title: {
    fontSize: 15.5,
    fontWeight: "600",
    color: "white",
    fontFamily: "SFArabic-Heavy",
  },
  lastRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 13,
    color: "#aaa",
    marginTop: 2,
    flex: 1,
    fontFamily: "SFArabic-Regular",
  },
  lastThumb: {
    width: 20,
    height: 18,
    borderRadius: 4,
    backgroundColor: "#333",
    marginRight: 3,
  },
});
