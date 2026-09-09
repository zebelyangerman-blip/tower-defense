(function (global) {
  'use strict';
  // Local bootstrap metadata keeps the VK SDK transport explicit in the release package
  // while the real Bridge payload is requested only inside a VK/OK launch environment.
  global.TD_VK_BRIDGE_SDK_URL = 'https://unpkg.com/@vkontakte/vk-bridge@2.14.0/dist/browser.min.js';
})(window);
