const fallback = '#2375e1'

export function normalizeBrandColor(value: string | null | undefined): string {
  return /^#[\da-f]{6}$/i.test(value || '') ? value! : fallback
}

export function accessibleBrandColor(value: string | null | undefined): string {
  const color = normalizeBrandColor(value)
  const rgb = (color.slice(1).match(/../g) || []).map(channel => parseInt(channel, 16))
  const luminance = (channels: number[]): number => channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
  let [r, g, b] = rgb
  while ((1.05 / (luminance([r, g, b]) + .05)) < 4.5 && Math.max(r, g, b) > 0) {
    r *= .92; g *= .92; b *= .92
  }
  return hex([r, g, b])
}

function hex(rgb: number[]): string {
  return `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

// Weighted, quantized dominant-color sampling avoids picking transparent pixels,
// near-white backgrounds, or tiny anti-aliased edges as the school brand color.
export async function detectLogoColor(source: string): Promise<string> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = source
  try {
    await image.decode()
  } catch {
    throw new Error('The logo image could not be read. Choose a PNG, JPG, WEBP, or SVG logo.')
  }

  const canvas = document.createElement('canvas')
  const size = 96
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Logo color detection is unavailable in this browser.')
  context.drawImage(image, 0, 0, size, size)
  const pixels = context.getImageData(0, 0, size, size).data
  const buckets = new Map<string, { rgb: number[]; count: number }>()
  const neutralBuckets = new Map<string, { rgb: number[]; count: number }>()

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, alpha] = pixels.slice(i, i + 4)
    if (alpha < 160) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const saturation = max ? (max - min) / max : 0
    if (r > 246 && g > 246 && b > 246) continue
    const rgb = [r, g, b]
    const key = rgb.map(channel => Math.round(channel / 20) * 20).join(',')
    const target = saturation >= 0.16 && max >= 35 ? buckets : neutralBuckets
    const previous = target.get(key) || { rgb: [0, 0, 0], count: 0 }
    previous.rgb = previous.rgb.map((value, index) => value + rgb[index])
    previous.count++
    target.set(key, previous)
  }

  const winner = [...(buckets.size ? buckets : neutralBuckets).values()].sort((a, b) => {
    if (buckets.size) return b.count - a.count
    const score = (bucket: { rgb: number[]; count: number }) => {
      const [red, green, blue] = bucket.rgb.map(channel => channel / bucket.count / 255)
      const lightness = .2126 * red + .7152 * green + .0722 * blue
      return bucket.count * (1 - lightness * .72)
    }
    return score(b) - score(a)
  })[0]
  if (!winner) throw new Error('Could not find a clear brand color in the logo. Choose one manually.')
  return hex(winner.rgb.map(channel => channel / winner.count))
}
