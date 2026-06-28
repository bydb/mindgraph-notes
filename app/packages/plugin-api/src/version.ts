// Versionssaat für das spätere Manifest-`apiVersion`/Kompatibilitäts-Gate (Store-Plan S7).
//
// MUSS mit der `version` in package.json übereinstimmen — der Drift-Test (version.test.ts)
// koppelt beide, damit sie nicht auseinanderlaufen. Bei einem Versions-Bump beide Stellen ändern.
export const API_VERSION = '0.1.0'
