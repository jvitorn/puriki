import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native';
import { View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/presentation/components/ui/button';
import { Text } from '@/presentation/components/ui/text';

interface ExpandableTextProps {
  text: string;
  collapsedLineCount?: number;
  accessibilityLabel?: string;
}

export function ExpandableText({
  text,
  collapsedLineCount = 4,
  accessibilityLabel,
}: ExpandableTextProps) {
  return (
    <ExpandableTextContent
      key={`${collapsedLineCount}:${text}`}
      accessibilityLabel={accessibilityLabel}
      collapsedLineCount={collapsedLineCount}
      text={text}
    />
  );
}

function ExpandableTextContent({
  text,
  collapsedLineCount = 4,
  accessibilityLabel,
}: ExpandableTextProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const contentOpacity = useSharedValue(1);
  const [canExpand, setCanExpand] = useState(
    text.trim().length > collapsedLineCount * 55,
  );

  const handleMeasurement = (
    event: NativeSyntheticEvent<TextLayoutEventData>,
  ) => setCanExpand(event.nativeEvent.lines.length > collapsedLineCount);

  useEffect(() => {
    contentOpacity.value = reduceMotion ? 1 : 0.65;
    contentOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : 260 });
  }, [contentOpacity, expanded, reduceMotion]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  return (
    <View className="gap-2">
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="pointer-events-none absolute w-full opacity-0"
        onTextLayout={handleMeasurement}
      >
        {text}
      </Text>
      <Animated.View
        layout={LinearTransition.duration(reduceMotion ? 0 : 260)}
        style={contentStyle}
      >
        <Text
          accessibilityLabel={accessibilityLabel ?? t('details.synopsis')}
          className="leading-6 text-muted-foreground"
          numberOfLines={expanded ? undefined : collapsedLineCount}
        >
          {text}
        </Text>
      </Animated.View>
      {canExpand ? (
        <Button
          accessibilityLabel={
            expanded ? t('details.showLess') : t('details.readMore')
          }
          accessibilityState={{ expanded }}
          className="h-11 self-start px-0"
          variant="link"
          onPress={() => setExpanded((current) => !current)}
        >
          <Text>
            {expanded ? t('details.showLess') : t('details.readMore')}
          </Text>
        </Button>
      ) : null}
    </View>
  );
}
