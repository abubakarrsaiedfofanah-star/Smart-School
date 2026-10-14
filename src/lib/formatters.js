const localeByCurrency = { KES: 'en-KE', UGX: 'en-UG', TZS: 'en-TZ', USD: 'en-US' }

export function formatCurrency(amount, currencyCode = 'KES', language = 'en') {
  const code = ['KES', 'UGX', 'TZS', 'USD'].includes(currencyCode) ? currencyCode : 'KES'
  const locale = language === 'sw' ? 'sw-KE' : localeByCurrency[code]
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(amount) || 0)
  } catch {
    return `${code} ${(Number(amount) || 0).toLocaleString()}`
  }
}
