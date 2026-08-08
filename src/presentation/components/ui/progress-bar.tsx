import { View } from 'react-native';

export function ProgressBar({
  value,
  accessibilityLabel = 'Episode progress',
}: {
  value: number;
  accessibilityLabel?: string;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
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
