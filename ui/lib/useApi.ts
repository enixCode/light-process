import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import { apiFetch } from './api';

export function useApi<T>(
  key: string | null,
  options?: SWRConfiguration<T>,
): SWRResponse<T> {
  return useSWR<T>(key, (url: string) => apiFetch<T>(url), options);
}
