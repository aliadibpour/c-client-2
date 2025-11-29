import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StepProgressBar from '../../components/auth/StepProgressBar';
import AppText from '../../components/ui/AppText';
import { moderateScale, scale } from 'react-native-fast-size-matters';

// NOTE: removed duplicate `const { width } = Dimensions.get('window');` to avoid conflicts
const { width } = Dimensions.get('window');

const slides = [
  {
    key: 'slide1',
    title: "صدای هوادار",
    text: "اکوسیستم هواداریه تیم های پر طرفدار ایران و اروپا همراه با پوشش نتایج , اخبار و حاشیه ها",
    image: require('../../assets/images/i.jpg'),
  },
  {
    key: 'slide2',
    title: 'ضد سانسور و زنده',
    text: "محتوای برنامه بدون فیلتر توسط کانال های هواداری بدون سانسور و در لحظه منتشر میشه",
    image: require('../../assets/images/p.jpg'),
  },
  {
    key: 'slide3',
    title: 'کلاینت تلگرام',
    text: 'کرنر یک کلاینت اختصاصی تلگرام در زمینه فوتبال برای جوامع هواداری تهیه شده است ',
    image: require('../../assets/images/3.png'),
  },
  {
    key: 'slide4',
    title: "فیلترشکن",
    text: "برای ارتباط مستقیم با برنامه نیازمند فیلترشکن هستید.(هرگونه فیلتر یا پروکسی)",
    image: require('../../assets/images/4.png'),
  },
  {
    key: 'slide5',
    title: 'ورود به حساب',
    text: "کد ورود به کرنر به تلگرام حسابی می رود که شماره آن را در کرنر ارسال میکنید",
    image: require('../../assets/images/5.jpg'),
  },
];

export default function IntroScreen({ navigation }: any) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const blackOverlay = useRef(new Animated.Value(0)).current;

  // <-- تغییر: ارتفاع بر اساس عرض صفحه محاسبه می‌شود (به جای مقدار ثابت 547)
  const { width, height } = useWindowDimensions();
  // به عنوان مثال 50% از ارتفاع صفحه:
  const IMAGE_CONTAINER_HEIGHT = Math.round(height * scale(0.67));

  // -------------------------
  // Minor addition: design-based scale (same idea as your AppText)
  // so logo size/position scale consistently across screens.
  const BASE_WIDTH = 375;
  const BASE_HEIGHT = 812;
  const screenScale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  // design values (adjust DESIGN_LOGO_SIZE if your design uses different px)
  const DESIGN_LOGO_SIZE = 64; // logo size in your design (px)
  const LOGO_BOTTOM_RATIO = 0.31; // proportion of IMAGE_CONTAINER_HEIGHT

  const logoSize = Math.round(DESIGN_LOGO_SIZE * screenScale);
  const logoBottom = Math.round(IMAGE_CONTAINER_HEIGHT * LOGO_BOTTOM_RATIO);
  // -------------------------

  const handleNext = async () => {
    if (isAnimating) return;

    setIsAnimating(true);

    if (currentIndex === slides.length - 1) {
      await AsyncStorage.setItem(
        'auth-status',
        JSON.stringify({ register: false, route: 'login' })
      );
      // برگشت isAnimating تا دکمه قفل نماند
      setIsAnimating(false);
      navigation.navigate("Login");
    } else {
      Animated.timing(blackOverlay, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(prev => prev + 1);
        Animated.timing(blackOverlay, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setIsAnimating(false);
        });
      });
    }
  };

  const slide = slides[currentIndex];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.slide}>
        <StepProgressBar currentStep={currentIndex + 1} totalSteps={5} />

        {/* <-- تغییر: ارتفاع کانتینر به صورت داینامیک و نه ثابت */}
        <View style={[styles.imageContainer, { height: IMAGE_CONTAINER_HEIGHT }]}>
          <LinearGradient
            colors={['black', 'rgba(0,0,0,0.01)', 'transparent']}
            style={styles.gradientOverlayTop}
          />
          <Image source={slide.image} style={styles.image} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.77)', 'black']}
            style={[styles.gradientOverlayBottom, { height: IMAGE_CONTAINER_HEIGHT * scale(0.24) }]}
          />
        </View>

        {/* نمایش لوگو فقط در اسلاید اول - موقعیت و اندازه لوگو با نسبت به عرض/ارتفاع محاسبه می‌شود */}
        {slide.key === 'slide1' && (
          <Image
            source={require('../../assets/images/cornerLogo.jpg')}
            style={{
              ...styles.logo,
              bottom: logoBottom,
              width: logoSize,
              height: logoSize,
              borderRadius: Math.round(logoSize / 2), // keep it circular and derived from final size
            }}
            resizeMode="contain"
          />
        )}

       <View style={styles.box}>
        <View style={styles.titleContainer}>
          <AppText style={styles.title}>{slide.title}</AppText>
          <AppText style={styles.text}>{slide.text}</AppText>
       </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleNext} style={styles.button} disabled={isAnimating}>
            <AppText style={styles.buttonText}>
              {currentIndex === slides.length - 1 ? 'شروع' : 'بعدی'}
            </AppText>
          </TouchableOpacity>
        </View>
       </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'black', opacity: blackOverlay }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    backgroundColor: 'black',
  },
  imageContainer: {
    width: width,
    // height حذف شد (دیگر ثابت نیست)
    justifyContent: 'flex-end',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradientOverlayBottom: {
    position: 'absolute',
    bottom: -2,
    width: '100%',
  },
  gradientOverlayTop: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: scale(100),
    zIndex: 2,
  },
  box: {
    position: "absolute",
    bottom: moderateScale(12),
    gap: moderateScale(3)
  },
  titleContainer: {
    backgroundColor: 'transparent',
    padding: moderateScale(10),
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    textAlign: 'center',
    color: 'white',
    fontFamily: 'SFArabic-Heavy',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  text: {
    fontSize: 14.8,
    textAlign: 'center',
    color: 'rgba(250, 250, 250, 0.8)',
    fontFamily: 'SFArabic-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    lineHeight: moderateScale(25.2),
  },
  button: {
    backgroundColor: '#e8e8e8',
    paddingVertical: moderateScale(9.7),
    borderRadius: moderateScale(10),
    width: '88%',
    alignSelf: 'center',
  },
  buttonText: {
    color: 'black',
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'SFArabic-Regular',
  },
  buttonContainer: {
    width: '100%',
  },
  logo: {
    position: 'absolute',
    // borderRadius/width/height are computed inline so we keep stylesheet minimal
  },
});
