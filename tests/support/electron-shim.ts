export const app = {
  getPath: () => '/tmp/open-analyst',
  getVersion: () => '0.0.0',
  isPackaged: false,
  disableHardwareAcceleration: () => {},
};

export const BrowserWindow = class {
  static getFocusedWindow() {
    return null;
  }
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
  showSaveDialog: async () => ({ canceled: true, filePath: '' }),
};

export const shell = {
  openExternal: async () => true,
  showItemInFolder: async () => true,
};

export const ipcMain = {
  on: () => {},
  handle: () => {},
};

export const contextBridge = {
  exposeInMainWorld: () => {},
};

export const ipcRenderer = {
  send: () => {},
  on: () => {},
  removeListener: () => {},
  invoke: async () => undefined,
};
