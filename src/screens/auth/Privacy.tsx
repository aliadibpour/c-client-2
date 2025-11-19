import React from 'react';
import { SafeAreaView, StatusBar, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function PrivacyPolicyScreen(): React.ReactElement {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backButton}>
          <Text style={styles.backText}>بازگشت</Text>
        </TouchableOpacity>
        <Text style={styles.title}>حریم خصوصی</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.h1}>مقدمه</Text>
        <Text style={styles.p}>
          ما به حریم خصوصی شما احترام می‌گذاریم. در این صفحه توضیح داده می‌شود که چه اطلاعاتی
          از شما جمع‌آوری می‌شود، چرا به آن نیاز داریم و چگونه از آن محافظت می‌کنیم.
        </Text>

        <Text style={styles.h1}>۱. اطلاعات جمع‌آوری‌شده</Text>
        <Text style={styles.p}>
          اطلاعاتی که این اپ دریافت می‌کند فقط شامل موارد زیر است:{'\n'}
          • شماره تلفن برای ورود و احراز هویت.{'\n'}
          • اطلاعات فنی و عملکردی (مثل مدل دستگاه، نسخهٔ سیستم‌عامل، لاگ‌های خطا) برای بهبود
          تجربهٔ کاربری.
        </Text>

        <Text style={styles.h1}>۲. هدف از جمع‌آوری اطلاعات</Text>
        <Text style={styles.p}>
          ما از اطلاعات جمع‌آوری‌شده صرفاً برای موارد زیر استفاده می‌کنیم:{'\n'}
          • ساخت و مدیریت حساب کاربری و ورود امن با پیامک تایید.{'\n'}
          • جلوگیری از سوء‎استفاده و حساب‌های تقلبی.{'\n'}
          • بهبود عملکرد و رفع اشکال اپ.
        </Text>

        <Text style={styles.h1}>۳. اشتراک‌گذاری اطلاعات</Text>
        <Text style={styles.p}>
          اطلاعات شما تحت هیچ شرایطی فروخته نخواهد شد. تنها در این موارد ممکن است اطلاعات
          با سایر طرف‌ها به اشتراک گذاشته شود:{'\n'}
          • ارائه‌دهندگان خدمات ارسال پیامک (SMS provider) برای ارسال کد تایید.{'\n'}
          • در صورت درخواست قانونی از سوی مراجع ذی‌صلاح.
        </Text>

        <Text style={styles.h1}>۴. امنیت اطلاعات</Text>
        <Text style={styles.p}>
          ما از استانداردهای متداول امنیتی برای حفاظت از داده‌ها استفاده می‌کنیم: رمزنگاری در
          انتقال، کنترل دسترسی محدود و نگهداری امن کلیدها. دسترسی به اطلاعات تنها برای کسانی
          ممکن است که برای نگهداری یا پشتیبانی سیستم به آن نیاز دارند.
        </Text>

        <Text style={styles.h1}>۵. حق‌های کاربر</Text>
        <Text style={styles.p}>
          شما می‌توانید در هر زمان درخواست حذف یا اصلاح اطلاعات خود را ثبت کنید. برای این
          کار به بخش تنظیمات اپ مراجعه کنید یا از طریق اطلاعات تماس زیر با ما در ارتباط باشید.
        </Text>

        <Text style={styles.h1}>۶. تغییرات در سیاست</Text>
        <Text style={styles.p}>
          در صورت اعمال تغییر در این سیاست، نسخهٔ جدید از طریق اپ یا وب‌سایت به اطلاع کاربران
          خواهد رسید. استفادهٔ ادامه‌دار شما از اپ به معنی پذیرش تغییرات است.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
    header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',   // عنوان دقیقاً وسط
    borderBottomColor: '#000',
    borderBottomWidth: 1,
    },
    backButton: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
    },

    backText: {
    color: '#00aeffff',
    fontFamily: "SFArabic-Regular",
    fontSize: 15,
    },

  title: {
    color: '#fff',
    fontSize: 18,
    fontFamily: "SFArabic-Regular",
    fontWeight: '600',
  },
  scrollContent: {
    padding: 15,
    paddingVertical: 8
  },
  h1: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 8,
    fontFamily: "SFArabic-Heavy",
  },
  p: {
    color: '#cacacaff',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'justify',
    fontFamily: "SFArabic-Regular",
  },
});