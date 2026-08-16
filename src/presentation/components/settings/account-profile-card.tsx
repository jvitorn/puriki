import { UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import type { AccountConnectionState } from '@/domain/models/auth';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/presentation/components/ui/avatar';
import { Badge } from '@/presentation/components/ui/badge';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';
import { cn } from '@/shared/rnr/utils';

export interface AccountProfileCardProps {
  providerName: string;
  providerImage?: ImageSourcePropType;
  status: string;
  username?: string | null;
  avatarUrl?: string | null;
  connectionState: AccountConnectionState | 'coming_soon';
  children?: React.ReactNode;
}

export function AccountProfileCard({
  providerName,
  providerImage,
  status,
  username,
  avatarUrl,
  connectionState,
  children,
}: AccountProfileCardProps) {
  const { t } = useTranslation();
  const connected = connectionState === 'connected';
  const avatarLabel = connected
    ? t('settings.accountAvatar', { name: username ?? providerName })
    : t('settings.disconnectedAvatar');

  return (
    <Card
      className={cn(
        'gap-4 border-0 p-4 py-4',
        connectionState === 'coming_soon' && 'opacity-55',
      )}
    >
      <View accessible className="flex-row items-center gap-4">
        <Avatar alt={avatarLabel} className="size-14">
          {connected && avatarUrl ? (
            <AvatarImage source={{ uri: avatarUrl }} />
          ) : null}
          <AvatarFallback testID="account-avatar-fallback">
            {!connected && providerImage ? (
              <Image
                className="size-10 rounded-[10px]"
                source={providerImage}
              />
            ) : (
              <Icon as={UserRound} className="size-6 text-muted-foreground" />
            )}
          </AvatarFallback>
        </Avatar>
        <View className="flex-1 gap-1">
          <Text className="font-bold">
            {connected ? (username ?? providerName) : providerName}
          </Text>
          {connected ? (
            <Text variant="caption" muted>
              {providerName}
            </Text>
          ) : null}
          <Text muted>{status}</Text>
        </View>
        {connected ? (
          <Badge className="border-emerald-500/30 bg-emerald-500/15">
            <Text className="text-emerald-400">{t('settings.active')}</Text>
          </Badge>
        ) : null}
      </View>
      {children ? (
        <View className="flex-row flex-wrap justify-end gap-2 border-t border-border pt-3">
          {children}
        </View>
      ) : null}
    </Card>
  );
}
