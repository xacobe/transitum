# Analytics

Umami dashboard at whatever `VITE_ANALYTICS_URL` points to for your
deployment — custom events for route searches, stop/line views,
favorites, city changes.

To exclude your own browser from tracking:

```js
// In the browser console on your deployment's own domain
localStorage.setItem('umami.disabled', '1')
```

To replace Umami entirely with a different analytics backend, see
[Extending a deployment](/deployment/extending#the-contract)'s `analytics`
field.
