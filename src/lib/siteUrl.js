const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_URL || 'https://smart-school-blue.vercel.app'

export const publicAppOrigin = configuredOrigin.replace(/\/+$/, '')
