import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StepProgressBar from '../../components/auth/StepProgressBar';

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
    text: 'کرنر یک کلاینت اختصاصی تلگرام در زمینه در زمینه فوتبال برای جوامع هواداری تهیه شده است ',
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

  const handleNext = async () => {
    if (isAnimating) return;

    setIsAnimating(true);

    if (currentIndex === slides.length - 1) {
      await AsyncStorage.setItem(
        'auth-status',
        JSON.stringify({ register: false, route: 'login' })
      );
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
        <View style={styles.imageContainer}>
          <LinearGradient
            colors={['black', 'rgba(0,0,0,0.01)', 'transparent']}
            style={styles.gradientOverlayTop}
          />
          <Image source={slide.image} style={styles.image} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.77)', 'black']}
            style={styles.gradientOverlayBottom}
          />
        </View>

        {/* نمایش لوگو فقط در اسلاید اول */}
        {slide.key === 'slide1' && (
          <Image
            source={require('../../assets/images/cornerLogo.jpg')}
            style={styles.logo}
            resizeMode="contain"
          />
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.text}>{slide.text}</Text>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleNext} style={styles.button} disabled={isAnimating}>
            <Text style={styles.buttonText}>
              {currentIndex === slides.length - 1 ? 'شروع' : 'بعدی'}
            </Text>
          </TouchableOpacity>
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
    paddingHorizontal: 10,
    backgroundColor: 'black',
  },
  imageContainer: {
    width: width,
    height: 547,
    justifyContent: 'flex-end',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradientOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 155,
  },
  gradientOverlayTop: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: 100,
    zIndex: 2,
  },
  titleContainer: {
    backgroundColor: 'transparent',
    padding: 10,
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
    lineHeight: 27,
  },
  button: {
    backgroundColor: '#e8e8e8',
    paddingVertical: 10,
    borderRadius: 10,
    width: '85%',
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
    marginVertical: 7,
  },
  logo: {
    width: 66,
    height: 66,
    borderRadius: 80,
    position: 'absolute',
    bottom: 190,
  },
});
