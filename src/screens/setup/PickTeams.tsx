import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, BackHandler, ToastAndroid
} from 'react-native';
import AppText from '../../components/ui/AppText';

export const teamImages: { [key: string]: any } = {
  'پرسپولیس': require('../../assets/teams/perspolis.png'),
  'استقلال': require('../../assets/teams/ss.png'),
  'سپاهان': require('../../assets/teams/sepahan.png'),
  'تراکتور': require('../../assets/teams/Tractor.png'),

  'بارسلونا': require('../../assets/teams/barcelona.webp'),
  'رئال مادرید': require('../../assets/teams/realmadrid.png'),

  'آرسنال': require('../../assets/teams/arsenal.webp'),
  'منچستر یونایتد': require('../../assets/teams/man.webp'),
  'لیورپول': require('../../assets/teams/liverpool.webp'),
  'چلسی': require('../../assets/teams/Chelsea.png'),

  'بایرن': require('../../assets/teams/munich.png'),
  'اینتر': require('../../assets/teams/inter.png'),
  'میلان': require('../../assets/teams/milan.png'),
};


const teamsData = [
  { name: 'پرسپولیس', league: 'Iran', image: require('../../assets/teams/perspolis.png') },
  { name: 'استقلال', league: 'Iran', image: require('../../assets/teams/ss.png') },
  { name: 'سپاهان', league: 'Iran', image: require('../../assets/teams/sepahan.png') },
  { name: 'تراکتور', league: 'Iran', image: require('../../assets/teams/Tractor.png') },

  { name: 'بارسلونا', league: 'LaLiga', image: require('../../assets/teams/barcelona.webp') },
  { name: 'رئال مادرید', league: 'LaLiga', image: require('../../assets/teams/realmadrid.png') },

  { name: 'آرسنال', league: 'England', image: require('../../assets/teams/arsenal.webp') },
  { name: 'منچستر یونایتد', league: 'England', image: require('../../assets/teams/man.webp') },
  { name: 'لیورپول', league: 'England', image: require('../../assets/teams/liverpool.webp') },
  { name: 'چلسی', league: 'England', image: require('../../assets/teams/Chelsea.png') },

  { name: 'بایرن', league: 'Bundesliga', image: require('../../assets/teams/munich.png') },

  { name: 'اینتر', league: 'Italy', image: require('../../assets/teams/inter.png') },
  { name: 'میلان', league: 'Italy', image: require('../../assets/teams/milan.png') },
];

export default function PickTeamsScreen({ navigation }: any) {
  const backPressCount = useRef(0);
  const [favorites, setFavorites] = useState<typeof teamsData>([]);

  useEffect(() => {
    const backAction = () => {
      // فقط یک بار فشار -> خارج شدن از اپ
      BackHandler.exitApp();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => {
      // حذف کامل لیسنر وقتی از صفحه خارج شد
      backHandler.remove();
    };
  }, []);

  const isLeaguePicked = (league: string) =>
    favorites.some((team) => team.league === league);

  const selectTeam = (team: typeof teamsData[number]) => {
    if (favorites.length >= 3) return;
    if (isLeaguePicked(team.league)) return;

    setFavorites([...favorites, team]);
  };

  const removeTeam = (name: string) => {
    setFavorites(favorites.filter((team) => team.name !== name));
  };

  const handleStart = async() => {
    if (favorites.length === 0) {
      ToastAndroid.show("حداقل یک تیم انتخاب کن!", ToastAndroid.SHORT);
      return;
    }

    if (favorites.length === 1) {
      await AsyncStorage.setItem("auth-status", JSON.stringify({ status: 'home' }))
      await AsyncStorage.setItem("teams", JSON.stringify({team1: favorites[0].name, team2:null, team3: null}))
      await navigation.navigate('Tabs');
    } else {
      navigation.navigate('Priority', { favorites });
    }
  };

  return (
    <View style={styles.container}>
      <AppText style={styles.title}>طرفدار کدام تیم ها هستید؟ (مهم)</AppText>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.name}
        horizontal
        contentContainerStyle={styles.favoritesContainer}
        renderItem={({ item }) => (
          <View style={styles.favoriteItem}>
            <Image source={item.image} style={styles.favoriteLogo} resizeMode='contain'/>
            <AppText style={styles.favoriteText}>{item.name}</AppText>
            <TouchableOpacity onPress={() => removeTeam(item.name)} style={styles.removeBtn}>
              <AppText style={styles.removeBtnText}>✕</AppText>
            </TouchableOpacity>
          </View>
        )}
      />

      <FlatList
        data={teamsData}
        keyExtractor={(item) => item.name}
        numColumns={3}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const selected = favorites.some((t) => t.name === item.name);
          const leaguePicked = isLeaguePicked(item.league);
          const disabled = (leaguePicked && !selected) || favorites.length >= 3;

          return (
            <TouchableOpacity
              disabled={disabled}
              onPress={() => selectTeam(item)}
              style={[
                styles.teamCard,
                selected && styles.selected,
                disabled && styles.disabled
              ]}
            >
              <View style={styles.blurOverlay} />
              <Image source={item.image} style={styles.teamLogo} resizeMode='contain' />
              <AppText style={styles.teamName}>{item.name}</AppText>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.Button} onPress={handleStart}>
        <AppText style={styles.ButtonText}>تمام</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 15 },
  title: { color: '#fff', fontSize: 17, marginTop: 5, textAlign: 'center', fontFamily: "SFArabic-Regular" },

  favoritesContainer: { paddingVertical: 10 },
  favoriteItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  favoriteLogo: { width: 20, height: 20 },
  favoriteText: { color: '#ddd', fontSize: 14, fontFamily: "SFArabic-Regular" },
  removeBtn: { marginLeft: 8 },
  removeBtnText: { color: '#fff', fontSize: 18 },

  teamCard: {
    width: '30%', // مقدار ثابت برای 3 تا آیتم در هر ردیف
    height: 95,
    margin: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#0c0c0cff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  teamLogo: { width: 39, height: 39, marginBottom: 8},
  teamName: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: "SFArabic-Regular",
  },
  selected: {
    borderColor: '#555',
    borderWidth: 1.4,
  },
  disabled: {
    opacity: 0.3,
  },
  Button: {
    marginTop: 25,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ButtonText: {
    color: '#000',
    fontSize: 16.5,
    fontFamily: "SFArabic-Regular",
  },
});
