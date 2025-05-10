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

const { width } = Dimensions.get('window');

const slides = [
  {
    key: 'slide1',
    title: 'ستاره‌های جوان',
    text: 'مجموعه‌ای از بازیکنان خاص ایران و اروپا در دوران جوانی',
    image: require('../../assets/images/qq.jpg'),
  },
  {
    key: 'slide2',
    title: 'لحظه‌های تاریخی',
    text: 'تصاویر تاریخی و بامزه از فوتبال دنیا',
    image: require('../../assets/images/qq.jpg'),
  },
  {
    key: 'slide3',
    title: 'نتایج خاص',
    text: 'نتایج به‌یادماندنی و جذاب تاریخ فوتبال',
    image: require('../../assets/images/qq.jpg'),
  },
];

export default function IntroScreen({ navigation }:any) {
  const [currentIndex, setCurrentIndex] = useState(0);
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
        <View style={styles.imageContainer}>
          <Image source={slide.image} style={styles.image} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.77)', 'black']}
            style={styles.gradientOverlay}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.text}>{slide.text}</Text>
        </View>
      </View>

      <View style={styles.dotsContainer}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, currentIndex === index && styles.activeDot]}
          />
        ))}
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
    position: 'absolute',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 115,
  },
  titleContainer: {
    marginTop: -40,
    backgroundColor: 'transparent',
    padding: 10,
    alignItems: 'center',
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
    marginTop: 25,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  button: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 5,
    width: '95%',
    alignSelf: 'center',
  },
  buttonText: {
    color: 'black',
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'vazir',
  },
  buttonContainer: {
    width: '100%',
    marginVertical: 7,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: '#ccc',
    margin: 4,
  },
  activeDot: {
    backgroundColor: 'white',
  },
});
