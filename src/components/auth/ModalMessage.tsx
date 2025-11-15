import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Modal from 'react-native-modal';

type Props = {
  visible: boolean;
  title?: string;
  errorMessage: string;
  onClose: () => void;
  navigateText?: string;
  onNavigate?: () => void;
};

export default function ModalMessage({
  visible,
  title = 'خطا',
  errorMessage,
  onClose,
  navigateText,
  onNavigate
}: Props) {
  const showNavigateOnly = onNavigate && navigateText;

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate();  // اجرا کردن ناوبری
    }
    onClose();        // سپس بستن مدال
  };

  return (
    <Modal
      isVisible={visible}
      backdropOpacity={0.5}
      animationIn="zoomInDown"
      animationOut="zoomOutUp"
      backdropTransitionInTiming={200}
      backdropTransitionOutTiming={200}
      animationInTiming={200}
      animationOutTiming={200}
      useNativeDriver
      hideModalContentWhileAnimating
      onBackdropPress={onClose}
      style={styles.modal}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{errorMessage}</Text>

        <View style={styles.buttons}>
          {showNavigateOnly ? (
            <Pressable onPress={handleNavigate} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>{navigateText}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onClose} style={styles.okButton}>
              <Text style={styles.okText}>باشه</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0
  },
  container: {
    backgroundColor: '#2B2B2B',
    padding: 15,
    borderRadius: 8,
    width: '84%',
  },
  title: {
    fontSize: 18,
    color: 'white',
    fontFamily: "SFArabic-Regular"
  },
  message: {
    fontSize: 15,
    color: '#CCCCCC',
    paddingVertical: 15,
    fontFamily: "SFArabic-Regular"
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  okButton: {
    borderRadius: 8,
  },
  okText: {
    color: '#389af5',
    fontFamily: "SFArabic-Regular",
    fontSize: 16
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  secondaryText: {
    color: '#389af5',
    fontFamily: "SFArabic-Regular",
  }
});
