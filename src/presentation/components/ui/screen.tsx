import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/shared/rnr/utils';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  header?: ReactNode;
  testID?: string;
  className?: string;
  contentClassName?: string;
  fullBleed?: boolean;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  header,
  testID,
  className,
  contentClassName,
  fullBleed = false,
}: ScreenProps) {
  const content = (
    <View
      className={cn(
        'w-full flex-1 web:max-w-6xl web:self-center',
        padded && !fullBleed && 'px-4 md:px-6',
        contentClassName,
      )}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      className={cn('flex-1 bg-background', className)}
      edges={['top']}
      testID={testID}
    >
      {header}
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="min-h-full pb-24"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
