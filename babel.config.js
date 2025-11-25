module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './src' },
        },
      ],
      // O Reanimated DEVE ser o último item do array
      'react-native-reanimated/plugin',
    ],
  };
};