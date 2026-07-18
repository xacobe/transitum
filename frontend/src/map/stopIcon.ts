/**
 * Canvas rendering for the bus-stop map sprites: a colored circle with the
 * white bus-stop SVG icon inside. Shared by MiniMap's main "you are here"
 * sprite and the smaller, muted nearby-stop sprite - same drawing, different
 * size/color/stroke. Returns ImageData ready for maplibre's map.addImage().
 */
import busStopSvg from '@tabler/icons/outline/bus-stop.svg?raw'

export async function drawStopIcon(size: number, color: string, strokeWidth: number): Promise<ImageData> {
  const inner = Math.round(size * 0.52)
  const pad   = Math.round((size - inner) / 2)

  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  const svgWhite = busStopSvg.replace(/currentColor/g, '#fff')
  await new Promise<void>((resolve) => {
    const blob = new Blob([svgWhite], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()
    img.onload = () => { ctx.drawImage(img, pad, pad, inner, inner); URL.revokeObjectURL(url); resolve() }
    img.onerror = () => { URL.revokeObjectURL(url); resolve() }
    img.src = url
  })

  return ctx.getImageData(0, 0, size, size)
}
