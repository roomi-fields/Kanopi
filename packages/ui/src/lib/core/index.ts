export * from '../core-mock/types';
import { createRealCore } from '../core-real';
import type { CoreApi } from '../core-mock/types';

export const core: CoreApi = createRealCore();
