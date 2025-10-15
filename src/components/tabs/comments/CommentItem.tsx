import { fromByteArray } from "base64-js";
import React, { useEffect, useRef, useState } from "react";
import { Animated, DeviceEventEmitter, Image, StyleSheet, Text, TouchableOpacity, useAnimatedValue, View } from "react-native";
import MessageReactions from "../home/MessageReaction";
import { Easing } from "react-native";
import { Reply } from "../../../assets/icons";
import { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Check, CheckCheck, Clock, Delete, Ticket, Trash } from "lucide-react-native";
import { GestureResponderEvent } from "react-native-modal";

export default function CommentItem({ item, index, comments, navigation, highlightedId, handleReplyClick, onReply, isUser, onDelete }: any) {
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

    const [showDelete, setShowDelete] = useState(false);
    const deleteAnim = useRef(new Animated.Value(0)).current; // 0:hidden, 1:visible

    // وقتی showDelete تغییر می‌کنه انیمیشن رو اجرا کن
    useEffect(() => {
      Animated.timing(deleteAnim, {
        toValue: showDelete ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, [showDelete]);


    useEffect(() => {
      const sub = DeviceEventEmitter.addListener("commentDeleteToggle", (payload: any) => {
        // payload === id یا null
        if (payload === item.id) {
          setShowDelete(true);
        } else {
          setShowDelete(false);
        }
      });

      return () => {
        sub.remove();
      };
    }, [item.id]);


    function handleLongPress() {
      if (!isUser) return; // فقط برای پیام‌های خود کاربر
      // به همه اطلاع بده که باید حالت حذف برای این آیتم نمایش داده بشه
      DeviceEventEmitter.emit("commentDeleteToggle", item.id);
    }

    // وقتی کاربر روی دکمه حذف زد
    const handleDeletePress = (e?: GestureResponderEvent) => {
      // call parent callback
      onDelete(item.id)
      // بعد از حذف، پنهان کن
      DeviceEventEmitter.emit("commentDeleteToggle", null);
    };

      const deleteStyle = {
      transform: [
        {
          scale: deleteAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1],
          }),
        },
      ],
      opacity: deleteAnim,
    };

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
    <View style={[styles.commentItem, {flexDirection: isUser ? "row-reverse": "row", alignContent: isUser ? "flex-end" : "flex-start",
      marginRight: isUser ? 8 : 0
    }]}
    >
      {showAvatar && !isUser ? (
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
      ) : !isUser ? (
        <View style={{ width: 36, marginHorizontal: 8 }} />
      ): null
      }


      <TouchableOpacity
       style={[styles.bubble, { backgroundColor: isUser ? showDelete ? "rgba(57, 57, 57, 0.57)": "rgba(81, 0, 103, 0.73)" : bgColor }]}
       onLongPress={handleLongPress}
       onPress={() => setShowDelete(false)}>
        {name ? <Text style={styles.username}>{name}</Text> : null}

        {item.replyInfo && (
          <TouchableOpacity
            style={styles.replyBox}
            onPress={() => handleReplyClick(item.replyInfo.id)}
          >
            <Reply width={19} color={"#999"} style={{ position: "relative", bottom: 3 }} />
            <Text numberOfLines={1} style={styles.replyText}>
              {item.replyInfo?.content?.text?.text.trim()}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.commentText}>
          {item?.content?.text?.text || "بدون متن"}
        </Text>

        <Text style={styles.timeText} numberOfLines={1}>
          {new Date(item.date * 1000).toLocaleTimeString("EN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </Text>

        {
          isUser == true ? 
          item.status == "sent" ? 
          <CheckCheck color={"#aaa"} width={12} style={{position: "absolute", bottom: 0, left:8}} /> 
          : <Clock color={"#6a6a6aff"} width={11} style={{position: "absolute", bottom: -1, left:4}} /> : 
          null
        }
        {item.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={item.interactionInfo.reactions.reactions}
            chatId={item.chatId}
            messageId={item.id}
            onReact={(emoji) => console.log("🧡", emoji)}
            customStyles={{
              container: {
                justifyContent: "flex-start",
                marginTop: 0,
                paddingHorizontal: 0,
                marginBottom: 8,
              },
              reactionBox: { backgroundColor: isUser ? "#612183c6": "#333", paddingHorizontal: 0 },
              selectedBox: { backgroundColor: "#666" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
            }}
          />
        )}
      </TouchableOpacity>
      {
        !isUser &&
          <TouchableOpacity 
            onPress={() => onReply(item)}
            style={{ justifyContent: "flex-end", paddingBottom: 6 ,height: "100%", paddingLeft: 3}}>
            <View style={{backgroundColor: "#f5f5f523", borderRadius: "50%", padding: 3}}>
              <Reply color={"#aaa"} width={20} height={20} />
            </View>
          </TouchableOpacity>
      }
      {isUser && (
        <Animated.View style={[{ justifyContent: "flex-end", paddingBottom: 6, height: "100%", paddingRight: 6 }, deleteStyle]}>
          {/** وقتی showDelete === true نمایش میدیم، در غیر این صورت فضای کم می‌کنه */}
          {showDelete ? (
            <TouchableOpacity onPress={handleDeletePress}>
              <View>
                <Text style={{ color: "#eaeaeaff", fontSize: 13, fontWeight: "700" }}>✕</Text>
              </View>
            </TouchableOpacity>
          ) : (
            // برای جلوگیری از تغییر چینش کامل، حجم کم رو نگه می‌داریم
            <View style={{ width: 28 }} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  commentItem: {
    alignItems: "flex-start",
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  bubble: {
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
    maxWidth: "80%",
    minWidth: 60
  },
  commentText: {
    color: "#ccc",
    fontSize: 13.8,
    lineHeight: 22,
    fontFamily: "SFArabic-Regular",
    marginBottom:8,
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 18,
    marginHorizontal: 4,
    backgroundColor: "#444",
  },
  avatarPlaceholder: {
    width: 37,
    height: 37,
    marginHorizontal: 4,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
  },
  username: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 3,
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
    gap: 1,
    overflow: "hidden"
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  timeText: {
    fontSize: 10,
    color: "#aaa",
    textAlign: "right",
    marginTop: 6,
    fontFamily: "SFArabic-Regular",
    position: "absolute",
    bottom: 4,
    right: 8,
  },
});
