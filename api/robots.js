export default function handler(req, res) {
  const origin = process.env.PUBLIC_SITE_URL
    ? process.env.PUBLIC_SITE_URL.replace(/\/$/, '')
    : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host || 'smart-school-blue.vercel.app'}`
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
  return res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /activities\nDisallow: /login\nDisallow: /join-school/\nSitemap: ${origin}/sitemap.xml\n`)
}
