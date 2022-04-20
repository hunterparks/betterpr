export const compareVersions = (version1: string, version2: string): number => {
    const v1 = version1.split(".").map((part) => +part);
    const v2 = version2.split(".").map((part) => +part);

    for (let [index, value] of v1.entries()) {
        const item1 = value;
        const item2 = v2[index];
        if (item1 > item2) {
            return 1;
        } else if (item1 < item2) {
            return -1;
        }
    }
    return 0;
};
