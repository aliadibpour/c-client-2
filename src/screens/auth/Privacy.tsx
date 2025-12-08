import React from 'react';
import { SafeAreaView, StatusBar, View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppText from '../../components/ui/AppText';
import { ArrowLeft } from 'lucide-react-native';

export default function PrivacyPolicyScreen(): React.ReactElement {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backButton}>
          <ArrowLeft width={22} color={"#00aeffff"} />
        </TouchableOpacity>
        <AppText style={styles.title}>قوانین و حریم خصوصی</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppText style={styles.h1}>مقدمه</AppText>
        <AppText style={styles.p}>
          ما به حریم خصوصی شما احترام می‌گذاریم. در این صفحه توضیح داده می‌شود که چه اطلاعاتی
          از شما جمع‌آوری می‌شود، چرا به آن نیاز داریم و چگونه از آن محافظت می‌کنیم.
        </AppText>

        <AppText style={styles.h1}>۱. اطلاعات جمع‌آوری‌شده</AppText>
        <AppText style={styles.p}>
          اطلاعاتی که این اپ دریافت می‌کند فقط شامل موارد زیر است:{'\n'}
          • شماره تلفن برای ورود و احراز هویت.{'\n'}
          • اطلاعات فنی و عملکردی (مثل مدل دستگاه، نسخهٔ سیستم‌عامل، لاگ‌های خطا) برای بهبود تجربهٔ کاربری.
        </AppText>

        <AppText style={styles.h1}>۲. هدف از جمع‌آوری اطلاعات</AppText>
        <AppText style={styles.p}>
          ما از اطلاعات جمع‌آوری‌شده صرفاً برای موارد زیر استفاده می‌کنیم:{'\n'}
          • ساخت و مدیریت حساب کاربری و ورود امن با پیامک تأیید.{'\n'}
          • جلوگیری از سوءاستفاده و حساب‌های تقلبی.{'\n'}
          • بهبود عملکرد و رفع اشکال اپ.
        </AppText>

        <AppText style={styles.h1}>۳. اشتراک‌گذاری اطلاعات</AppText>
        <AppText style={styles.p}>
          اطلاعات شما تحت هیچ شرایطی فروخته نخواهد شد. تنها در این موارد ممکن است اطلاعات با سایر طرف‌ها به اشتراک گذاشته شود:{'\n'}
          • ارائه‌دهندگان خدمات ارسال پیامک برای ارسال کد تأیید.{'\n'}
          • در صورت درخواست قانونی از سوی مراجع ذی‌صلاح.
        </AppText>

        <AppText style={styles.h1}>۴. امنیت اطلاعات</AppText>
        <AppText style={styles.p}>
          ما از استانداردهای متداول امنیتی برای حفاظت از داده‌ها استفاده می‌کنیم؛ شامل رمزنگاری در انتقال، کنترل دسترسی محدود و نگهداری امن داده‌ها.
        </AppText>

        <AppText style={styles.h1}>۵. حق‌های کاربر</AppText>
        <AppText style={styles.p}>
          شما می‌توانید در هر زمان درخواست حذف یا اصلاح اطلاعات خود را ثبت کنید. برای این کار به بخش تنظیمات اپ مراجعه کنید.
        </AppText>

        <AppText style={styles.h1}>۶. تغییرات در سیاست</AppText>
        <AppText style={styles.p}>
          در صورت اعمال تغییر در این سیاست، نسخهٔ جدید از طریق اپ یا وب‌سایت به اطلاع کاربران خواهد رسید.
        </AppText>

        {/* ---------------------- COPYRIGHT SECTION ---------------------- */}
        <AppText style={styles.h1}>۷. حقوق مالکیت محتوا (مالکیت فکری)</AppText>
        <AppText style={styles.p}>
          تمامی محتوای ارائه‌شده در «بخش بازی‌ها» از جمله لوگو و متون و آیکون ها به‌طور کامل توسط تیم توسعه‌دهندهٔ برنامهٔ
          Corner تولید شده و مالکیت آن متعلق به توسعه‌دهنده است.{'\n'}{'\n'}
          محتوای نمایش‌داده‌شده در صفحهٔ خانه (Home) شامل اطلاعات عمومی و غیرانحصاری است و
          شامل موارد دارای کپی‌رایت خاص نمی‌شود.{'\n'}{'\n'}
          هرگونه بازنشر یا استفاده از محتوای بخش بازی‌ها بدون کسب اجازه مکتوب از تیم Corner
          ممنوع است.
        </AppText>
        {/* --------------------------------------------------------------- */}

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
    justifyContent: 'center',
    borderBottomColor: '#000',
    borderBottomWidth: 1,
  },
  backButton: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  backAppText: {
    color: '#00aeffff',
    fontFamily: "SFArabic-Regular",
    fontSize: 15,
  },
  title: {
    color: '#fff',
    fontSize: 15.4,
    fontFamily: "SFArabic-Heavy",
  },
  scrollContent: {
    padding: 15,
    paddingVertical: 8,
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
