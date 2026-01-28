import { normalizeProviderKey } from '../utils/providerUtils.js';
import googleAdapter from './googleAdapter.js';

const ADAPTERS = {
  vertex: googleAdapter,
};

export function getProviderAdapter(profile) {
  if (!profile) {
    const err = new Error('profile_required');
    err.code = 'PROFILE_REQUIRED';
    throw err;
  }
  const key = normalizeProviderKey(profile.provider);
  const adapter = ADAPTERS[key];
  if (!adapter) {
    const err = new Error(`provider_adapter_missing:${key}`);
    err.code = 'PROVIDER_ADAPTER_MISSING';
    throw err;
  }
  return adapter;
}

export default {
  getProviderAdapter,
};
