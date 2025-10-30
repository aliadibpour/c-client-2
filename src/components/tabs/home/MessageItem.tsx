// MessageItem.tsx (reply preview styled like X — minimal other changes)
import React, { useEffect, useMemo } from "react";
import { Text, View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";
import { ArrowLeftIcon } from "../../../assets/icons";
import { ReplyIcon } from "lucide-react-native";
import { normalizeReplyPreview } from "../../../hooks";

const cleanText = (text: string): string => {
  if (!text || typeof text !== "string") return "";

  // Emoji character class (unicode properties). Keep as a character class string for RegExp.
  const EMOJI_CLASS = "[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]";

  // Normalize CRLF -> LF
  let out = text.replace(/\r\n/g, "\n");

  // Remove Telegram links
  out = out
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, "")
    .replace(/https?:\/\/telegram\.me\/[^\s]+/gi, "");

  // Remove hashtags
  out = out.replace(/#[\p{L}0-9_]+/gu, "");

  // Split to lines for per-line processing
  const lines = out.split("\n");

  const processed = lines
    .map((line) => {
      // Trim edges first
      let ln = line.trim();

      // If the line contains any @username -> drop the whole line later
      // We use a simple username pattern: @ followed by letters/numbers/underscore
      if (/@[A-Za-z0-9_]+/.test(ln)) {
        return ""; // mark for removal
      }

      // Remove leading sequences of emojis (and spaces between them)
      // Pattern: ^(?:EMOJI(?:\s*EMOJI)*)\s*  -> removes emojis at line-start
      const leadingEmojiRe = new RegExp(`^(?:${EMOJI_CLASS}(?:\\s*${EMOJI_CLASS})*)\\s*`, "u");
      ln = ln.replace(leadingEmojiRe, "");

      // Remove lines that are only punctuation/whitespace (like ----- or ___)
      if (/^[\s\-\._]+$/.test(ln)) {
        return "";
      }

      // Trim again and return
      return ln.trim();
    })
    // Remove empty results (dropped lines, blank lines)
    .filter((l) => l !== "");

  // Join with single newline (no blank lines anywhere)
  return processed.join("\n");
};


const getRelativeTime = (unixTimestamp: number): string => {
  if (!unixTimestamp) return "";
  const now = Date.now();
  const secondsDiff = Math.floor(now / 1000 - unixTimestamp);
  if (secondsDiff < 60) return `${secondsDiff}s`;
  const minutes = Math.floor(secondsDiff / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

type Props = {
  data: any;
  isVisible: boolean;
  activeDownload: boolean;
  chatInfo?: any;
};

const getReplyPreviewText = (rm: any) => {
  if (!rm) return "";
  // return raw text (do NOT pre-slice it) — let normalizeReplyPreview handle truncation
  return (
    rm?.content?.text?.text ||
    rm?.content?.caption?.text ||
    rm?.text?.text ||
    rm?.caption?.text ||
    ""
  );
};

function MessageItem({ data, isVisible, activeDownload, chatInfo }: Props) {
  const navigation: any = useNavigation();
  const message = data ?? {};
  // console.log(data)

  const content = message?.content;
  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const cleanedCaption = useMemo(() => cleanText(captionText), [captionText]);
  const cleanedText = useMemo(() => cleanText(messageText), [messageText]);

  const handleOpenChannel = (chatId: any, focusMessageId: any) => {
    navigation.navigate("Channel", { chatId, focusMessageId });
  };

  // IMPORTANT: MessageItem NO LONGER fetches reply message.
  // It expects HomeScreen to attach full reply object as `replyToMessage`
  // fallback to provided reply metadata (message.replyTo / message.replyToMessage)
  const replyMsg = message.replyToMessage || message.replyTo || message.reply_to_message || null;

  const openingComments = message.__openingComments || false; // UI flag, controlled by events if needed

  const handleOpenComments = async () => {
    navigation.navigate("Comments", { chatId: message.chatId, messageId: message.id });
  };

  return (
    <View style={styles.container}>
      {/* header: name + time inline */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => handleOpenChannel(message.chatId, message.id)} activeOpacity={0.85} style={{ flex: 1 }}>
          <View style={styles.headerInner}>
            <MessageHeader chatId={message.chatId} chatInfo={chatInfo} />
            <Text style={styles.timeInline}>{getRelativeTime(message.date)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* reply preview (no heavy background; border + small thumb + small text) */}
      {(message.replyTo || message.replyToMessage || message.reply_to_message) ? (
        <TouchableOpacity
          style={styles.replyBox}
          onPress={() => {
            const rid = replyMsg?.id ?? replyMsg?.messageId ?? replyMsg?.message_id ?? message.replyTo?.id ?? message.replyTo?.messageId ?? message.replyTo?.message_id;
            const rchat = replyMsg?.chatId ?? message.replyTo?.chatId ?? message.chatId;
            if (rid) handleOpenChannel(rchat, rid);
            else handleOpenChannel(message.chatId, message.id);
          }}
          activeOpacity={0.85}
        >
          <ReplyIcon width={14} height={14} color="#999" />
          {/* No live fetching here. If replyMsg is not present (only an id was available and Home couldn't fetch it), show fallback */}
          { replyMsg?.content?.photo ? (
            <View style={styles.replyThumbWrap}>
              <PhotoMessage
                photo={replyMsg?.content?.photo}
                activeDownload={false}
                width={44}
                height={30}
                context="channel"
              />
            </View>
          ) : null }
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"   // keep end of text, trim start
            style={styles.replyText}
          >
            {normalizeReplyPreview(
              getReplyPreviewText(replyMsg) || getReplyPreviewText(message.replyTo) || "",
              { charLimit: 100 }
            ) || "پاسخ به پیام"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* body */}
      <TouchableOpacity onPress={() => handleOpenChannel(message.chatId, message.id)} activeOpacity={0.9}>
        {!!cleanedCaption && <Text style={styles.bodyText}>{cleanedCaption}</Text>}
        {!!cleanedText && <Text style={styles.bodyText}>{cleanedText}</Text>}
        {content?.photo && (
          <View style={{marginVertical: 4}}>
            <PhotoMessage photo={content.photo} activeDownload={activeDownload} context="explore" />
          </View>
        )}
      </TouchableOpacity>

      {content?.video && 
        <View style={{marginVertical: 4}}>
          <VideoMessage video={content.video} activeDownload={activeDownload} />
        </View>}

      {message.interactionInfo?.reactions?.reactions?.length > 0 && (
        <MessageReactions
          reactions={message.interactionInfo.reactions.reactions}
          chatId={message.chatId}
          messageId={message.id}
          onReact={(emoji: any) => console.log("🧡", emoji)}
          customStyles={{
            container: { paddingBottom: 2 },
            emoji: { fontSize: 12.5 },
            count: { fontSize: 11.5 },
            reactionBox: { paddingHorizontal: 6 },
          }}
        />
      )}

      {message.interactionInfo?.replyInfo?.replyCount > 0 && (
        <TouchableOpacity onPress={handleOpenComments}>
          <View style={styles.commentsRow}>
            <Text style={styles.commentsText}>{message.interactionInfo.replyInfo.replyCount} کامنت</Text>
            {openingComments ? (
              <ActivityIndicator style={{ marginLeft: 2 }} size="small" color="#adadad" />
            ) : (
              <ArrowLeftIcon style={{ color: "#adadad" }} width={13.5} height={13.5} />
            )}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(
  MessageItem,
  (prev, next) => {
    if (prev.data?.id !== next.data?.id) return false;
    if (prev.isVisible !== next.isVisible) return false;
    if (prev.activeDownload !== next.activeDownload) return false;
    const prevView = prev.data?.interactionInfo?.viewCount || 0;
    const nextView = next.data?.interactionInfo?.viewCount || 0;
    if (prevView !== nextView) return false;
    const prevReplies = prev.data?.interactionInfo?.replyInfo?.replyCount || 0;
    const nextReplies = next.data?.interactionInfo?.replyInfo?.replyCount || 0;
    if (prevReplies !== nextReplies) return false;
    if (prev.chatInfo !== next.chatInfo) return false;
    return true;
  }
);

const styles = StyleSheet.create({
  container: {
    borderBottomColor: "#111",
    borderBottomWidth: 1,
    paddingVertical: 12.4,
    gap: 2
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  // time shown inline near name (subtle)
  timeInline: {
    color: "#999",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
    marginLeft: 5,
    alignSelf: "center",
  },

  // reply box: X-like preview (no heavy BG, border only, small thumb + small text)
  replyBox: {
    backgroundColor: "#111", // no solid bg
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(219, 219, 219, 0.06)", // subtle border
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginVertical:4,
  },
  replyThumbWrap: {
    width: 44,
    height: 30,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  replyText: {
    color: "#999",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
    flexShrink: 1,        // allow shrinking
    includeFontPadding: false,
    lineHeight: 16,
  },
  timeText: {
    color: "#999",
    fontSize: 12.33,
    fontFamily: "SFArabic-Regular",
    marginBottom: 8,
  },
  bodyText: {
    color: "#ccc",
    fontSize: 13.45,
    fontFamily: "SFArabic-Regular",
    lineHeight: 25,
  },
  commentsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4.5,
    gap: 1,
    marginTop:2
  },
  commentsText: {
    color: "#adadad",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
  },
});
