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

  const activeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(active.value, [0, 1], [0.78, 1]),
    transform: [{ scale: interpolate(active.value, [0, 1], [0.96, 1]) }],
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
      <Animated.View
        className="items-center justify-center gap-0.5"
        style={activeStyle}
        testID={`puriki-tab-content-${route.name}`}
      >
        <View className="h-7 items-center justify-center">
          {options.tabBarIcon?.({
            focused,
            color: focused ? colors.primary : colors.textMuted,
            size: 21,
          })}
        </View>
        <Text
          className="text-[10px] font-bold"
          numberOfLines={1}
          style={{ color: focused ? colors.primary : colors.textMuted }}
        >
          {label}
        </Text>
      </Animated.View>
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
      className="flex-row border-t border-border bg-card px-2 pt-1"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      testID="puriki-tab-bar"
    >
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
  );
}
