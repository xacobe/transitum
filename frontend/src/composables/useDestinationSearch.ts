import { ref } from 'vue'
import { searchLocal } from '@/services/searchIndex'
import { useCityStore } from '@/stores/city'
import type { SearchResult } from '@/types'

const DEBOUNCE_MS = 150

export function useDestinationSearch() {
  const city = useCityStore()
  const results = ref<SearchResult[]>([])
  const loading = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let requestSeq = 0

  async function runSearch(trimmed: string, mySeq: number): Promise<void> {
    const local = await searchLocal(trimmed, city.activeSlug)
    if (mySeq !== requestSeq) return
    results.value = local
    loading.value = false
  }

  function search(query: string): void {
    clearTimeout(debounceTimer ?? undefined)
    const trimmed = query.trim()
    if (!trimmed) {
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    const mySeq = ++requestSeq
    debounceTimer = setTimeout(() => runSearch(trimmed, mySeq), DEBOUNCE_MS)
  }

  return { results, loading, search }
}
