import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export function ProgressBar({
  value,
  accessibilityLabel,
}: {
  value: number;
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation();
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('details.episodeProgress')}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(normalized * 100),
      }}
      className="h-1 overflow-hidden rounded-full bg-border"
    >
      <View
        className="h-full rounded-full bg-primary"
        style={{ width: `${normalized * 100}%` }}
      />
    </View>
  );
}
