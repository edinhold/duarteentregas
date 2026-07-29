// OneSignal Web SDK service worker (v16).
//
// Served from its own scope (/onesignal/) so it can never collide with the
// Workbox service worker that powers the PWA at the root scope.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
