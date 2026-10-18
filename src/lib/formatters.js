const localeByCurrency = { KES: 'en-KE', SLE: 'en-SL', UGX: 'en-UG', TZS: 'en-TZ', GHS: 'en-GH', NGN: 'en-NG', RWF: 'en-RW', ZMW: 'en-ZM', MWK: 'en-MW', ZAR: 'en-ZA', LRD: 'en-LR', GMD: 'en-GM', XOF: 'fr-SN', XAF: 'fr-CM', ETB: 'en-ET', EGP: 'ar-EG', USD: 'en-US', GBP: 'en-GB' }

export function formatCurrency(amount, currencyCode = 'KES', language = 'en') {
  const code = /^[A-Z]{3}$/.test(currencyCode || '') ? currencyCode : 'KES'
  const locale = language === 'sw' && code === 'KES' ? 'sw-KE' : (localeByCurrency[code] || 'en')
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(amount) || 0)
  } catch {
    return `${code} ${(Number(amount) || 0).toLocaleString()}`
  }
}
