import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';

import { colors } from '@/presentation/theme/tokens';

const STARTUP_FADE_IN_MS = 180;
const STARTUP_HOLD_MS = 180;
const STARTUP_FADE_OUT_MS = 240;
const STARTUP_EXIT_AT_MS = STARTUP_FADE_IN_MS + STARTUP_HOLD_MS;
export const STARTUP_TRANSITION_DURATION_MS =
  STARTUP_EXIT_AT_MS + STARTUP_FADE_OUT_MS;

export interface NativeSplashController {
  hideAsync(): Promise<void>;
}

type StartupExitScheduler = (
  callback: () => void,
  delayMs: number,
) => ReturnType<typeof setTimeout>;

interface AppStartupSplashProps extends PropsWithChildren {
  splash?: NativeSplashController;
  scheduleExit?: StartupExitScheduler;
}

export function AppStartupSplash({
  children,
  scheduleExit = setTimeout,
  splash = SplashScreen,
}: AppStartupSplashProps) {
  const reduceMotion = useReducedMotion();
  const started = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  const startTransition = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void splash.hideAsync().catch(() => undefined);
    if (reduceMotion) {
      setShowOverlay(false);
      return;
    }
    exitTimer.current = scheduleExit(
      () => setShowOverlay(false),
      STARTUP_EXIT_AT_MS,
    );
  }, [reduceMotion, scheduleExit, splash]);

  return (
    <View className="flex-1">
      {children}
      {showOverlay ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          exiting={FadeOut.duration(STARTUP_FADE_OUT_MS).reduceMotion(
            ReduceMotion.System,
          )}
          onLayout={startTransition}
          style={[styles.overlay, { backgroundColor: colors.background }]}
          testID="app-startup-splash"
        >
          <Animated.View
            entering={FadeIn.duration(STARTUP_FADE_IN_MS).reduceMotion(
              ReduceMotion.System,
            )}
          >
            <Animated.View
              entering={ZoomIn.duration(320)
                .withInitialValues({ transform: [{ scale: 0.92 }] })
                .reduceMotion(ReduceMotion.System)}
            >
              <Image
                accessible={false}
                resizeMode="contain"
                source={require('../../../../assets/splash/puriki-splash-mark-dark-512.png')}
                style={styles.logo}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    height: 132,
    width: 132,
  },
});
