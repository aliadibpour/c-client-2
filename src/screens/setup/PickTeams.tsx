import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, BackHandler, ToastAndroid, Alert
} from 'react-native';

const teamsData = [
  { name: 'Persepolis', league: 'Iran', image: 'https://media.api-sports.io/football/teams/42.png' },
  { name: 'Esteghlal', league: 'Iran', image: 'https://media.api-sports.io/football/teams/42.png' },
  { name: 'Sepahan', league: 'Iran', image: 'https://media.api-sports.io/football/teams/42.png' },
  { name: 'Tractor', league: 'Iran', image: 'https://media.api-sports.io/football/teams/42.png' },

  { name: 'Barcelona', league: 'LaLiga', image: 'https://media.api-sports.io/football/teams/42.png' },
  { name: 'Real Madrid', league: 'LaLiga', image: 'https://media.api-sports.io/football/teams/42.png' },

  { name: 'Arsenal', league: 'England', image: 'https://media.api-sports.io/football/teams/42.png' },
  { name: 'Manchester City', league: 'England', image: 'https://i.imgur.com/UHTmGeD.png' },
  { name: 'Manchester United', league: 'England', image: 'https://i.imgur.com/AJQd7uC.png' },
  { name: 'Liverpool', league: 'England', image: 'https://i.imgur.com/zKjbhP7.png' },
  { name: 'Chelsea', league: 'England', image: 'https://i.imgur.com/nBlGkXb.png' },

  { name: 'PSG', league: 'France', image: 'https://i.imgur.com/VY94tTw.png' },

  { name: 'Bayern', league: 'Bundesliga', image: 'https://i.imgur.com/G2j8clH.png' },
  { name: 'Dortmund', league: 'Bundesliga', image: 'https://i.imgur.com/0OyE58G.png' },

  { name: 'Inter', league: 'Italy', image: 'https://i.imgur.com/zzcCIKk.png' },
  { name: 'Milan', league: 'Italy', image: 'https://i.imgur.com/IklATeF.png' },
  { name: 'Juventus', league: 'Italy', image: 'https://i.imgur.com/YrKdLkY.png' },
];

export default function PickTeamsScreen({ navigation }: any) {
  const backPressCount = useRef(0);
  const [favorites, setFavorites] = useState<{ name: string; league: string; image: string }[]>([]);

  useEffect(() => {
    const backAction = () => {
      if (backPressCount.current === 0) {
        ToastAndroid.show("برای خروج دوباره بازگشت را بزنید", ToastAndroid.SHORT);
        backPressCount.current = 1;
        setTimeout(() => {
          backPressCount.current = 0;
        }, 2000);
        return true;
      } else {
        BackHandler.exitApp();
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const isLeaguePicked = (league: string) =>
    favorites.some((team) => team.league === league);

  const selectTeam = (team: { name: string; league: string; image: string }) => {
    if (favorites.length >= 3) return;
    if (team.name === 'Persepolis') return; // Disable Persepolis
    if (isLeaguePicked(team.league)) return;

    setFavorites([...favorites, team]);
  };

  const removeTeam = (name: string) => {
    setFavorites(favorites.filter((team) => team.name !== name));
  };

  const handleStart = () => {
    if (favorites.length === 0) {
      ToastAndroid.show("حداقل یک تیم انتخاب کن!", ToastAndroid.SHORT);
      return;
    }

    if (favorites.length === 1) {
      navigation.navigate('Home', { favorites });
    } else {
      navigation.navigate('Priority', { favorites });
    }
  };


  return (
    <View style={styles.container}>
      <Text style={styles.title}>تیم‌های مورد علاقه‌ات رو انتخاب کن</Text>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.name}
        horizontal
        contentContainerStyle={{ marginVertical: 10 }}
        renderItem={({ item }) => (
          <View style={styles.favoriteItem}>
            <Image source={{ uri: item.image }} style={styles.favoriteLogo} />
            <Text style={styles.favoriteText}>{item.name}</Text>
            <TouchableOpacity onPress={() => removeTeam(item.name)}>
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <FlatList
        data={teamsData}
        keyExtractor={(item) => item.name}
        numColumns={3}
        renderItem={({ item }) => {
          const selected = favorites.some((t) => t.name === item.name);
          const leaguePicked = isLeaguePicked(item.league);
          const disabled = leaguePicked && !selected;

          return (
            <TouchableOpacity
              disabled={item.name === 'Persepolis' || disabled}
              onPress={() => selectTeam(item)}
              style={[
                styles.teamCard,
                selected && styles.selected,
                disabled && styles.disabled,
              ]}
            >
              <Image source={{ uri: item.image }} style={styles.teamLogo} />
              <Text style={styles.teamName}>{item.name}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.Button} onPress={handleStart}>
        <Text style={styles.ButtonText}>شروع اپلیکیشن</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 15 },
  title: { color: '#fff', fontSize: 16, marginBottom: 10, textAlign: 'center', fontWeight: 'bold' },

  teamCard: {
    flex: 1,
    backgroundColor: '#2b2b2b',
    margin: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  teamLogo: { width: 30, height: 30, marginBottom: 6 },
  teamName: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  selected: {
    borderColor: '#444',
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.3,
  },
  favoriteItem: {
    backgroundColor: '#444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 10,
    borderRadius: 5,
  },
  favoriteLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
    borderRadius: 10,
  },
  favoriteText: { color: '#fff', fontSize: 13, marginRight: 5 },
  removeBtn: { color: '#fff', fontSize: 16 },
  Button: {
    marginTop: 25,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
