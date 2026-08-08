import { View } from 'react-native';

import { cn } from '@/shared/rnr/utils';

function Skeleton({
  className,
  accessibilityLabel = 'Loading content',
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className={cn('animate-pulse rounded-md bg-muted/80', className)}
      {...props}
    />
  );
}

export { Skeleton };
