import { Languages } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, View } from 'react-native';

import googleTranslateAttribution from '../../../../assets/google-translate-attribution.png';

import type { AppLanguage } from '@/localization/languages';
import { Button } from '@/presentation/components/ui/button';
import { ExpandableText } from '@/presentation/components/ui/expandable-text';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';
import { useSynopsisTranslation } from '@/presentation/hooks/use-synopsis-translation';
import { colors } from '@/presentation/theme/tokens';

interface AnimeSynopsisSectionProps {
  animeId: number;
  synopsis: string;
  appLanguage: AppLanguage;
}

export function AnimeSynopsisSection({
  animeId,
  synopsis,
  appLanguage,
}: AnimeSynopsisSectionProps) {
  const { t } = useTranslation();
  const translation = useSynopsisTranslation({
    animeId,
    synopsis,
    appLanguage,
  });

  const action = translation.isTranslating
    ? {
        label: t('details.synopsisTranslation.translating'),
        accessibilityLabel: t(
          'details.synopsisTranslation.translatingAccessibility',
        ),
        onPress: translation.translate,
      }
    : translation.isTranslated
      ? translation.showingOriginal
        ? {
            label: t('details.synopsisTranslation.viewGoogleTranslation'),
            accessibilityLabel: t(
              'details.synopsisTranslation.viewGoogleTranslationAccessibility',
            ),
            onPress: translation.showTranslation,
          }
        : {
            label: t('details.synopsisTranslation.viewOriginal'),
            accessibilityLabel: t(
              'details.synopsisTranslation.viewOriginalAccessibility',
            ),
            onPress: translation.showOriginal,
          }
      : {
          label: t('details.synopsisTranslation.translateWithGoogle'),
          accessibilityLabel: t(
            'details.synopsisTranslation.translateAccessibility',
          ),
          onPress: translation.translate,
        };

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Text variant="heading">{t('details.synopsis')}</Text>
        {translation.canTranslate ? (
          <Button
            accessibilityLabel={action.accessibilityLabel}
            accessibilityState={{
              busy: translation.isTranslating,
              disabled: translation.isTranslating,
            }}
            className="max-w-full shrink"
            disabled={translation.isTranslating}
            size="sm"
            variant="outline"
            onPress={() => void action.onPress()}
          >
            {translation.isTranslating ? (
              <ActivityIndicator color={colors.foreground} size="small" />
            ) : (
              <Icon as={Languages} className="size-4" />
            )}
            <Text>{action.label}</Text>
          </Button>
        ) : null}
      </View>

      <ExpandableText text={translation.displayedText} collapsedLineCount={4} />

      {translation.isTranslating ? (
        <Text variant="caption" muted>
          {t('details.synopsisTranslation.modelDownloadHint')}
        </Text>
      ) : null}

      {translation.isTranslated && !translation.showingOriginal ? (
        <Image
          accessibilityLabel={t(
            'details.synopsisTranslation.googleAttributionAccessibility',
          )}
          resizeMode="contain"
          source={googleTranslateAttribution}
          style={{ height: 16, width: 176 }}
        />
      ) : null}

      {translation.error ? (
        <View
          accessible
          accessibilityRole="alert"
          className="gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
        >
          <Text className="text-destructive">
            {t('details.synopsisTranslation.failed')}
          </Text>
          <Text variant="caption" muted>
            {t('details.synopsisTranslation.failedHint')}
          </Text>
          <Button
            accessibilityLabel={t(
              'details.synopsisTranslation.retryAccessibility',
            )}
            className="h-10 self-start px-0"
            variant="link"
            onPress={() => void translation.retry()}
          >
            <Text>{t('details.synopsisTranslation.retry')}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
