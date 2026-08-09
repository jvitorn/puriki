import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Text } from '@/presentation/components/ui/text';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/presentation/components/ui/toggle-group';

const SCORES = Array.from({ length: 10 }, (_, index) => index + 1);

export function AnimeScoreSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange(value: number | null): void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const selectedValue = value === null ? 'clear' : String(value);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <ToggleGroup
        accessibilityLabel={t('details.scoreSelector')}
        className="gap-2 pr-4"
        disabled={disabled}
        type="single"
        value={selectedValue}
        variant="outline"
        onValueChange={(next) => {
          if (!next) return;
          onChange(next === 'clear' ? null : Number(next));
        }}
      >
        <ToggleGroupItem
          accessibilityLabel={t('details.clearScore')}
          accessibilityState={{ selected: value === null, disabled }}
          className="min-h-11 rounded-lg border px-3"
          value="clear"
        >
          <Text>—</Text>
        </ToggleGroupItem>
        {SCORES.map((score) => (
          <ToggleGroupItem
            key={score}
            accessibilityLabel={t('details.scoreValue', { score })}
            accessibilityState={{ selected: value === score, disabled }}
            className="min-h-11 min-w-11 rounded-lg border px-3"
            value={String(score)}
          >
            <Text>{score}</Text>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </ScrollView>
  );
}
