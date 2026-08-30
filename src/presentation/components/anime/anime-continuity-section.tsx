import type { TFunction } from 'i18next';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type {
  AnimeContinuityKind,
  AnimeContinuityRelation,
} from '@/domain/models/anime';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { Badge } from '@/presentation/components/ui/badge';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';
import { useKnownAnimeByIds } from '@/presentation/queries/anime-queries';

function relationLabel(kind: AnimeContinuityKind, t: TFunction): string {
  return t(
    kind === 'prequel'
      ? 'details.continuityPrequel'
      : 'details.continuitySequel',
  );
}

export function AnimeContinuitySection({
  relations,
  onSelect,
}: {
  relations: readonly AnimeContinuityRelation[];
  onSelect(animeId: number): void;
}) {
  const { t } = useTranslation();
  const knownItems = useKnownAnimeByIds(
    relations.map((relation) => relation.animeId),
  );
  if (relations.length === 0) return null;

  return (
    <View className="gap-3">
      <Text variant="heading">{t('details.continuity')}</Text>
      {relations.map((relation) => {
        const label = relationLabel(relation.kind, t);
        const known = knownItems.get(relation.animeId);
        return (
          <Card
            key={`${relation.kind}:${relation.animeId}`}
            className="overflow-hidden p-0 py-0"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('details.continuityRelationA11y', {
                kind: label,
                title: relation.title,
              })}
              className="min-h-20 flex-row items-center gap-3 p-3 active:bg-accent"
              onPress={() => onSelect(relation.animeId)}
              testID={`continuity-${relation.kind}-${relation.animeId}`}
            >
              <PosterPlaceholder
                className="shrink-0 rounded-md"
                title={relation.title}
                seed={relation.animeId}
                imageUrl={
                  known?.posterImageUrl ?? known?.largePosterImageUrl ?? null
                }
                width={56}
                height={84}
              />
              <View className="flex-1 gap-2">
                <Badge variant="outline" className="self-start">
                  <Text>{label}</Text>
                </Badge>
                <Text numberOfLines={2} className="font-semibold leading-5">
                  {relation.title}
                </Text>
              </View>
              <Icon
                as={ChevronRight}
                className="size-5 text-muted-foreground"
              />
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
}
