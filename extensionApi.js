const api = globalThis.chrome ?? globalThis.browser;

globalThis.extensionApi = {
  api,
  storageLocal: api?.storage?.local,
  runtimeId: api?.runtime?.id
};
