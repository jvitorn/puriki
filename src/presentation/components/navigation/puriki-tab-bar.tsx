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
  FadeIn,
} from 'react-native-reanimated';

import { MotionPressable } from '@/presentation/components/ui/motion-pressable';
import { Text } from '@/presentation/components/ui/text';
import { colors } from '@/presentation/theme/tokens';
import { cn } from '@/shared/rnr/utils';

type TabEdgeAlign = 'start' | 'center' | 'end';

function PurikiTabItem({
  route,
  descriptor,
  focused,
  navigation,
  edgeAlign,
}: {
  route: BottomTabBarProps['state']['routes'][number];
  descriptor: NonNullable<BottomTabBarProps['descriptors'][string]>;
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
  edgeAlign: TabEdgeAlign;
}) {
  const reduceMotion = useReducedMotion();
  const active = useSharedValue(focused ? 1 : 0);
  const options = descriptor.options;
  const label = typeof options.title === 'string' ? options.title : route.name;
  const activeWidth = Math.min(144, Math.max(88, label.length * 7 + 58));

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, focused, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(active.value, [0, 1], [48, activeWidth]),
    backgroundColor: active.value > 0.01 ? colors.primary : 'rgba(0, 0, 0, 0)',
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
    <View className="h-16 flex-1 items-center justify-center overflow-visible">
      <MotionPressable
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        className={cn(
          'h-12 w-full justify-center overflow-visible',
          edgeAlign === 'start' && 'items-start',
          edgeAlign === 'end' && 'items-end',
          edgeAlign === 'center' && 'items-center',
        )}
        hitSlop={4}
        onLongPress={() =>
          navigation.emit({ type: 'tabLongPress', target: route.key })
        }
        onPress={navigate}
        testID={options.tabBarButtonTestID}
      >
        <Animated.View
          pointerEvents="none"
          className="absolute h-11 flex-row items-center justify-center gap-2 rounded-full"
          style={[
            pillStyle,
            edgeAlign === 'start' && { left: 0 },
            edgeAlign === 'end' && { right: 0 },
          ]}
        >
          {options.tabBarIcon?.({
            focused,
            color: focused ? colors.foreground : colors.textMuted,
            size: 22,
          })}
          {focused ? (
            <Animated.View
              entering={FadeIn.duration(reduceMotion ? 0 : 220)}
              className="overflow-hidden"
            >
              <Text
                className="text-[13px] font-extrabold text-foreground"
                numberOfLines={1}
              >
                {label}
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </MotionPressable>
    </View>
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
      className="border-t border-border bg-background px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      testID="puriki-tab-bar"
    >
      <View className="h-16 flex-row overflow-visible rounded-[26px] border border-border bg-card px-1">
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const edgeAlign: TabEdgeAlign =
            index === 0
              ? 'start'
              : index === state.routes.length - 1
                ? 'end'
                : 'center';
          return descriptor ? (
            <PurikiTabItem
              key={route.key}
              descriptor={descriptor}
              edgeAlign={edgeAlign}
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
