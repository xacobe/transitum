import { computed, type Ref } from 'vue'

export function useOfflineError(error: Ref<unknown>) {
  return computed(() => (error.value as { offline?: boolean } | null)?.offline === true)
}
