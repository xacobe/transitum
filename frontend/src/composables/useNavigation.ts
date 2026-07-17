import { useRouter } from 'vue-router'

export function useNavigation() {
  const router = useRouter()

  function openStop(stopId: string) {
    router.push({ name: 'stop', params: { stopId } })
  }

  function openLine(shortName: string) {
    router.push({ name: 'line', params: { shortName } })
  }

  return { openStop, openLine }
}
