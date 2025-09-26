import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Animated,
  BackHandler,
} from 'react-native';
import { Emoji, EmojiIcon, SendIcon } from '../../../assets/icons';

// --- Tiny emoji set (extend as needed). You can swap with a full picker later.
const EMOJI = (
  '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 😘 😜 🤪 🤨 🤔 🙄 😏 😴 😑 😐 😶 😬 ' +
  '😭 😤 😡 🤯 🤗 🤝 👍 👎 👋 🙌 👏 🙏 💪 🔥 ✨ 💯 🎉 ❤️ 💙 💚 💛 💜 🧡 🤍 🤎 🖤'
)
  .split(' ')
  .filter(Boolean);

export type ComposerProps = {
  onSend: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  value?: string;
  onChangeText?: (t: string) => void;
  replyTo?: any; // ← استیت ریپلای از پدر
  clearReply?: () => void; // ← تابع برای پاک کردن ریپلای
};

export default function Composer({
  onSend,
  placeholder = 'نظر خود را بنویسید…',
  maxLength = 4000,
  disabled = false,
  value,
  onChangeText,
}: ComposerProps) {
  const [internal, setInternal] = useState('');
  const text = value ?? internal;
  const setText = onChangeText ?? setInternal;

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);

  const emojiHeight = 260; // panel height
  const animatedPanel = useRef(new Animated.Value(0)).current;

  // Close emoji when keyboard shows
  useEffect(() => {
    const sub1 = Keyboard.addListener('keyboardWillShow', () => setEmojiOpen(false));
    const sub2 = Keyboard.addListener('keyboardDidShow', () => setEmojiOpen(false));

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  // BackHandler: close emoji panel instead of exiting
  useEffect(() => {
    const onBackPress = () => {
      if (emojiOpen) {
        setEmojiOpen(false);
        return true; // prevent default back action
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [emojiOpen]);

  useEffect(() => {
    Animated.timing(animatedPanel, {
      toValue: emojiOpen ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [emojiOpen]);

  const panelStyle = useMemo(() => {
    const height = animatedPanel.interpolate({
      inputRange: [0, 1],
      outputRange: [0, emojiHeight],
    });
    return { height } as const;
  }, [animatedPanel]);

  const canSend = text.trim().length > 0 && !disabled;

  const handleToggleEmoji = useCallback(() => {
    if (emojiOpen) {
      setEmojiOpen(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  }, [emojiOpen]);

  const doSend = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }, [text, onSend]);

  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      {/* Row: emoji, text, send */}
      <View style={styles.row}>
        <TouchableOpacity
          onPress={handleToggleEmoji}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={emojiOpen ? 'بستن ایموجی' : 'باز کردن ایموجی'}
          style={styles.iconBtn}
        >
          {/* <Text style={styles.icon}>{emojiOpen ? '⌨️' : '😊'}</Text> */}
          <Emoji color={"#999"} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.input, { height:40 }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          maxLength={maxLength}
          multiline
          onContentSizeChange={e => setInputHeight(e.nativeEvent.contentSize.height)}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={doSend}
          blurOnSubmit={false}
          scrollEnabled={true}
        />

        <TouchableOpacity
          onPress={doSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="ارسال"
          style={styles.sendBtnWrap}
        >
            <SendIcon color={text.trim() ? "#00aaffff" : "#999"}/>
        </TouchableOpacity>
      </View>

      {/* Emoji Panel */}
      <Animated.View style={[styles.emojiPanel, panelStyle]}>
        <View style={styles.emojiInner}>
          {EMOJI.map((e, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setText(text + e)}
              style={styles.emojiCell}
              accessibilityRole="button"
              accessibilityLabel={`ایموجی ${e}`}
            >
              <Text style={styles.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingRight: 14,
    paddingVertical: 3.5,
  },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  icon: { fontSize: 22 },
  input: {
    flex: 1,
    fontSize: 14,
    textAlignVertical: 'center',
    color: '#fff',
    textAlign: "right",
    fontFamily: "SFArabic-Regular",
  },
  sendBtnWrap: {
  },
  emojiPanel: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#111',
    backgroundColor: '#222',
  },
  emojiInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
  },
  emojiCell: {
    width: '11.11%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  emoji: { fontSize: 24 },
});
