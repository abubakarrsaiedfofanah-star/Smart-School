export default async function handler(_req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(503).send('School directory is not configured.')
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/get_public_school_profiles`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    if (!response.ok) throw new Error(`Supabase responded with ${response.status}`)
    const schools = await response.json()
    const origin = (process.env.PUBLIC_SITE_URL ? process.env.PUBLIC_SITE_URL.replace(/\/$/, '') : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'smart-school-blue.vercel.app'}`)
    const urls = schools.map(school => `<url><loc>${origin}/school/${encodeURIComponent(school.slug)}</loc></url>`).join('')
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url><url><loc>${origin}/portals</loc></url>${urls}</urlset>`)
  } catch (error) {
    console.error('School sitemap generation failed:', error.message)
    return res.status(503).send('Could not generate the school sitemap.')
  }
}
