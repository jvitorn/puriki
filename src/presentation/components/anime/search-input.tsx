import { Search, X } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/presentation/components/ui/icon';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { Input } from '@/presentation/components/ui/input';

export function SearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText(value: string): void;
}) {
  return (
    <View className="relative justify-center">
      <View
        accessibilityElementsHidden
        className="pointer-events-none absolute left-3 z-10"
        importantForAccessibility="no-hide-descendants"
      >
        <Icon as={Search} className="size-5 text-muted-foreground" />
      </View>
      <Input
        accessibilityLabel="Search anime"
        autoCapitalize="none"
        autoCorrect={false}
        className="h-12 rounded-xl pl-11 pr-12 text-base"
        clearButtonMode="never"
        enterKeyHint="search"
        placeholder="Search titles…"
        returnKeyType="search"
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <View className="absolute right-0 z-10">
          <IconButton
            className="border-transparent bg-transparent shadow-none"
            icon={X}
            label="Clear search"
            onPress={() => onChangeText('')}
          />
        </View>
      ) : null}
    </View>
  );
}
