import { AlertCircle, Inbox } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/presentation/components/ui/button';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View
      accessible
      className="min-h-48 items-center justify-center gap-2 px-6 py-8"
      accessibilityRole="summary"
    >
      <View className="mb-1 size-12 items-center justify-center rounded-full bg-muted">
        <Icon as={Inbox} className="size-6 text-muted-foreground" />
      </View>
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      <Text muted className="max-w-md text-center">
        {message}
      </Text>
    </View>
  );
}

export function ErrorState({
  title = 'Unable to load',
  message = 'Something went wrong. Please try again.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View
      accessible
      className="min-h-48 items-center justify-center gap-2 px-6 py-8"
      accessibilityRole="alert"
    >
      <View className="mb-1 size-12 items-center justify-center rounded-full bg-destructive/15">
        <Icon as={AlertCircle} className="size-6 text-destructive" />
      </View>
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      <Text muted className="max-w-md text-center">
        {message}
      </Text>
      {onRetry ? (
        <Button className="mt-2 min-h-11" onPress={onRetry}>
          <Text>Try again</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function SectionErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry(): void;
  retryLabel: string;
}) {
  return (
    <View
      accessible
      className="gap-4 rounded-xl bg-card p-4"
      accessibilityRole="alert"
    >
      <View className="flex-row items-center gap-2">
        <Icon as={AlertCircle} className="size-5 text-destructive" />
        <Text muted className="flex-1">
          {message}
        </Text>
      </View>
      <Button
        accessibilityLabel={retryLabel}
        className="min-h-11 self-start"
        variant="outline"
        onPress={onRetry}
      >
        <Text>Try again</Text>
      </Button>
    </View>
  );
}
