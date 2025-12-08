// TwoStepScreen.tsx
import React, { useCallback, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, BackHandler } from 'react-native';
import { TelegramService } from '../../services/TelegramService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ModalMessage from '../../components/auth/ModalMessage';
import AppText from '../../components/ui/AppText';
import { useFocusEffect } from '@react-navigation/native';

export default function TwoStepScreen({ navigation, route }: any) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalTitle, setModalTitle] = useState('');

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        BackHandler.exitApp();
        return true;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

      return () => {
        backHandler.remove();
      };
    }, [])
  );

  const submitPassword = async () => {
    if (loading) return;
    if(!password.trim()) return;
    setLoading(true);
    try {
      const res:any = await TelegramService.verifyPassword(password);
      // Expected: res.success === true on success
      if (res?.success) {
        await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "pick-team" }));
        navigation.replace("PickTeams");
        return;
      }

      // handle common error shapes
      const errMsg:any = res?.error?.message ?? res?.message ?? '';
      if (errMsg) {
        setModalTitle('متاسفم');
        setModalMessage(typeof errMsg === 'string' ? errMsg : 'رمز وارد شده اشتباه است');
        setModalVisible(true);
        return;
      }

      // generic fallback
      setModalTitle('خطا');
      setModalMessage('رمز اشتباه است');
      setModalVisible(true);
    } catch (e: any) {
      console.warn('TwoStep error', e);
      const msg = e?.message ?? 'خطا در ورود رمز دوم';
      setModalTitle('خطا');
      setModalMessage(msg);
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const onModalNavigate = () => {
    // navigate back to login so user can resend code / restart flow
    setModalVisible(false);
    navigation.navigate('Login');
  };

  return (
    <View style={styles.container}>
      <AppText style={styles.title}>رمز دوم حساب تلگرام</AppText>
      <TextInput
        placeholder="رمز دوم را وارد کنید"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        placeholderTextColor="#999"
        cursorColor={"#555"}
      />

      <TouchableOpacity onPress={submitPassword} style={styles.btn} disabled={loading}>
        {loading ? <ActivityIndicator color="#000000ff" /> : <Text style={styles.btnText}>ثبت</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
        <AppText style={{color: "#00aeffff", fontSize: 12.5}}>بازگشت و ارسال دوباره شماره</AppText>
      </TouchableOpacity>

      <ModalMessage
        visible={modalVisible}
        errorMessage={modalMessage}
        onClose={() => setModalVisible(false)}
        navigateText={'تلاش دوباره'}
        title={modalTitle || 'خطا'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#000', justifyContent:'center', padding:20 },
  title: { color:'#fff', fontSize:18, textAlign:'center', marginBottom:20, fontFamily: 'SFArabic-Regular' },
  input: { backgroundColor:'#222', color:'#fff', padding:12, borderRadius:8, marginBottom:12, fontFamily: 'SFArabic-Regular', textAlign:"right" },
  btn: { backgroundColor:'#e8e8e8', padding:12, borderRadius:8, alignItems:'center' },
  btnText: { color:'#000', fontFamily: 'SFArabic-Regular' },
  link: { marginTop:14, alignItems:'center',fontFamily: 'SFArabic-Regular' },
});
