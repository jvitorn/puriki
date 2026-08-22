import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import type { AuthProviderId } from '@/domain/models/auth';
import { localizedAuthFailure } from '@/localization/localized-values';
import { AccountProfileCard } from '@/presentation/components/settings/account-profile-card';
import { Button } from '@/presentation/components/ui/button';
import { Text } from '@/presentation/components/ui/text';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';

export interface ProviderAccountBlockProps {
  provider: AuthProviderId;
  providerName: string;
  providerImage: ImageSourcePropType;
  /**
   * AniList keeps its original bare accessibility labels ("Connect",
   * "Disconnect", ...) for backward compatibility. MyAnimeList's block sets
   * this so its labels stay unique when both provider cards render at once.
   */
  suffixAccessibilityLabels?: boolean;
}

export function ProviderAccountBlock({
  provider,
  providerName,
  providerImage,
  suffixAccessibilityLabels = false,
}: ProviderAccountBlockProps) {
  const { t } = useTranslation();
  const { snapshot, retry, signIn, signOut } = useAuthSession();
  const connection = snapshot.connections[provider];
  const busy = connection.operation !== 'idle';
  const connected = connection.state === 'connected';

  const withSuffix = (label: string): string =>
    suffixAccessibilityLabels ? `${label} ${providerName}` : label;

  const status = connected
    ? t('settings.connectedWith', { provider: providerName })
    : connection.canRetry
      ? t('auth.validationPending')
      : connection.state === 'reconnect_required'
        ? t('auth.reconnectRequired')
        : t('auth.notConnected');

  const confirmDisconnect = () => {
    Alert.alert(
      t('auth.disconnectConfirmTitle', { provider: providerName }),
      t('auth.disconnectConfirmDescription', { provider: providerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.disconnect'),
          style: 'destructive',
          onPress: () => void signOut(provider),
        },
      ],
    );
  };

  const primaryLabel =
    connection.operation === 'signing_in'
      ? t('auth.connecting')
      : connection.operation === 'restoring'
        ? t('auth.checking')
        : connection.operation === 'signing_out'
          ? t('auth.disconnecting')
          : connected
            ? t('auth.disconnect')
            : connection.canRetry
              ? t('auth.retry')
              : connection.state === 'reconnect_required'
                ? t('auth.reconnect')
                : t('auth.connect');

  const runPrimaryAction = () => {
    if (connected) {
      confirmDisconnect();
    } else if (connection.canRetry) {
      void retry(provider);
    } else {
      void signIn(provider);
    }
  };

  return (
    <View className="gap-3">
      <AccountProfileCard
        avatarUrl={connection.account?.avatarUrl}
        connectionState={connection.state}
        providerImage={providerImage}
        providerName={providerName}
        status={status}
        username={connection.account?.username}
      >
        {connection.canRetry ? (
          <Button
            accessibilityLabel={withSuffix(t('auth.disconnect'))}
            disabled={busy}
            size="sm"
            variant="ghost"
            onPress={confirmDisconnect}
          >
            <Text>{t('auth.disconnect')}</Text>
          </Button>
        ) : null}
        <Button
          accessibilityLabel={withSuffix(primaryLabel)}
          disabled={busy}
          size="sm"
          variant={connected ? 'outline' : 'default'}
          onPress={runPrimaryAction}
        >
          <Text>{primaryLabel}</Text>
        </Button>
      </AccountProfileCard>

      {connection.failure ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="px-1 text-destructive"
          variant="caption"
        >
          {localizedAuthFailure(connection.failure, t, providerName)}
        </Text>
      ) : null}
    </View>
  );
}
