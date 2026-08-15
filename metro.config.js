const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = config.resolver;

config.transformer.babelTransformerPath =
  require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = assetExts.filter(
  (extension) => extension !== 'svg',
);
config.resolver.sourceExts = [...sourceExts, 'svg'];

module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
