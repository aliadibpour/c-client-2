import { Dimensions, Text, View, TouchableOpacity } from "react-native";
import { useMemo } from "react";
import { fromByteArray } from "base64-js";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeftIcon, Eye } from "lucide-react-native";
import { ArrowLeft } from "../../../assets/icons";

// پاک‌سازی متن کپشن یا پیام
const cleanText = (text: string): string => {
  return text
    .replace(/[\p{Emoji}\s@‌\w]+@[\w_]+$/gu, "")
    .replace(/@\w+$/gm, "")
    .replace(/https?:\/\/\S+$/gm, "")
    .trim();
};

// محاسبه زمان نسبی مثل 40s، 2m، 3h، 1d
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

export default function MessageItem({ data, isVisible }: any) {
  const content = data?.content;
  const navigation: any = useNavigation();

  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const cleanedCaption = useMemo(() => cleanText(captionText), [captionText]);
  const cleanedText = useMemo(() => cleanText(messageText), [messageText]);

  const handlePress = () => {
    navigation.navigate("Channel", {
      chatId: data.chatId,
      focusMessageId: data.id,
    })
  };

  const formatNumber = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  };
  const viewCount = formatNumber(data?.interactionInfo?.viewCount || 0)

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      style={{
        borderBottomColor: "#333",
        borderBottomWidth: 1,
        paddingVertical: 15,
      }}
    >

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap:7 }}>
        <MessageHeader chatId={data.chatId} />
        <Text style={{ color: "#999", fontSize: 12.4, fontFamily: "SFArabic-Regular", marginBottom:6 }}>
            {getRelativeTime(data.date)}
        </Text>
      </View>

      {!!cleanedCaption && (
        <Text
          style={{
            color: "#f2f2f2",
            marginBottom: 11,
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
            lineHeight: 25,
          }}
        >
          {cleanedCaption}
        </Text>
      )}

      {!!cleanedText && (
        <Text
          style={{
            color: "#f2f2f2",
            marginBottom: 11,
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
            lineHeight: 25,
          }}
        >
          {cleanedText}
        </Text>
      )}

      {content?.photo && <PhotoMessage photo={content.photo} />}
      {content?.video && <VideoMessage video={content.video} isVisible={isVisible} />}

      {data.interactionInfo?.reactions?.reactions?.length > 0 && (
        <MessageReactions reactions={data.interactionInfo.reactions.reactions} customStyles={{container: {paddingBottom: 6}}} />
      )}

      {data.interactionInfo?.replyInfo?.replyCount > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("Comments", {
              chatId: data.chatId,
              messageId: data.id,
            })
          }
        >
          <View style={{
            flexDirection: "row", alignItems:"center",marginTop: 15.4, marginLeft:4.5, marginBottom:5, gap: 2}}>
            <Text style={{ color: "#54afff", fontSize:15, fontFamily: "SFArabic-Regular" }}>
              {data.interactionInfo.replyInfo.replyCount} کامنت
            </Text>
            <ArrowLeft style={{color: "#54afff"}} width={15} height={15}/>
          </View>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
