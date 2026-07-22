import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useNavigation } from './useNavigation'

function withRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div/>' } },
      { path: '/stop/:stopId', name: 'stop', component: { template: '<div/>' } },
      { path: '/lines/:shortName', name: 'line', component: { template: '<div/>' } },
    ],
  })
  const app = createApp({})
  app.use(router)
  return { router, nav: app.runWithContext(() => useNavigation()) }
}

describe('useNavigation', () => {
  beforeEach(() => {
    // Clear any history state left by a previous test's real navigations.
    window.history.replaceState(null, '')
  })

  it('openStop navigates to the stop route with the given stopId param', async () => {
    const { router, nav } = withRouter()
    await router.isReady()
    const pushSpy = vi.spyOn(router, 'push')
    nav.openStop('bilbao:123')
    await pushSpy.mock.results[0].value
    expect(router.currentRoute.value.name).toBe('stop')
    expect(router.currentRoute.value.params.stopId).toBe('bilbao:123')
  })

  it('openLine navigates to the line route with the given shortName param', async () => {
    const { router, nav } = withRouter()
    await router.isReady()
    const pushSpy = vi.spyOn(router, 'push')
    nav.openLine('23')
    await pushSpy.mock.results[0].value
    expect(router.currentRoute.value.name).toBe('line')
    expect(router.currentRoute.value.params.shortName).toBe('23')
  })

  it('goBack calls router.back() when there is in-app history to return to', () => {
    const { router, nav } = withRouter()
    window.history.replaceState({ back: '/somewhere' }, '')
    const backSpy = vi.spyOn(router, 'back').mockImplementation(() => {})
    nav.goBack('home')
    expect(backSpy).toHaveBeenCalledOnce()
  })

  it('goBack falls back to a named route when there is no in-app history', async () => {
    const { router, nav } = withRouter()
    await router.isReady()
    await router.push({ name: 'stop', params: { stopId: 'x' } }) // start somewhere other than the fallback target
    window.history.replaceState({ back: null }, '')
    const pushSpy = vi.spyOn(router, 'push')
    nav.goBack('home')
    await pushSpy.mock.results[0].value
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('goBack falls back to a custom function when there is no in-app history', () => {
    const { nav } = withRouter()
    window.history.replaceState({ back: null }, '')
    const fallback = vi.fn()
    nav.goBack(fallback)
    expect(fallback).toHaveBeenCalledOnce()
  })
})
