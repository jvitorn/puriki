import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  NativeTranslationRequest,
  NativeTranslationResult,
} from './PurikukiTranslation.types';

export declare class NativePurikukiTranslationModule extends NativeModule {
  translateAsync(
    options: NativeTranslationRequest,
  ): Promise<NativeTranslationResult>;
}

export default requireOptionalNativeModule<NativePurikukiTranslationModule>(
  'PurikukiTranslation',
);
