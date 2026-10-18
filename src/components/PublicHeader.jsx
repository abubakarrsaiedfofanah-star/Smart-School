import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const navigation = [
  ['Home', '/'],
  ['School tools', '/features'],
  ['How it works', '/#how-it-works'],
  ['Portals', '/portals'],
  ['Pricing', '/pricing'],
  ['About', '/about'],
  ['Contact', '/contact'],
]

export default function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') closeMenu() }
    // The compact navigation is used up to 1080px; close it if the user
    // scrolls away so its scrim cannot cover the page footer or portal cards.
    const closeOnScroll = () => closeMenu()
    const closeOnDesktop = () => { if (window.innerWidth > 1080) closeMenu() }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', closeOnScroll, { passive: true })
    window.addEventListener('resize', closeOnDesktop)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', closeOnScroll)
      window.removeEventListener('resize', closeOnDesktop)
    }
  }, [])

  return <>
    {menuOpen && <button className="public-menu-scrim" type="button" aria-label="Close navigation menu" onClick={closeMenu} />}
    <header className="nav blue-nav sticky-nav school-nav">
      <Link className="brand school-logo" to="/" aria-label="SmartSchool home">
        <span className="school-brand-mark" aria-hidden="true">S</span>
        <span className="school-brand-name">Smart<span>School</span></span>
      </Link>
      <button className="public-menu" type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls="public-navigation" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>
        {menuOpen ? '\u00d7' : '\u2630'}
      </button>
      <nav id="public-navigation" className={menuOpen ? 'public-nav-open' : ''} aria-label="Main navigation">
        {navigation.map(([label, to]) => {
          const [targetPath, targetHash] = to.split('#')
          const target = targetPath || '/'
          const active = pathname === target && (targetHash ? hash === `#${targetHash}` : (target !== '/' || (!hash && label === 'Home')))
          return <Link key={label} className={active ? 'active' : ''} to={to} onClick={closeMenu}>{label}</Link>
        })}
        <Link className="header-login" to="/login" onClick={closeMenu}>Login</Link>
        <Link className="button small blue-button header-register" to="/register" onClick={closeMenu}>Register school <b aria-hidden="true">→</b></Link>
      </nav>
    </header>
  </>
}
