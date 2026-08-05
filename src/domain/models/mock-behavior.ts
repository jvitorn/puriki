export type MockDelayMode = 'none' | 'normal' | 'slow';

export interface MockBehavior {
  delayMode: MockDelayMode;
  forceErrors: boolean;
}

export interface MockBehaviorController {
  getBehavior(): MockBehavior;
  setDelayMode(mode: MockDelayMode): void;
  setForceErrors(enabled: boolean): void;
}
