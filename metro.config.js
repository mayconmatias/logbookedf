// Metro em JS puro para evitar TS em configs
const { getDefaultConfig } = require("expo/metro-config");
const path = __dirname;

module.exports = (async () => {
  const config = await getDefaultConfig(path);
  return config;
})();
