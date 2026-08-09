import { useTranslation } from 'react-i18next';

import type { AnimeListStatus } from '@/domain/models/anime';
import { localizedStatus } from '@/localization/localized-values';
import { Text } from '@/presentation/components/ui/text';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/presentation/components/ui/toggle-group';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';

export function AnimeStatusSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: AnimeListStatus;
  onChange(value: AnimeListStatus): void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      accessibilityLabel={t('details.statusSelector')}
      className="flex-wrap justify-start gap-2"
      disabled={disabled}
      type="single"
      value={value}
      variant="outline"
      onValueChange={(next) => {
        if (next) onChange(next as AnimeListStatus);
      }}
    >
      {ANIME_STATUSES.map((status) => {
        const selected = value === status;
        return (
          <ToggleGroupItem
            key={status}
            accessibilityLabel={localizedStatus(status, t)}
            accessibilityState={{ selected, disabled }}
            className="min-h-11 rounded-lg border px-3"
            value={status}
          >
            <Text>{localizedStatus(status, t)}</Text>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
