declare const mockChrome: {
    runtime: {
        onInstalled: {
            addListener: jest.Mock<any, any, any>;
        };
        sendMessage: jest.Mock<any, any, any>;
        onMessage: {
            addListener: jest.Mock<any, any, any>;
        };
    };
    tabs: {
        query: jest.Mock<any, any, any>;
        create: jest.Mock<any, any, any>;
    };
    storage: {
        local: {
            get: jest.Mock<any, any, any>;
            set: jest.Mock<any, any, any>;
            remove: jest.Mock<any, any, any>;
        };
        sync: {
            get: jest.Mock<any, any, any>;
            set: jest.Mock<any, any, any>;
            remove: jest.Mock<any, any, any>;
        };
    };
    action: {
        onClicked: {
            addListener: jest.Mock<any, any, any>;
        };
    };
    contextMenus: {
        create: jest.Mock<any, any, any>;
        onClicked: {
            addListener: jest.Mock<any, any, any>;
        };
    };
};
