import React, { useEffect, useMemo, useState } from "react";
import { Text, View, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";
import { ArrowLeftIcon } from "../../../assets/icons";

const cleanText = (text: string): string => {
  return text
    // پاک کردن لینک‌های تلگرام (مثلاً t.me یا telegram.me)
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, "")
    .replace(/https?:\/\/telegram\.me\/[^\s]+/gi, "")

    // پاک کردن mention ها (@username) مخصوصاً در انتهای متن
    .replace(/\n*@\w+[^\n]*$/gm, "")

    // پاک کردن pattern های "| کانال" در انتها
    .replace(/\|\s*[^\n]+$/gm, "")

    // حذف هشتگ‌ها (انگلیسی و فارسی)
    .replace(/#[\p{L}0-9_]+/gu, "")

    // حذف ایموجی‌ها (مخصوصاً آخر متن)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu, "")

    // حذف خط‌های خالی اضافی قبل از mention یا هشتگ یا ایموجی در انتهای متن
    .replace(/(\n\s*)+(?=(?:@|#|[\p{Emoji_Presentation}\p{Extended_Pictographic}]))/gu, "\n")

    // حذف خط‌های خالی در انتهای متن (اما وسط متن نگه می‌داره)
    .replace(/(\n\s*)+$/g, "")

    // حذف خطوطی که فقط کاراکترهای بی‌معنی مثل - _ . هستند
    .replace(/^[\s\-_.]+$/gm, "")

    // جمع کردن خط‌های خالی پشت سر هم (بیشتر از 2 → فقط 1)
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

export default function MessageItem({ data, isVisible, activeDownload }: any) {
  const navigation: any = useNavigation();
  const [message, setMessage] = useState(data);

  // همگام‌سازی prop با state داخلی
  useEffect(() => {
    setMessage(data);
    // console.log("new data come")
  }, [data]);

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
    <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={{
      borderBottomColor: "#222",
      borderBottomWidth: 1,
      paddingVertical: 15,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <MessageHeader chatId={message.chatId} />
        <Text style={{ color: "#999", fontSize: 12.4, fontFamily: "SFArabic-Regular", marginBottom: 6 }}>
          {getRelativeTime(message.date)}
        </Text>
      </View>

      {!!cleanedCaption && (
        <Text style={{
          color: "#ccc",
          marginBottom: 10,
          fontSize: 14,
          fontFamily: "SFArabic-Regular",
          lineHeight: 25,
        }}>
          {cleanedCaption}
        </Text>
      )}

      {!!cleanedText && (
        <Text style={{
          color: "#ccc",
          marginBottom: 10,
          fontSize: 14,
          fontFamily: "SFArabic-Regular",
          lineHeight: 25,
        }}>
          {cleanedText}
        </Text>
      )}

      {content?.photo && <PhotoMessage photo={content.photo} activeDownload={activeDownload} context="explore" />}
      {content?.video && <VideoMessage video={content.video} isVisible={isVisible} activeDownload={activeDownload} />}

      {message.interactionInfo?.reactions?.reactions?.length > 0 && (
        <MessageReactions 
        reactions={message.interactionInfo.reactions.reactions} 
        chatId={message.chatId}
        messageId={message.id}
        onReact={(emoji:any) => console.log("🧡", emoji)}
        customStyles={
          { container: { paddingBottom: 6 },
          emoji:{ fontSize: 13 },
          count: { fontSize: 12 },
          reactionBox: { paddingHorizontal: 6 }
       }} />
      )}

      {message.interactionInfo?.replyInfo?.replyCount > 0 && (
        <TouchableOpacity onPress={() => navigation.navigate("Comments", {
          chatId: message.chatId,
          messageId: message.id,
        })}>
          <View style={{
            flexDirection: "row", alignItems: "center",
            marginTop: 15.4, marginLeft: 4.5, marginBottom: 5, gap: 2
          }}>
            <Text style={{ color: "#adadad", fontSize: 13.6, fontFamily: "SFArabic-Regular" }}>
              {message.interactionInfo.replyInfo.replyCount} کامنت
            </Text>
            <ArrowLeftIcon style={{ color: "#adadad" }} width={13.5} height={13.5} />
          </View>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
