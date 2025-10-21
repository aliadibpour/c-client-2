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

export default function ChannelItem({
  channel,
  onPress,
  onReady,
  prefetched, // <-- جدید: داده‌ای که از loader می‌گیریم (ممکن است شامل __downloaded_profile_photo باشد)
}: {
  channel: ChannelProp;
  onPress?: (c: any) => void;
  onReady?: (uniqueId: string | number | null | undefined) => void;
  prefetched?: any;
}) {
  const navigation: any = useNavigation();

  const [title, setTitle] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [miniAvatarUri, setMiniAvatarUri] = useState<string | null>(null);
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");
  const [lastMsgThumbUri, setLastMsgThumbUri] = useState<string | null>(null);
  const [isUsernameNotOccupied, setIsUsernameNotOccupied] = useState(false);
  const [resolvedChatId, setResolvedChatId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const calledReadyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeParse = (maybe: any) => {
    if (!maybe) return null;
    if (typeof maybe === "object") return maybe;
    if (typeof maybe === "string") {
      const t = maybe.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          return JSON.parse(t);
        } catch {
          return null;
        }
      }
      try {
        return JSON.parse(maybe);
      } catch {
        return null;
      }
    }
    return null;
  };

  const extractPreviewAndThumb = (chatObj: any) => {
    const msg = chatObj?.lastMessage;
    setLastMsgThumbUri(null);
    setLastMessagePreview("");

    if (!msg) return;

    const content = msg.content || msg;
    let text = "";

    if (typeof content === "string") text = content;
    else if (content.text && typeof content.text === "string") text = content.text;
    else if (content.text && content.text.text) text = content.text.text;
    else if (content.caption && typeof content.caption === "string")
      text = content.caption;
    else if (content.caption && content.caption.text) text = content.caption.text;
    else if (msg.content?.caption?.text) text = msg.content.caption.text;
    else if (msg.content?.text?.text) text = msg.content.text.text;

    const maybePhoto = msg?.content?.photo || msg?.photo || msg?.content?.video || null;
    const thumbData =
      maybePhoto?.minithumbnail?.data ||
      (maybePhoto?.sizes && maybePhoto.sizes[0]?.minithumbnail?.data) ||
      null;

    if (thumbData) {
      try {
        const buf = Buffer.from(thumbData as any);
        const b64 = buf.toString("base64");
        setLastMsgThumbUri(`data:image/jpeg;base64,${b64}`);
      } catch {
        setLastMsgThumbUri(null);
      }
    }

    if (text) {
      const cleaned = text.replace(/\s+/g, " ").trim();
      const max = 60;
      setLastMessagePreview(
        cleaned.length > max ? cleaned.slice(0, max).trim() + "…" : cleaned
      );
    } else if (maybePhoto) {
      setLastMessagePreview("عکس/ویدیو");
    } else {
      setLastMessagePreview("");
    }
  };

  // helper: try to find remote id anywhere in object (profile_photo, photo, remote, id ...)
  const findRemoteId = (obj: any): string | null => {
    if (!obj || typeof obj !== "object") return null;
    // check common paths first
    if (obj?.profile_photo?.small?.remote?.id) return String(obj.profile_photo.small.remote.id);
    if (obj?.photo?.small?.remote?.id) return String(obj.photo.small.remote.id);
    if (obj?.photo?.remote?.id) return String(obj.photo.remote.id);
    // deep search
    const deepFind = (o: any): string | null => {
      if (!o || typeof o !== "object") return null;
      if (o.remote && typeof o.remote === "object" && ("id" in o.remote)) {
        return String(o.remote.id);
      }
      for (const k of Object.keys(o)) {
        try {
          if (typeof o[k] === "object") {
            const r = deepFind(o[k]);
            if (r) return r;
          }
        } catch { /* ignore */ }
      }
      return null;
    };
    return deepFind(obj);
  };

  // try download remote file (non-blocking). returns local path or null.
  const tryDownloadRemoteFile = async (remoteId: string): Promise<string | null> => {
    if (!remoteId) return null;
    try {
      const r = await TdLib.downloadFileByRemoteId(remoteId);
      // depending on binding, r may be a path string or an object; handle both
      if (!r) return null;
      if (typeof r === "string") return r;
      // if object: try common fields
      if (r.path) return r.path;
      if (r.local && r.local.path) return r.local.path;
      return null;
    } catch (e) {
      // ignore download errors
      return null;
    }
  };

  const applyChatObj = (chatObj: any) => {
    if (!chatObj) return;
    if (chatObj.title) setTitle(chatObj.title);

    const chatIdVal = chatObj.chatId ?? chatObj.id ?? null;
    if (chatIdVal !== null && chatIdVal !== undefined) setResolvedChatId(chatIdVal);

    const mini = chatObj.photo?.minithumbnail?.data;
    if (mini) {
      try {
        const buf = Buffer.from(mini as any);
        const b64 = buf.toString("base64");
        setMiniAvatarUri(`data:image/jpeg;base64,${b64}`);
      } catch {
        setMiniAvatarUri(null);
      }
    }

    // if there's an already-downloaded profile photo attached by loader, use it
    if (chatObj.__downloaded_profile_photo) {
      const dl = chatObj.__downloaded_profile_photo;
      // if it's an absolute path or file://, normalize to uri
      if (typeof dl === "string" && dl.length > 0) {
        const possible = dl.startsWith("file://") ? dl : `file://${dl}`;
        setAvatarUri(possible);
      } else if (typeof dl === "object" && dl.path) {
        setAvatarUri(dl.path.startsWith("file://") ? dl.path : `file://${dl.path}`);
      }
    }

    // if there is a local path reported by TdLib structure (already downloaded)
    const small = chatObj.photo?.small;
    if (small?.local?.isDownloadingCompleted && small?.local?.path) {
      const p = small.local.path.startsWith("file://") ? small.local.path : `file://${small.local.path}`;
      setAvatarUri(p);
    }

    extractPreviewAndThumb(chatObj);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    calledReadyRef.current = false;

    const fetchInfo = async () => {
      // 1) if prefetched present, use it immediately (may include __downloaded_profile_photo)
      if (prefetched) {
        const parsed = prefetched?.raw ? safeParse(prefetched.raw) ?? safeParse(prefetched) : safeParse(prefetched) ?? prefetched;
        applyChatObj(parsed ?? prefetched);

        // resolved id fallback if not present
        if ((!parsed?.chatId && !parsed?.id) && parsed?.username) {
          setResolvedChatId(parsed.username);
        }

        // mark loading false quickly (we won't wait for download)
        if (mountedRef.current) setLoading(false);

        // if avatar not set but __downloaded_profile_photo exists -> set it (applyChatObj did)
        // if avatar still missing, but parsed has remote id -> try download in background and update when ready
        if (mountedRef.current) {
          const hasAvatar = !!(avatarUri || miniAvatarUri);
          const remoteId = findRemoteId(parsed ?? prefetched);
          if (!hasAvatar && remoteId) {
            // fire-and-forget
            try {
              const dl = await tryDownloadRemoteFile(remoteId);
              if (mountedRef.current && dl) {
                const p = dl.startsWith("file://") ? dl : `file://${dl}`;
                setAvatarUri(p);
              }
            } catch { /* ignore */ }
          }
        }
        return;
      }

      // 2) if channel is already an object, apply it
      if (typeof channel === "object" && channel !== null) {
        applyChatObj(channel);
        if ((!channel.chatId && !channel.id) && typeof channel.username === "string") {
          setResolvedChatId(channel.username);
        }
        if (mountedRef.current) setLoading(false);

        // background download if needed
        const remoteId = findRemoteId(channel);
        if (mountedRef.current && !avatarUri && remoteId) {
          try {
            const dl = await tryDownloadRemoteFile(remoteId);
            if (mountedRef.current && dl) {
              const p = dl.startsWith("file://") ? dl : `file://${dl}`;
              setAvatarUri(p);
            }
          } catch { /* ignore */ }
        }
        return;
      }

      // 3) numeric id -> getChat
      try {
        if (typeof channel === "number") {
          const res: any = await TdLib.getChat(channel);
          const parsed = res?.raw ? safeParse(res.raw) ?? safeParse(res) : safeParse(res);
          if (parsed && mountedRef.current) {
            applyChatObj(parsed);
            setLoading(false);
            // background download if needed
            const remoteId = findRemoteId(parsed);
            if (remoteId) {
              try {
                const dl = await tryDownloadRemoteFile(remoteId);
                if (mountedRef.current && dl) {
                  const p = dl.startsWith("file://") ? dl : `file://${dl}`;
                  setAvatarUri(p);
                }
              } catch { /* ignore */ }
            }
            return;
          } else {
            if (mountedRef.current) {
              setTitle(String(channel));
              setResolvedChatId(channel);
              setLoading(false);
            }
            return;
          }
        }

        // 4) string username -> searchPublicChat
        if (typeof channel === "string") {
          try {
            const res: any = await TdLib.searchPublicChat(channel);
            let parsed = null;
            if (res && res.raw) parsed = safeParse(res.raw);
            if (!parsed) parsed = safeParse(res);
            if (!parsed && typeof res === "object") parsed = res;

            if (parsed && mountedRef.current) {
              applyChatObj(parsed);
              setLoading(false);

              // background download if present
              const remoteId = findRemoteId(parsed);
              if (remoteId) {
                try {
                  const dl = await tryDownloadRemoteFile(remoteId);
                  if (mountedRef.current && dl) {
                    const p = dl.startsWith("file://") ? dl : `file://${dl}`;
                    setAvatarUri(p);
                  }
                } catch { /* ignore */ }
              }
              return;
            } else {
              if (res?.error) {
                const errMsg = typeof res.error === "string" ? res.error : res.error?.message;
                if (errMsg && String(errMsg).includes("USERNAME_NOT_OCCUPIED")) {
                  setIsUsernameNotOccupied(true);
                  setTitle(channel);
                  setResolvedChatId(channel);
                  if (mountedRef.current) setLoading(false);
                  return;
                }
              }
              if (mountedRef.current) {
                setTitle(channel);
                setResolvedChatId(channel);
                setLoading(false);
              }
            }
          } catch (err: any) {
            const errStr = err?.message || String(err);
            if (errStr.includes("USERNAME_NOT_OCCUPIED") || errStr.toLowerCase().includes("username is invalid")) {
              setIsUsernameNotOccupied(true);
              setTitle(channel);
              setResolvedChatId(channel);
              if (mountedRef.current) setLoading(false);
              return;
            }
            console.error("ChannelItem fetch error:", err);
            if (mountedRef.current) {
              setTitle(channel);
              setResolvedChatId(channel);
              setLoading(false);
            }
          }
        }
      } catch (e) {
        console.error("ChannelItem unexpected error:", e);
        if (mountedRef.current) {
          setTitle(typeof channel === "string" ? channel : "بدون عنوان");
          setResolvedChatId(typeof channel === "string" ? channel : null);
          setLoading(false);
        }
      }
    };

    fetchInfo();

    return () => { mounted = false; };
  }, [channel, prefetched]); // اضافه شدن prefetched به deps

  // call onReady as soon as loading is false (we don't wait for background avatar download)
  useEffect(() => {
    if (!loading && !calledReadyRef.current) {
      onReady?.(resolvedChatId ?? channel);
      calledReadyRef.current = true;
    }
  }, [loading, resolvedChatId, channel, onReady]);

  const handlePress = () => {
    if (onPress) {
      onPress({ channel, chatId: resolvedChatId });
      return;
    }
    navigation.navigate("Channel", { chatId: resolvedChatId ?? channel });
  };

  // وقتی loading هست، ما null برمی‌گردونیم (تو طراحی تو) — اگر می‌خوای placeholder باشه اینجا تغییر بده
  if (loading) {
    return null;
  }

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
