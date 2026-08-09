import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { cn } from '@/shared/rnr/utils';

function Skeleton({
  className,
  accessibilityLabel,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? t('common.loadingContent')}
      className={cn('animate-pulse rounded-md bg-muted/80', className)}
      {...props}
    />
  );
}

export { Skeleton };
