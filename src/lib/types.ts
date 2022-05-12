export type BetterPrCache = {
    version: string;
    username?: string;
    password?: BetterPrCachePassword;
    workspace?: BetterPrCacheWorkspace;
    repositories?: Array<BetterPrCacheRepository>;
};

export type BetterPrCachePassword = {
    iv: string;
    content: string;
};

export type BetterPrCacheWorkspace = {
    uuid: string;
    name: string;
};

export type BetterPrCacheRepository = {
    uuid: string;
    name: string;
};

export type RegistryResponse = {
    'dist-tags': {
        latest: string;
    };
};
