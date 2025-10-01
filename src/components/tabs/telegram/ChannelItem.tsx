import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

type ChannelProp = string | number | any; // username string, chatId number, or full chat object

export default function ChannelItem({ channel, onPress }: { channel: ChannelProp; onPress?: (c: any) => void }) {
  const navigation: any = useNavigation();

  const [title, setTitle] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [miniAvatarUri, setMiniAvatarUri] = useState<string | null>(null);
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");
  const [lastMsgThumbUri, setLastMsgThumbUri] = useState<string | null>(null);
  const [isUsernameNotOccupied, setIsUsernameNotOccupied] = useState(false);
  const [resolvedChatId, setResolvedChatId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // safe parse helper
  const safeParse = (maybe: any) => {
    if (!maybe) return null;
    if (typeof maybe === "object") return maybe;
    if (typeof maybe === "string") {
      const t = maybe.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { return JSON.parse(t); } catch { return null; }
      }
      try { return JSON.parse(maybe); } catch { return null; }
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
    else if (content.caption && typeof content.caption === "string") text = content.caption;
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
      setLastMessagePreview(cleaned.length > max ? cleaned.slice(0, max).trim() + "…" : cleaned);
    } else if (maybePhoto) {
      setLastMessagePreview("عکس/ویدیو");
    } else {
      setLastMessagePreview("");
    }
  };

  const applyChatObj = (chatObj: any) => {
    if (!chatObj) return;
    if (chatObj.title) setTitle(chatObj.title);

    // resolve chatId (اولویت chatId، بعد id)
    const chatIdVal = chatObj.chatId ?? chatObj.id ?? null;
    if (chatIdVal !== null && chatIdVal !== undefined) setResolvedChatId(chatIdVal);

    // profile minithumbnail
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

    const small = chatObj.photo?.small;
    if (small?.local?.isDownloadingCompleted && small?.local?.path) {
      setAvatarUri(`file://${small.local.path}`);
    } else {
      // اگر small.id هست، ما دانلود نمی‌کنیم؛ ولی می‌تونیم chatId رو نگه داریم تا صفحه‌ی Channel خودش دانلود کنه
    }

    // extract last message preview/thumbnail
    extractPreviewAndThumb(chatObj);

    // done loading
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const fetchInfo = async () => {
      if (typeof channel === "object" && channel !== null) {
        applyChatObj(channel);
        // resolvedChatId fallback if channel object didn't contain id
        if ((!channel.chatId && !channel.id) && typeof channel.username === "string") {
          setResolvedChatId(channel.username);
        }
        return;
      }

      try {
        if (typeof channel === "number") {
          const res: any = await TdLib.getChat(channel);
          const parsed = res?.raw ? safeParse(res.raw) ?? safeParse(res) : safeParse(res);
          if (parsed && mounted) {
            applyChatObj(parsed);
            return;
          } else {
            // fallback
            setTitle(String(channel));
            setResolvedChatId(channel);
            setLoading(false);
            return;
          }
        }

        if (typeof channel === "string") {
          try {
            const res: any = await TdLib.searchPublicChat(channel);
            let parsed = null;
            if (res && res.raw) parsed = safeParse(res.raw);
            if (!parsed) parsed = safeParse(res);
            if (!parsed && typeof res === "object") parsed = res;

            if (parsed && mounted) {
              applyChatObj(parsed);
              return;
            } else {
              if (res?.error) {
                const errMsg = typeof res.error === "string" ? res.error : res.error?.message;
                if (errMsg && String(errMsg).includes("USERNAME_NOT_OCCUPIED")) {
                  setIsUsernameNotOccupied(true);
                  setTitle(channel);
                  setResolvedChatId(channel); // fallback to username
                  setLoading(false);
                  return;
                }
              }
              // fallback: show username as title
              setTitle(channel);
              setResolvedChatId(channel);
              setLoading(false);
            }
          } catch (err: any) {
            const errStr = err?.message || String(err);
            if (errStr.includes("USERNAME_NOT_OCCUPIED")) {
              setIsUsernameNotOccupied(true);
              setTitle(channel);
              setResolvedChatId(channel);
              setLoading(false);
              return;
            }
            console.error("ChannelItem fetch error:", err);
            setTitle(channel);
            setResolvedChatId(channel);
            setLoading(false);
          }
        }
      } catch (e) {
        console.error("ChannelItem unexpected error:", e);
        if (mounted) {
          setTitle(typeof channel === "string" ? channel : "بدون عنوان");
          setResolvedChatId(typeof channel === "string" ? channel : null);
          setLoading(false);
        }
      }
    };

    if (mounted) fetchInfo();

    return () => {
      mounted = false;
    };
  }, [channel]);

  const handlePress = () => {
    // اگر caller خواست خودش handle کنه، اول onPress اجرا شود
    if (onPress) {
      onPress({ channel, chatId: resolvedChatId });
      return;
    }
    // در غیر اینصورت با navigation به صفحه Channel می‌ریم و chatId یا username را می‌فرستیم
    navigation.navigate("Channel", { chatId: resolvedChatId ?? channel });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color="#888" size="small" />
        <Text style={{ color: "#888", marginLeft: 8 }}>در حال بارگذاری...</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Image
        source={avatarUri ? { uri: avatarUri } : miniAvatarUri ? { uri: miniAvatarUri } : undefined}
        style={styles.avatar}
      />
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text numberOfLines={1} style={styles.title}>{title || (typeof channel === "string" ? channel : "بدون عنوان")}</Text>
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
    borderBottomWidth: .9,
    borderColor: "#222222ac",
    backgroundColor: "#0e0e0eff",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 25.5,
    marginRight: 8,
    backgroundColor: "#666",
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
    gap: 3,
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
