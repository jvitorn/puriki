import { ArrowLeft, ChevronRight, Info, Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ImageSourcePropType, NativeScrollEvent } from 'react-native';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AniListIcon from '../../../assets/providers/anilist.png';
import MyAnimeListIcon from '../../../assets/providers/myanimelist.png';

import type { ProviderSessionSnapshot } from '@/application/auth/auth-contracts';
import { usePopularAnime } from '@/application/queries/anime-queries';
import type { AuthProviderId } from '@/domain/models/auth';
import { localizedAuthFailure } from '@/localization/localized-values';
import { PurikiLogo } from '@/presentation/components/branding/puriki-logo';
import { OnboardingHeroPosters } from '@/presentation/components/onboarding/onboarding-hero-posters';
import {
  ListsIllustration,
  ProgressIllustration,
  ServicesIllustration,
} from '@/presentation/components/onboarding/onboarding-illustrations';
import { Button } from '@/presentation/components/ui/button';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { Screen } from '@/presentation/components/ui/screen';
import { Text } from '@/presentation/components/ui/text';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { useOnboardingCompletion } from '@/presentation/providers/onboarding-provider';
import { cn } from '@/shared/rnr/utils';

type OnboardingAct = 'welcome' | 'learn' | 'providers';
interface ProviderOption {
  id: AuthProviderId;
  image: ImageSourcePropType;
  name: string;
  available: boolean;
}

const PROVIDERS: readonly ProviderOption[] = [
  { id: 'anilist', image: AniListIcon, name: 'AniList', available: true },
  {
    id: 'mal',
    image: MyAnimeListIcon,
    name: 'MyAnimeList',
    available: false,
  },
];

const CAROUSEL_STEPS = [
  {
    id: 'lists',
    titleKey: 'onboarding.stepListsTitle',
    descriptionKey: 'onboarding.stepListsDescription',
  },
  {
    id: 'progress',
    titleKey: 'onboarding.stepProgressTitle',
    descriptionKey: 'onboarding.stepProgressDescription',
  },
  {
    id: 'services',
    titleKey: 'onboarding.stepServicesTitle',
    descriptionKey: 'onboarding.stepServicesDescription',
  },
] as const;

function AnimatedLayer({
  children,
  delay,
  reduceMotion,
}: {
  children: React.ReactNode;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(delay)
              .duration(300)
              .reduceMotion(ReduceMotion.System)
      }
    >
      {children}
    </Animated.View>
  );
}

function OnboardingHeader({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="relative h-14 items-center justify-center">
      {onBack ? (
        <Button
          accessibilityLabel={t('onboarding.back')}
          className="absolute left-0 z-10 rounded-full"
          hitSlop={6}
          size="icon"
          variant="ghost"
          onPress={onBack}
        >
          <Icon as={ArrowLeft} className="size-5 text-muted-foreground" />
        </Button>
      ) : null}
      <PurikiLogo variant="horizontal" colorScheme="dark" height={28} />
    </View>
  );
}

function OnboardingButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'h-[52px] rounded-lg active:scale-[0.98] active:opacity-90',
        className,
      )}
      size="lg"
      {...props}
    >
      {children}
    </Button>
  );
}

function WelcomeAct({
  onContinue,
  random,
}: {
  onContinue(): void;
  random?: () => number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const popular = usePopularAnime();

  return (
    <Screen padded={false} testID="welcome-act">
      <View className="flex-1 px-6">
        <AnimatedLayer delay={0} reduceMotion={reduceMotion}>
          <OnboardingHeader />
        </AnimatedLayer>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-between"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center justify-center pt-2">
            <AnimatedLayer delay={150} reduceMotion={reduceMotion}>
              <OnboardingHeroPosters
                items={popular.data}
                isLoading={popular.isLoading}
                random={random}
              />
            </AnimatedLayer>
            <AnimatedLayer delay={300} reduceMotion={reduceMotion}>
              <Card className="w-[260px] gap-3 p-4 py-4">
                <View className="flex-row items-center justify-between gap-4">
                  <Text variant="caption" muted>
                    {t('onboarding.episodeMarked')}
                  </Text>
                  <Text className="font-black">12 / 24</Text>
                </View>
                <ProgressBar value={0.5} />
              </Card>
            </AnimatedLayer>
          </View>
          <AnimatedLayer delay={450} reduceMotion={reduceMotion}>
            <View className="gap-2 pb-5 pt-4">
              <Text className="text-[30px] font-extrabold leading-9 tracking-tight">
                {t('onboarding.welcomeTitle')}
              </Text>
              <Text className="text-[15px] leading-[23px]" muted>
                {t('onboarding.welcomeDescription')}
              </Text>
            </View>
          </AnimatedLayer>
        </ScrollView>
        <AnimatedLayer delay={600} reduceMotion={reduceMotion}>
          <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <OnboardingButton onPress={onContinue}>
              <Text>{t('onboarding.getStarted')}</Text>
            </OnboardingButton>
          </View>
        </AnimatedLayer>
      </View>
    </Screen>
  );
}

function CarouselIllustration({
  id,
  progress,
  onProgressChange,
}: {
  id: (typeof CAROUSEL_STEPS)[number]['id'];
  progress: number;
  onProgressChange(value: number): void;
}) {
  if (id === 'lists') return <ListsIllustration />;
  if (id === 'progress') {
    return (
      <ProgressIllustration progress={progress} onChange={onProgressChange} />
    );
  }
  return <ServicesIllustration />;
}

function LearnAct({
  currentStep,
  progress,
  onBackToWelcome,
  onProgressChange,
  onStepChange,
  onContinueToProviders,
}: {
  currentStep: number;
  progress: number;
  onBackToWelcome(): void;
  onProgressChange(value: number): void;
  onStepChange(step: number): void;
  onContinueToProviders(): void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof CAROUSEL_STEPS)[number]>>(null);

  const moveToStep = (step: number) => {
    onStepChange(step);
    listRef.current?.scrollToIndex({ animated: true, index: step });
  };
  const goBack = () => {
    if (currentStep === 0) onBackToWelcome();
    else moveToStep(currentStep - 1);
  };
  const continueForward = () => {
    if (currentStep === CAROUSEL_STEPS.length - 1) {
      onContinueToProviders();
    } else {
      moveToStep(currentStep + 1);
    }
  };
  const updateStepFromScroll = (event: { nativeEvent: NativeScrollEvent }) => {
    const nextStep = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextStep >= 0 && nextStep < CAROUSEL_STEPS.length) {
      onStepChange(nextStep);
    }
  };

  return (
    <Screen padded={false} testID="learn-act">
      <View className="flex-1">
        <View className="px-6">
          <OnboardingHeader onBack={goBack} />
        </View>
        <FlatList
          ref={listRef}
          testID="onboarding-carousel"
          data={CAROUSEL_STEPS}
          extraData={progress}
          getItemLayout={(_data, index) => ({
            index,
            length: width,
            offset: width * index,
          })}
          horizontal
          initialScrollIndex={currentStep}
          keyExtractor={(item) => item.id}
          pagingEnabled
          renderItem={({ item, index }) => (
            <ScrollView
              accessibilityElementsHidden={index !== currentStep}
              contentContainerClassName="flex-grow justify-center px-6 pb-4"
              importantForAccessibility={
                index === currentStep ? 'yes' : 'no-hide-descendants'
              }
              showsVerticalScrollIndicator={false}
              style={{ width }}
            >
              <View
                accessible
                accessibilityLabel={t('onboarding.stepA11y', {
                  current: index + 1,
                  total: CAROUSEL_STEPS.length,
                })}
                className="absolute"
              />
              <View className="items-center">
                <CarouselIllustration
                  id={item.id}
                  progress={progress}
                  onProgressChange={onProgressChange}
                />
              </View>
              <View className="min-h-36 gap-2 pt-2">
                <Text
                  className="text-[27px] font-extrabold leading-8 tracking-tight"
                  numberOfLines={3}
                >
                  {t(item.titleKey)}
                </Text>
                <Text className="text-[15px] leading-[23px]" muted>
                  {t(item.descriptionKey)}
                </Text>
              </View>
            </ScrollView>
          )}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={updateStepFromScroll}
          onScrollToIndexFailed={({ index }) => {
            listRef.current?.scrollToOffset({
              animated: false,
              offset: index * width,
            });
          }}
        />
        <View
          className="flex-row items-center justify-between gap-6 px-6 pt-2"
          style={{ paddingBottom: Math.max(bottom, 16) }}
        >
          <View className="flex-row items-center gap-2" accessible={false}>
            {CAROUSEL_STEPS.map((step, index) => (
              <View
                key={step.id}
                className={cn(
                  'h-1.5 rounded-full',
                  index === currentStep
                    ? 'w-[22px] bg-primary-emphasis'
                    : 'w-1.5 bg-border',
                )}
              />
            ))}
          </View>
          <OnboardingButton className="min-w-36" onPress={continueForward}>
            <Text>{t('onboarding.continue')}</Text>
          </OnboardingButton>
        </View>
      </View>
    </Screen>
  );
}

function ProviderRow({
  option,
  connected,
  disabled,
  status,
  actionLabel,
  onPress,
}: {
  option: ProviderOption;
  connected: boolean;
  disabled: boolean;
  status: string;
  actionLabel?: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.name}
      accessibilityState={{ disabled, selected: connected }}
      className={cn(
        'min-h-[72px] flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 active:opacity-80',
        connected && 'border-primary-emphasis bg-primary/10',
        disabled && !connected && 'opacity-60',
      )}
      disabled={disabled}
      testID={`provider-${option.id}`}
      onPress={onPress}
    >
      <Image className="size-10 rounded-[10px]" source={option.image} />
      <View className="flex-1">
        <Text className={cn('font-bold', connected && 'text-primary-emphasis')}>
          {option.name}
        </Text>
        <Text variant="caption" muted>
          {status}
        </Text>
      </View>
      {option.available && !connected ? (
        actionLabel ? (
          <Text
            className="font-semibold text-primary-emphasis"
            variant="caption"
          >
            {actionLabel}
          </Text>
        ) : (
          <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
        )
      ) : null}
    </Pressable>
  );
}

function ProvidersAct({
  anilistConnection,
  isCompleting,
  onBack,
  onComplete,
  onAniListAction,
}: {
  anilistConnection: ProviderSessionSnapshot;
  isCompleting: boolean;
  onBack(): void;
  onComplete(): void;
  onAniListAction(): void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const connected = anilistConnection.state === 'connected';
  const authBusy = anilistConnection.operation !== 'idle';
  const anilistStatus = connected
    ? t('auth.connectedAs', {
        username: anilistConnection.account?.username ?? t('common.unknown'),
      })
    : anilistConnection.canRetry
      ? t('auth.validationPending')
      : anilistConnection.state === 'reconnect_required'
        ? t('auth.reconnectRequired')
        : authBusy
          ? anilistConnection.operation === 'restoring'
            ? t('auth.checking')
            : t('auth.connecting')
          : t('onboarding.connectAccount');

  return (
    <Screen padded={false} testID="providers-act">
      <View className="flex-1 px-6">
        <OnboardingHeader onBack={onBack} />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3 pb-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2 pb-2">
            <Text className="text-[27px] font-extrabold leading-8 tracking-tight">
              {t('onboarding.providersTitle')}
            </Text>
            <Text className="text-[15px] leading-[23px]" muted>
              {t('onboarding.providersDescription')}
            </Text>
          </View>
          {PROVIDERS.map((option) => (
            <ProviderRow
              key={option.id}
              option={option}
              connected={option.id === 'anilist' && connected}
              disabled={!option.available || authBusy || connected}
              actionLabel={
                option.id !== 'anilist'
                  ? undefined
                  : anilistConnection.canRetry
                    ? t('auth.retry')
                    : anilistConnection.state === 'reconnect_required'
                      ? t('auth.reconnect')
                      : undefined
              }
              status={
                option.id === 'anilist' ? anilistStatus : t('auth.comingSoon')
              }
              onPress={
                option.id === 'anilist' ? onAniListAction : () => undefined
              }
            />
          ))}
          {anilistConnection.failure ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              className="px-1 text-destructive"
              variant="caption"
            >
              {localizedAuthFailure(anilistConnection.failure, t)}
            </Text>
          ) : null}
          <View
            accessible
            className="min-h-11 flex-row items-center gap-3 px-1"
          >
            <View className="size-6 items-center justify-center rounded-full border border-dashed border-border">
              <Icon as={Sparkles} className="size-3.5 text-muted-foreground" />
            </View>
            <Text variant="caption" muted>
              {t('onboarding.moreServices')}
            </Text>
          </View>
        </ScrollView>
        <View
          className="gap-3 pt-3"
          style={{ paddingBottom: Math.max(bottom, 16) }}
        >
          {!connected ? (
            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text variant="caption" muted>
                {t('onboarding.or')}
              </Text>
              <View className="h-px flex-1 bg-border" />
            </View>
          ) : null}
          <OnboardingButton
            accessibilityState={{ disabled: isCompleting || authBusy }}
            disabled={isCompleting || authBusy}
            variant={connected ? 'default' : 'outline'}
            onPress={onComplete}
          >
            <Text>
              {isCompleting
                ? t('onboarding.entering')
                : connected
                  ? t('onboarding.continue')
                  : t('onboarding.continueGuest')}
            </Text>
          </OnboardingButton>
          {!connected ? (
            <View className="flex-row items-start gap-2" accessible>
              <Icon as={Info} className="mt-0.5 size-4 text-warning" />
              <Text variant="caption" className="flex-1 text-muted-foreground">
                {t('onboarding.guestWarning')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

export function OnboardingContent({
  completeOnboarding,
  random,
}: {
  completeOnboarding(): Promise<void>;
  random?: () => number;
}) {
  const { snapshot, retry, signIn } = useAuthSession();
  const [act, setAct] = useState<OnboardingAct>('welcome');
  const [carouselStep, setCarouselStep] = useState(0);
  const [demoProgress, setDemoProgress] = useState(13);
  const [isCompleting, setIsCompleting] = useState(false);
  const anilistConnection = snapshot.connections.anilist;

  if (act === 'welcome') {
    return (
      <WelcomeAct
        random={random}
        onContinue={() => {
          setCarouselStep(0);
          setAct('learn');
        }}
      />
    );
  }
  if (act === 'learn') {
    return (
      <LearnAct
        currentStep={carouselStep}
        progress={demoProgress}
        onBackToWelcome={() => setAct('welcome')}
        onContinueToProviders={() => setAct('providers')}
        onProgressChange={setDemoProgress}
        onStepChange={setCarouselStep}
      />
    );
  }
  return (
    <ProvidersAct
      anilistConnection={anilistConnection}
      isCompleting={isCompleting}
      onBack={() => {
        setCarouselStep(2);
        setAct('learn');
      }}
      onComplete={() => {
        if (isCompleting) return;
        setIsCompleting(true);
        void completeOnboarding();
      }}
      onAniListAction={() => {
        if (anilistConnection.canRetry) void retry('anilist');
        else void signIn('anilist');
      }}
    />
  );
}

export function OnboardingScreen() {
  const { completeOnboarding } = useOnboardingCompletion();
  return <OnboardingContent completeOnboarding={completeOnboarding} />;
}
