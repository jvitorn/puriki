import { useLocalSearchParams } from 'expo-router';

import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';

export default function AnimeDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AnimeDetailsScreen animeId={Number(id)} />;
}
