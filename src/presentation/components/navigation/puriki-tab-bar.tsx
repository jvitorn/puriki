import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MotionPressable } from '@/presentation/components/ui/motion-pressable';
import { Text } from '@/presentation/components/ui/text';
import { colors } from '@/presentation/theme/tokens';
import { cn } from '@/shared/rnr/utils';

function PurikiTabItem({
  route,
  descriptor,
  focused,
  navigation,
}: {
  route: BottomTabBarProps['state']['routes'][number];
  descriptor: NonNullable<BottomTabBarProps['descriptors'][string]>;
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
}) {
  const reduceMotion = useReducedMotion();
  const active = useSharedValue(focused ? 1 : 0);
  const options = descriptor.options;
  const label = typeof options.title === 'string' ? options.title : route.name;

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, focused, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: interpolate(active.value, [0, 1], [0.75, 1]) }],
  }));

  const navigate = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <MotionPressable
      accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      className="h-14 flex-1 items-center justify-center gap-0.5"
      hitSlop={4}
      onLongPress={() =>
        navigation.emit({ type: 'tabLongPress', target: route.key })
      }
      onPress={navigate}
      testID={options.tabBarButtonTestID}
    >
      <View className="h-8 w-11 items-center justify-center">
        <Animated.View
          pointerEvents="none"
          className="absolute h-8 w-11 rounded-2xl bg-primary"
          style={pillStyle}
        />
        {options.tabBarIcon?.({
          focused,
          color: focused ? colors.foreground : colors.textMuted,
          size: 21,
        })}
      </View>
      <Text
        className={cn(
          'text-[10px] font-extrabold',
          focused ? 'text-foreground' : 'text-muted-foreground',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </MotionPressable>
  );
}

export function PurikiTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  return (
    <View
      className="border-t border-border bg-background px-3 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      testID="puriki-tab-bar"
    >
      <View className="flex-row rounded-[22px] border border-border bg-card px-1 py-1">
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          return descriptor ? (
            <PurikiTabItem
              key={route.key}
              descriptor={descriptor}
              focused={state.index === index}
              navigation={navigation}
              route={route}
            />
          ) : null;
        })}
      </View>
    </View>
  );
}
