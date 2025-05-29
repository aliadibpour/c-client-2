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
    title: "اتمسفر هواداران فوتبال",
    text: "اکوسیستم هواداریه تیم های پر طرفدار ایران و اروپا همراه با پوشش نتایج , اخبار و حاشیه ها",
    image: require('../../assets/images/i.jpg'),
  },
  {
    key: 'slide2',
    title: 'ضد سانسور / زنده',
    text: "محتوای برنامه بدون فیلتر توسط جامعه ی حاضر بصورت زنده و در لحظه ایجاد میشود",
    image: require('../../assets/images/p.jpg'),
  },
  {
    key: 'slide3',
    title: 'نتایج خاص',
    text: 'نتایج به‌یادماندنی و جذاب تاریخ فوتبال',
    image: require('../../assets/images/i.jpg'),
  },
    {
    key: 'slide4',
    title: "اتمسفر هواداران فوتبال",
    text: "اکوسیستم هواداریه تیم های پر طرفدار ایران و اروپا همراه با پوشش نتایج , اخبار و حاشیه ها",
    image: require('../../assets/images/p.jpg'),
  },
  {
    key: 'slide5',
    title: 'ضد سانسور / زنده',
    text: "محتوای برنامه بدون فیلتر توسط جامعه ی حاضر بصورت زنده و در لحظه ایجاد میشود",
    image: require('../../assets/images/i.jpg'),
  },
  {
    key: 'slide6',
    title: 'نتایج خاص',
    text: 'نتایج به‌یادماندنی و جذاب تاریخ فوتبال',
    image: require('../../assets/images/i.jpg'),
  },
];

export default function IntroScreen({ navigation }:any) {
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
      navigation.navigate("Login")
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
        <StepProgressBar currentStep={currentIndex+1} totalSteps={6} />
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

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.text}>{slide.text}</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={handleNext} style={styles.button} disabled={isAnimating}>
          <Text style={styles.buttonText}>
            {currentIndex === slides.length - 1 ? 'شروع' : 'بعدی'}
          </Text>
        </TouchableOpacity>
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
    paddingHorizontal: 20,
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
    height:100,
    zIndex:2,
  },
  titleContainer: {
    marginTop: -50,
    backgroundColor: 'transparent',
    padding: 10,
    alignItems: 'center',
    fontFamily: "IranianSans"
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: 'white',
    fontFamily: 'vazir',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  text: {
    fontSize: 17,
    textAlign: 'center',
    color: 'rgba(250, 250, 250, 0.8)',
    fontFamily: 'vazir',
    marginTop: 15,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  button: {
    backgroundColor: '#e8e8e8',
    paddingVertical: 10,
    borderRadius: 10,
    width: '85%',
    alignSelf: 'center',
    marginBottom: 15
  },
  buttonText: {
    color: 'black',
    fontSize: 19,
    fontWeight: "bold",
    textAlign: 'center',
    fontFamily: 'IranianSans',
  },
  buttonContainer: {
    width: '100%',
    marginVertical: 7,
  },
});
