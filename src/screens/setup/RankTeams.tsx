import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { teamImages } from './PickTeams';

export default function RankTeamsScreen({ route, navigation }: any) {
  const { favorites } = route.params;
  console.log(favorites)

  const [round, setRound] = useState(1);
  const [firstMatchWinner, setFirstMatchWinner] = useState<any>(null);
  const [firstMatchLoser, setFirstMatchLoser] = useState<any>(null);
  const [finalWinner, setFinalWinner] = useState<any>(null);
  const [finalLoser, setFinalLoser] = useState<any>(null);

  const handleSelection = async (winner: any, loser: any) => {
    if (round === 1) {
      setFirstMatchWinner(winner);
      setFirstMatchLoser(loser);
      setRound(2);
    } else if (round === 2) {
      setFinalWinner(winner);
      setFinalLoser(loser);

      // اگر هر دو مسابقه را یک تیم برد، باید مسابقه‌ی سوم اجرا شود
      if (winner === firstMatchWinner) {
        // اجرای راند سوم بین دو تیم بازنده
        setRound(3);
      } else {
        // پایان با دو راند کافی‌ست
        navigation.navigate('Tabs');
      }
    } else if (round === 3) {
      // اینجا فقط برای تعیین دوم و سوم است
      const second = winner;
      const third = loser;
      await AsyncStorage.setItem("auth-status", JSON.stringify({ status: "home"}));
      await AsyncStorage.setItem("teams", JSON.stringify({ team1: finalWinner.name , team2: second.name , team3: third.name || null}));
      navigation.navigate('Tabs');
    }
  };

  let team1: any, team2: any;
  if (round === 1) {
    [team1, team2] = [favorites[0], favorites[1]];
  } else if (round === 2) {
    team1 = firstMatchWinner;
    team2 = favorites[2];
  } else {
    // round 3
    team1 = firstMatchLoser;
    team2 = finalLoser;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {round === 1
          ? 'بین این دو تیم محتوای کدوم رو بیشتر دوست داری ببینی'
          : round === 2
          ? 'بین اینا کدوم؟'
          : 'این چی؟'}
      </Text>

      <View style={styles.matchupContainer}>
        {[team1, team2].map((team: any) => (
          <TouchableOpacity
            key={team.name}
            style={styles.teamCard}
            onPress={() => handleSelection(team, team === team1 ? team2 : team1)}
          >
            <Image source={teamImages[team.name]} style={styles.logo} />
            <Text style={styles.teamName}>{team.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    marginBottom: 100,
    paddingTop: 80,
    alignItems: 'center',
    backgroundColor: '#000',
  },
  title: {
    fontSize: 18,
    fontFamily: "SFArabic-Regular",
    marginBottom: 30,
    color: '#fff',
    textAlign: 'center',
  },
  matchupContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  teamCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.17)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 3,
    width: 140,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 12,
    marginBottom: 12,
  },
  teamName: {
    color: "#fff",
    fontSize: 15,
    textAlign: 'center',
    fontFamily: "SFArabic-Regular",
  },
});