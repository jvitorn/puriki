import type { LucideIcon } from 'lucide-react-native';

import { Button } from '@/presentation/components/ui/button';
import { Icon } from '@/presentation/components/ui/icon';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress(): void;
  disabled?: boolean;
  className?: string;
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  className,
}: IconButtonProps) {
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={className}
      disabled={disabled}
      hitSlop={6}
      size="icon"
      variant="outline"
      onPress={onPress}
    >
      <Icon as={icon} className="size-5" />
    </Button>
  );
}
