import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const navigation = [
  ['Home', '/'],
  ['Services', '/services'],
  ['Portals', '/portals'],
  ['Pricing', '/pricing'],
  ['About', '/about'],
  ['Contact', '/contact'],
]

export default function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const closeMenu = () => setMenuOpen(false)
  const handleHomeClick = () => {
    closeMenu()
    if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') closeMenu() }
    const closeOnDesktop = () => { if (window.innerWidth > 1080) closeMenu() }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnDesktop)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnDesktop)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [menuOpen])

  return <>
    {menuOpen && <button className="public-menu-scrim" type="button" aria-label="Close navigation menu" onClick={closeMenu} />}
    <header className="nav blue-nav sticky-nav school-nav">
      <Link className="brand school-logo" to="/" onClick={handleHomeClick} aria-label="SmartSchool home">
        <img className="platform-logo" src="/smartschool-logo.svg" alt="" aria-hidden="true" />
      </Link>
      <button className="public-menu" type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls="public-navigation" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>
        {menuOpen ? '\u00d7' : '\u2630'}
      </button>
      <nav id="public-navigation" className={menuOpen ? 'public-nav-open' : ''} aria-label="Main navigation">
        {navigation.map(([label, to]) => {
          const [targetPath, targetHash] = to.split('#')
          const target = targetPath || '/'
          const active = pathname === target && (targetHash ? hash === `#${targetHash}` : (target !== '/' || (!hash && label === 'Home')))
          return <Link key={label} className={active ? 'active' : ''} to={to} onClick={() => { closeMenu(); if (target === '/' && pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{label}</Link>
        })}
        <Link className="header-login" to="/portals" onClick={closeMenu}>Login</Link>
        <Link className="button small blue-button header-register" to="/register" onClick={closeMenu}>Register school <b aria-hidden="true">→</b></Link>
      </nav>
    </header>
  </>
}
