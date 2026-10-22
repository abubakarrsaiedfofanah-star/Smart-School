import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

export default function PublicSchoolPortal() {
  const { schoolSlug } = useParams()
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setLoading(false); return }
      const { data, error } = await supabase.rpc('get_public_school_profile', { p_school_slug: schoolSlug })
      if (!live) return
      setSchool(error ? null : Array.isArray(data) ? data[0] || null : data || null)
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [schoolSlug])

  useEffect(() => {
    if (!school) return undefined
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.content
    const canonical = document.querySelector('link[rel="canonical"]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }))
    const previousCanonical = canonical.href
    document.title = `${school.name} | School Portal`
    if (description) description.content = `${school.name} school portal. Find school information, sign in, or register for a school account.`
    canonical.href = `${window.location.origin}/school/${encodeURIComponent(school.slug)}`
    return () => {
      document.title = previousTitle
      if (description && previousDescription) description.content = previousDescription
      canonical.href = previousCanonical
    }
  }, [school])

  return <div className="public-site school-home">
    <PublicHeader />
    <main className="public-page-shell" style={{ maxWidth: 980, margin: '0 auto', padding: '64px 20px', minHeight: '55vh' }}>
      {loading ? <section className="school-public-card" style={{ minHeight: 0 }}><p>Loading school portal…</p></section>
        : !school ? <section className="school-public-card" style={{ minHeight: 0 }}><p className="eyebrow">SCHOOL PORTAL</p><h1>School not found</h1><p>This school portal is unavailable.</p><Link to="/portals">Find a school</Link></section>
          : <section className="school-public-card" style={{ minHeight: 0, display: 'block', padding: 'clamp(24px, 6vw, 56px)' }}>
            <p className="eyebrow">OFFICIAL SCHOOL PORTAL</p><h1>{school.name}</h1>
            <p>{school.school_level ? `${school.school_level} school` : 'School community portal'}{school.address ? ` · ${school.address}` : ''}</p>
            <p>Find the school portal for learners, families, and staff. Sign in to your account or request access from this school.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
              <Link className="button blue-button" to={`/login?school=${encodeURIComponent(school.slug)}`}>Sign in</Link>
              <Link className="outline-button" to={`/join-school/${encodeURIComponent(school.slug)}`}>Register for this school</Link>
            </div>
          </section>}
    </main>
    <PublicFooter />
  </div>
}
