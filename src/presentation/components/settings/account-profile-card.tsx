import { UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/presentation/components/ui/avatar';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';

export interface AccountProfileCardProps {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  connectionState: 'disconnected' | 'connected';
}

export function AccountProfileCard({
  displayName,
  username,
  avatarUrl,
  connectionState,
}: AccountProfileCardProps) {
  const { t } = useTranslation();
  const connected = connectionState === 'connected';
  const title = connected && displayName ? displayName : t('settings.mal');
  const subtitle = connected
    ? username
      ? `@${username.replace(/^@/, '')}`
      : t('settings.connected')
    : t('settings.notConnected');
  const avatarLabel = connected
    ? t('settings.accountAvatar', { name: title })
    : t('settings.disconnectedAvatar');

  return (
    <Card accessible className="flex-row items-center gap-4 border-0 p-4 py-4">
      <Avatar alt={avatarLabel} className="size-14">
        {connected && avatarUrl ? (
          <AvatarImage source={{ uri: avatarUrl }} />
        ) : null}
        <AvatarFallback testID="account-avatar-fallback">
          <Icon as={UserRound} className="size-6 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-1">
        <Text className="font-bold">{title}</Text>
        <Text muted>{subtitle}</Text>
      </View>
    </Card>
  );
}
