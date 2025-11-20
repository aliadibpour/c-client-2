import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { teamImages } from './PickTeams';
import AppText from '../../components/ui/AppText';

type TeamObj = { name?: string | null };

export default function RankTeamsScreen({ route, navigation }: any) {
  const { favorites } = route.params; // انتظار: آرایه‌ای از شیءهایی که حداقل .name دارن یا رشته‌ی اسم
  console.log('favorites (raw):', favorites);

  // normalize favorites -> array of TeamObj with name or null
  const rawFavs: TeamObj[] = Array.isArray(favorites)
    ? favorites.map((t: any) => (typeof t === 'string' ? { name: t } : { name: t?.name ?? null }))
    : [];

  // keep original count for branching logic
  const origCount = rawFavs.filter(t => t.name).length;

  // ensure we have an array of length 3 (fill with nulls if needed)
  const initialTeams: TeamObj[] = [...rawFavs];
  while (initialTeams.length < 3) initialTeams.push({ name: null });

  // state
  const [teams] = useState<TeamObj[]>(initialTeams); // ثابت بعد از mount
  const [round, setRound] = useState<number>(1); // 1,2,3
  const [firstMatchWinner, setFirstMatchWinner] = useState<TeamObj | null>(null);
  const [firstMatchLoser, setFirstMatchLoser] = useState<TeamObj | null>(null);
  const [finalWinner, setFinalWinner] = useState<TeamObj | null>(null); // winner of round2 (may equal firstMatchWinner)
  const [finalLoser, setFinalLoser] = useState<TeamObj | null>(null); // loser of round2

  useEffect(() => {
    // If only 1 team provided, finalize immediately:
    if (origCount === 1) {
      const champ = teams[0];
      finalizeAndStore(champ, null, null);
    }
    // otherwise wait for interactions
  }, []);

  async function finalizeAndStore(first: TeamObj | null, second: TeamObj | null, third: TeamObj | null) {
    try {
      await AsyncStorage.setItem('auth-status', JSON.stringify({ status: 'home' }));
      await AsyncStorage.setItem(
        'teams',
        JSON.stringify({
          team1: first?.name ?? null,
          team2: second?.name ?? null,
          team3: third?.name ?? null,
        })
      );
      // navigate to Tabs (همان مسیری که قبلاً استفاده می‌کردی)
      navigation.navigate('Tabs');
    } catch (e) {
      console.warn('AsyncStorage write error', e);
    }
  }

  const handleSelection = async (winner: TeamObj, loser: TeamObj) => {
    // guard: if winner has no name (placeholder) do nothing
    if (!winner?.name) return;

    if (round === 1) {
      // If only 2 teams originally, end here
      setFirstMatchWinner(winner);
      setFirstMatchLoser(loser);
      if (origCount === 2) {
        // finalize: winner -> 1, loser -> 2, third null
        await finalizeAndStore(winner, loser, null);
        return;
      }
      // else we have 3 teams: proceed to round 2
      setRound(2);
      return;
    }

    if (round === 2) {
      // This is winner vs teams[2]
      setFinalWinner(winner);
      setFinalLoser(loser);

      // if winner is same as firstMatchWinner => they won both matches -> need round 3 between two losers
      if (firstMatchWinner && winner.name === firstMatchWinner.name) {
        // we will run round 3 between firstMatchLoser and finalLoser (two losers)
        // ensure both losers exist; if one is missing, finalize
        if (!firstMatchLoser?.name && !finalLoser?.name) {
          // both missing? weird, finalize champion and null others
          await finalizeAndStore(winner, null, null);
          return;
        }
        setRound(3);
        return;
      } else {
        // winner != firstMatchWinner => champion is winner (the one who beat the previous winner)
        // ranking: 1 = winner (finalWinner), 2 = firstMatchWinner, 3 = firstMatchLoser
        const second = winner;
        const champion = firstMatchWinner ?? null;
        const third = firstMatchLoser ?? null;
        await finalizeAndStore(champion, second, third);
        return;
      }
    }

    if (round === 3) {
      // round 3 is between two losers: winner gets 2nd, loser gets 3rd
      const champion = finalWinner ?? firstMatchWinner; // champion determined previously
      const second = winner;
      const third = loser;
      await finalizeAndStore(champion, second, third);
      return;
    }
  };

  // compute current matchup teams based on round
  let teamA: TeamObj | null = null;
  let teamB: TeamObj | null = null;
  if (round === 1) {
    teamA = teams[0];
    teamB = teams[1];
  } else if (round === 2) {
    teamA = firstMatchWinner ?? teams[0]; // if somehow missing, fallback
    teamB = teams[2];
  } else {
    // round 3 -> between the two losers
    // firstMatchLoser and finalLoser should be set
    teamA = firstMatchLoser;
    teamB = finalLoser;
  }

  // helper to render team card safely
  function TeamCard({ team, onPress }: { team: TeamObj | null; onPress: () => void }) {
    const disabled = !team?.name;
    const name = team?.name ?? '—';
    const imgSource = team?.name ? teamImages[team.name] : undefined;

    return (
      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        style={[styles.teamCard, disabled && styles.teamCardDisabled]}
        activeOpacity={0.8}
      >
        {imgSource ? (
          <Image source={imgSource} style={styles.logo} resizeMode='contain' />
        ) : (
          <View style={styles.logoPlaceholder}>
            <AppText style={styles.logoPlaceholderText}>?</AppText>
          </View>
        )}
        <AppText style={styles.teamName}>{name}</AppText>
      </TouchableOpacity>
    );
  }

  // UI title by round
  const title =
    origCount <= 1
      ? 'تیم شما مشخص شد'
      : round === 1
      ? 'بین این دو تیم محتوای کدوم رو بیشتر دوست داری ببینی؟'
      : round === 2
      ? 'بین این دو تیم کدوم رو ترجیح می‌دی؟'
      : 'بین این دو؟';

  return (
    <View style={styles.container}>
      <AppText style={styles.title}>{title}</AppText>

      <View style={styles.matchupContainer}>
        {/* If teamA or teamB are null, still render placeholders to avoid layout shift */}
        <TeamCard
          team={teamA}
          onPress={() => {
            // when pressed, pass winner then loser
            const loser = teamB ?? { name: null };
            handleSelection(teamA as TeamObj, loser);
          }}
        />
        <TeamCard
          team={teamB}
          onPress={() => {
            const loser = teamA ?? { name: null };
            handleSelection(teamB as TeamObj, loser);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 16.5,
    fontFamily: 'SFArabic-Regular',
    marginBottom: 30,
    color: '#fff',
    textAlign: 'center',
  },
  matchupContainer: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  teamCardDisabled: {
    opacity: 0.45,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 12,
    marginBottom: 12,
  },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    color: '#999',
    fontSize: 20,
  },
  teamName: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontFamily: 'SFArabic-Regular',
  },
});