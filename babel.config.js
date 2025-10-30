module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    
    // ADICIONE ISTO:
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./src"
          }
        }
      ]
    ]
  };
};