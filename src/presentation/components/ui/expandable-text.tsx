import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native';
import { View } from 'react-native';

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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(
    text.trim().length > collapsedLineCount * 55,
  );

  const handleMeasurement = (
    event: NativeSyntheticEvent<TextLayoutEventData>,
  ) => setCanExpand(event.nativeEvent.lines.length > collapsedLineCount);

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
      <Text
        accessibilityLabel={accessibilityLabel ?? t('details.synopsis')}
        className="leading-6 text-muted-foreground"
        numberOfLines={expanded ? undefined : collapsedLineCount}
      >
        {text}
      </Text>
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
