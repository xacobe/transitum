import { ref } from 'vue'
import { customization } from '@/customization'
import type { ReportPayload } from '@/customization'

export type { ReportPayload }

// Default backend - PocketBase. Kept as a dynamic import so the PocketBase
// client stays a lazy chunk that's never fetched when a deployment
// overrides submitReport (see contract.ts).
async function defaultSubmit(payload: ReportPayload): Promise<void> {
  const { pbPost } = await import('@/services/pocketbaseClient')
  await pbPost('/collections/reports/records', { status: 'new', ...payload })
}

export function useReports() {
  const submitting = ref(false)
  const submitted = ref(false)
  const error = ref<string | null>(null)

  async function submitReport(payload: ReportPayload): Promise<void> {
    submitting.value = true
    submitted.value = false
    error.value = null
    try {
      await (customization.submitReport ?? defaultSubmit)(payload)
      submitted.value = true
    } catch (e) {
      error.value = (e as Error).message || 'Failed to submit report'
    } finally {
      submitting.value = false
    }
  }

  function reset(): void {
    submitted.value = false
    error.value = null
  }

  return { submitting, submitted, error, submitReport, reset }
}
