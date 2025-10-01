// MessageItem.tsx
import React, { useEffect, useMemo } from "react";
import { Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";
import { ArrowLeftIcon } from "../../../assets/icons";
import { ReplyIcon } from "lucide-react-native";

const cleanText = (text: string): string => {
  return text
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, "")
    .replace(/https?:\/\/telegram\.me\/[^\s]+/gi, "")
    .replace(/\n*@\w+[^\n]*$/gm, "")
    .replace(/\|\s*[^\n]+$/gm, "")
    .replace(/#[\p{L}0-9_]+/gu, "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu, "")
    .replace(/(\n\s*)+(?=(?:@|#|[\p{Emoji_Presentation}\p{Extended_Pictographic}]))/gu, "\n")
    .replace(/(\n\s*)+$/g, "")
    .replace(/^[\s\-_.]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const getRelativeTime = (unixTimestamp: number): string => {
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

function MessageItemComponent({ data, isVisible, activeDownload, chatInfo }: Props) {
  const navigation: any = useNavigation();
  const message = data;

  const content = message?.content;
  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const cleanedCaption = useMemo(() => cleanText(captionText), [captionText]);
  const cleanedText = useMemo(() => cleanText(messageText), [messageText]);

  const handlePress = () => {
    navigation.navigate("Channel", {
      chatId: message.chatId,
      focusMessageId: message.id,
    });
  };

  const formatNumber = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  };
  const viewCount = formatNumber(message?.interactionInfo?.viewCount || 0);

  return (
    <View style={styles.container}>
      {/* متن، هدر، کپشن و غیره → قابل کلیک */}
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
        {message.replyToMessage && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Channel", {
                chatId: message.chatId,
                focusMessageId: message.replyToMessage.id,
              })
            }
            style={styles.replyBox}
          >
            <ReplyIcon width={16} height={16} color="#999" />
            {message.replyToMessage.content?.photo && (
              <PhotoMessage photo={message.replyToMessage.content.photo} activeDownload={false} width={28} height={20} />
            )}
            <Text numberOfLines={1} style={styles.replyText}>
              {message.replyToMessage.content?.text?.text?.slice(0, 30) ||
                message.replyToMessage.content?.caption?.text?.slice(0, 30) ||
                "پاسخ به پیام"}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerRow}>
          <MessageHeader chatId={message.chatId} chatInfo={chatInfo} />
          <Text style={styles.timeText}>{getRelativeTime(message.date)}</Text>
        </View>

        {!!cleanedCaption && <Text style={styles.bodyText}>{cleanedCaption}</Text>}

        {!!cleanedText && <Text style={styles.bodyText}>{cleanedText}</Text>}

        {content?.photo && <PhotoMessage photo={content.photo} activeDownload={activeDownload} context="explore" />}
      </TouchableOpacity>

      {/* ویدیو جدا از Touchable → دیگه کلیک وسط ویدیو کاربر رو نمی‌بره صفحه Channel */}
      {content?.video && <VideoMessage video={content.video} isVisible={isVisible} activeDownload={activeDownload} />}

      {message.interactionInfo?.reactions?.reactions?.length > 0 && (
        <MessageReactions
          reactions={message.interactionInfo.reactions.reactions}
          chatId={message.chatId}
          messageId={message.id}
          onReact={(emoji: any) => console.log("🧡", emoji)}
          customStyles={{
            container: { paddingBottom: 6 },
            emoji: { fontSize: 13 },
            count: { fontSize: 12 },
            reactionBox: { paddingHorizontal: 6 },
          }}
        />
      )}

      {message.interactionInfo?.replyInfo?.replyCount > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("Comments", {
              chatId: message.chatId,
              messageId: message.id,
            })
          }
        >
          <View style={styles.commentsRow}>
            <Text style={styles.commentsText}>{message.interactionInfo.replyInfo.replyCount} کامنت</Text>
            <ArrowLeftIcon style={{ color: "#adadad" }} width={13.5} height={13.5} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// React.memo with custom comparator to avoid unnecessary re-renders
export default React.memo(
  MessageItemComponent,
  (prev, next) => {
    // re-render only when the essential props changed
    if (prev.data?.id !== next.data?.id) return false;
    if (prev.isVisible !== next.isVisible) return false;
    if (prev.activeDownload !== next.activeDownload) return false;
    // compare interactionInfo minimally (views/replies)
    const prevView = prev.data?.interactionInfo?.viewCount || 0;
    const nextView = next.data?.interactionInfo?.viewCount || 0;
    if (prevView !== nextView) return false;

    const prevReplies = prev.data?.interactionInfo?.replyInfo?.replyCount || 0;
    const nextReplies = next.data?.interactionInfo?.replyInfo?.replyCount || 0;
    if (prevReplies !== nextReplies) return false;

    // chatInfo reference equality (if changed externally, re-render)
    if (prev.chatInfo !== next.chatInfo) return false;

    return true; // otherwise skip render
  }
);

const styles = StyleSheet.create({
  container: {
    borderBottomColor: "#111",
    borderBottomWidth: 1,
    paddingVertical: 15,
  },
  replyBox: {
    backgroundColor: "rgba(111, 111, 111, 0.15)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#888",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  replyText: {
    color: "#ccc",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    color: "#999",
    fontSize: 12.33,
    fontFamily: "SFArabic-Regular",
    marginBottom: 8,
  },
  bodyText: {
    color: "#ccc",
    marginBottom: 10,
    fontSize: 13.5,
    fontFamily: "SFArabic-Regular",
    lineHeight: 25,
  },
  commentsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15.4,
    marginLeft: 4.5,
    marginBottom: 5,
    gap: 2,
  },
  commentsText: {
    color: "#adadad",
    fontSize: 13.6,
    fontFamily: "SFArabic-Regular",
  },
});
