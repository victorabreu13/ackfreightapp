const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// The Cloud Functions code lives in its own folder with its own
// node_modules (deployed separately to Google's servers, never bundled
// into the app). Excluding it stops Metro's file-map crawler from
// touching it at all, which previously triggered the OneDrive
// symlink/readlink bug (see the webchannel-wrapper comment below) on
// other packages too.
config.resolver.blockList = [/[\\/]functions[\\/].*/];

// With Metro's package-exports resolution on, "firebase/auth" can resolve
// to a build whose React Native registration side effects don't run,
// producing "Component auth has not been registered yet" at runtime.
// Disabling it makes Metro fall back to plain "main"/"react-native" field
// resolution, which Firebase's React Native build is designed around.
config.resolver.unstable_enablePackageExports = false;

// @firebase/webchannel-wrapper's "bloom-blob" and "webchannel-blob" subpaths
// point their package.json "browser"/"main" fields at files Metro can't
// load in this SDK version (an ESM file marked "type": "module", or a path
// that Metro's resolver mis-parses). Firestore's React Native entry point
// imports both internally, so we short-circuit resolution for just these
// two subpaths straight to their known-good CommonJS build files, without
// changing how any other package resolves.
const webchannelWrapperOverrides = {
  "@firebase/webchannel-wrapper/bloom-blob": path.resolve(
    __dirname,
    "node_modules/@firebase/webchannel-wrapper/dist/bloom-blob/bloom_blob_es2018.js"
  ),
  "@firebase/webchannel-wrapper/webchannel-blob": path.resolve(
    __dirname,
    "node_modules/@firebase/webchannel-wrapper/dist/webchannel-blob/webchannel_blob_es2018.js"
  ),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const override = webchannelWrapperOverrides[moduleName];
  if (override) {
    return { type: "sourceFile", filePath: override };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
