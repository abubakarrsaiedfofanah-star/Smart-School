const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

function siteOrigin(req) {
  const configured = process.env.PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  return `${protocol}://${host}`
}

async function getSchool(slug) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('School directory is not configured.')
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/get_public_school_profile`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_school_slug: slug }),
  })
  if (!response.ok) throw new Error('School directory request failed.')
  const school = await response.json()
  return Array.isArray(school) ? school[0] || null : school
}

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim()
  if (!slug || slug.length > 120) return res.status(404).send('School not found')
  let school
  try { school = await getSchool(slug) } catch (error) {
    console.error('Public school page lookup failed:', error.message)
    return res.status(503).send('School portal is temporarily unavailable')
  }
  if (!school) return res.status(404).send('School not found')

  const origin = siteOrigin(req)
  const canonical = `${origin}/school/${encodeURIComponent(school.slug)}`
  const title = `${school.name} | School Portal`
  const summary = `${school.name}${school.school_level ? ` is a ${school.school_level} school` : ' school portal'}${school.address ? ` in ${school.address}` : ''}. Find the official school portal, sign in, or register for an account.`
  const data = JSON.stringify({ '@context': 'https://schema.org', '@type': 'School', name: school.name, url: canonical, address: school.address ? { '@type': 'PostalAddress', streetAddress: school.address } : undefined }).replace(/</g, '\\u003c')
  const safeName = escapeHtml(school.name)
  const safeSummary = escapeHtml(summary)
  const safeCanonical = escapeHtml(canonical)
  const login = `/login?school=${encodeURIComponent(school.slug)}`
  const signup = `/join-school/${encodeURIComponent(school.slug)}`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
  return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${safeSummary}"><link rel="canonical" href="${safeCanonical}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${safeSummary}"><meta property="og:url" content="${safeCanonical}"><meta name="twitter:card" content="summary"><script type="application/ld+json">${data}</script><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;color:#17324b;background:#f5f8fc}.wrap{max-width:820px;margin:10vh auto;padding:32px}main{background:#fff;border:1px solid #dce6f0;border-radius:20px;padding:clamp(24px,6vw,56px);box-shadow:0 16px 50px #17324b12}.eyebrow{color:#42647e;text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;font-weight:700}h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.12;margin:.5rem 0 1rem}p{color:#526a7f}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}a{display:inline-block;padding:11px 18px;border-radius:9px;text-decoration:none;font-weight:700}.primary{background:#1557a0;color:white}.secondary{border:1px solid #cad8e5;color:#17324b}.brand{margin-top:18px;font-size:.84rem}</style></head><body><div class="wrap"><main><p class="eyebrow">Official school portal</p><h1>${safeName}</h1><p>${school.school_level ? `${escapeHtml(school.school_level)} school` : 'School community portal'}${school.address ? ` · ${escapeHtml(school.address)}` : ''}</p><p>Access the school portal for learning, family updates, and school services. Students, parents, and staff can sign in or request an account from this school.</p><div class="actions"><a class="primary" href="${login}">Sign in to ${safeName}</a><a class="secondary" href="${signup}">Register for this school</a></div><p class="brand">School portal powered by SmartSchool</p></main></div></body></html>`)
}
