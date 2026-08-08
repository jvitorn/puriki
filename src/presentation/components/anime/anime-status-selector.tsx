import type { AnimeListStatus } from '@/domain/models/anime';
import { Text } from '@/presentation/components/ui/text';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/presentation/components/ui/toggle-group';
import { ANIME_STATUSES, STATUS_LABELS } from '@/shared/constants/anime-status';

export function AnimeStatusSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: AnimeListStatus;
  onChange(value: AnimeListStatus): void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      accessibilityLabel="Anime list status"
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
            accessibilityLabel={STATUS_LABELS[status]}
            accessibilityState={{ selected, disabled }}
            className="min-h-11 rounded-lg border px-3"
            value={status}
          >
            <Text>{STATUS_LABELS[status]}</Text>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
