// Jest setup file for Chrome extension testing

// Mock chrome APIs
const mockChrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: jest.fn(),
    },
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
    },
    update: jest.fn(),
    remove: jest.fn(),
    removeAll: jest.fn(),
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
  },
};

// Set up global chrome object
global.chrome = mockChrome as any;