export const cacheAccepted = (checkCode: number): boolean => checkCode === 0

export const cacheSave = (pullRequest: boolean): boolean => !pullRequest
