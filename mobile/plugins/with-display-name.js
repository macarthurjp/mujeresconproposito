// The native project name must be ASCII ("Mujeres con Proposito") so every
// EAS tool derives the same Xcode target name. This plugin keeps the name
// people see on the home screen as "Mujeres con Propósito" on iOS and Android.
const { withInfoPlist, withStringsXml, AndroidConfig } = require('expo/config-plugins');

module.exports = function withDisplayName(config, { displayName }) {
  config = withInfoPlist(config, (c) => {
    c.modResults.CFBundleDisplayName = displayName;
    return c;
  });
  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name' }, _: displayName }],
      c.modResults,
    );
    return c;
  });
  return config;
};
