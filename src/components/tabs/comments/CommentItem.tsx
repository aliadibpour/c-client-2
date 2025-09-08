import { fromByteArray } from "base64-js";
import { Reply } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MessageReactions from "../home/MessageReaction";
import { Easing } from "react-native";

export default function CommentItem({ item, index, comments, navigation, highlightedId, handleReplyClick }: any) {
  const user = item?.user;
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

  const base64Thumb = user?.profilePhoto?.minithumbnail?.data
    ? `data:image/jpeg;base64,${fromByteArray(user.profilePhoto.minithumbnail.data)}`
    : null;

  const avatarUri = user?.avatarSmall || base64Thumb;
  const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

  const previousMessage = comments.comments[index - 1];
  const showAvatar =
    !previousMessage || previousMessage?.senderId?.userId !== item?.senderId?.userId;

  // === هایلایت شدن پیام ===
  const isHighlighted = highlightedId === item.id;
  const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
    if (isHighlighted) {
        anim.setValue(0); // ریست قبل از اجرا

        Animated.sequence([
        Animated.timing(anim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic), // نرم‌تر روشن شه
            useNativeDriver: false,
        }),
        Animated.delay(500), // یه مکث کوتاه روی حالت روشن
        Animated.timing(anim, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.cubic), // خیلی نرم خاموش شه
            useNativeDriver: false,
        }),
        ]).start();
    }
    }, [isHighlighted]);


    const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(31,29,29,1)", "rgba(120,120,120,0.6)"], 
    });

    // رنگ‌های پیشنهادی مثل تلگرام
    const avatarColors = [
    "#ff9857ff", // نارنجی
    "#3A82F7", // آبی
    "#34C759", // سبز
    "#AF52DE", // بنفش
    "#5AC8FA", // فیروزه‌ای
    ];

    function getAvatarColor(userId: string | number) {
    // همیشه یه رنگ ثابت بر اساس userId انتخاب کن تا هر بار تغییر نکنه
    const index = Math.abs(userId.toString().charCodeAt(0)) % avatarColors.length;
    return avatarColors[index];
    }


  return (
    <View style={styles.commentItem}>
      {showAvatar ? (
        avatarUri ? (
          <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", { data: user })}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", { data: user })}>
  <View style={[
    styles.avatarPlaceholder,
    { backgroundColor: getAvatarColor(user?.id ?? firstLetter) }
  ]}>
    <Text style={{ color: "#fff", fontWeight: "bold" }}>
      {firstLetter}
    </Text>
  </View>
</TouchableOpacity>

        )
      ) : (
        <View style={{ width: 36, marginHorizontal: 8 }} />
      )}

      <Animated.View style={[styles.bubble, { backgroundColor: bgColor }]}>
        {showAvatar && name ? <Text style={styles.username}>{name}</Text> : null}

        {item.replyInfo && (
          <TouchableOpacity
            style={styles.replyBox}
            onPress={() => handleReplyClick(item.replyInfo.id)}
          >
            <Reply width={19} color={"#999"} style={{ position: "relative", bottom: 3 }} />
            <Text numberOfLines={1} style={styles.replyText}>
              {item.replyInfo?.content?.text?.text.slice(0, 30)}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.commentText}>
          {item?.content?.text?.text || "بدون متن"}
        </Text>

        {item.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={item.interactionInfo.reactions.reactions}
            chatId={item.chatId}
            messageId={item.id}
            onReact={(emoji) => console.log("🧡", emoji)}
            customStyles={{
              container: {
                justifyContent: "flex-start",
                marginTop: 8,
                paddingHorizontal: 0,
                marginBottom: 8,
              },
              reactionBox: { backgroundColor: "#333", paddingHorizontal: 0 },
              selectedBox: { backgroundColor: "#666" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 6,
    paddingHorizontal: 6,
  },
  bubble: {
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
    maxWidth: "80%",
  },
  commentText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "SFArabic-Regular",
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 18,
    marginHorizontal: 8,
    backgroundColor: "#444",
  },
  avatarPlaceholder: {
    width: 37,
    height: 37,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  username: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 4,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  replyBox: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    marginVertical: 6,
    flexDirection: "row",
    alignContent: "center",
    gap: 4,
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
});
