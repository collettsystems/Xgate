const api = globalThis.browser ?? globalThis.chrome;

globalThis.extensionApi = {
  api,
  storageLocal: api?.storage?.local,
  runtimeId: api?.runtime?.id
};
