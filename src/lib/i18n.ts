import type { Lang } from '../types'

const translations: Record<Lang, Record<string, any>> = {
  en: (await import('../i18n/en.json')).default,
  tr: (await import('../i18n/tr.json')).default,
  es: (await import('../i18n/es.json')).default,
  pt: (await import('../i18n/pt.json')).default,
  ja: (await import('../i18n/ja.json')).default,
}

export const SUPPORTED_LANGS: Lang[] = ['en', 'tr']
export const DEFAULT_LANG: Lang = 'en'

export function getLangFromUrl(url: URL): Lang {
  const base = import.meta.env.BASE_URL // '/news/'
  const withoutBase = url.pathname.startsWith(base)
    ? url.pathname.slice(base.length - 1) // keep leading slash
    : url.pathname
  const [, lang] = withoutBase.split('/')
  if (SUPPORTED_LANGS.includes(lang as Lang)) return lang as Lang
  return DEFAULT_LANG
}

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const keys = key.split('.')
  let value: any = translations[lang]
  for (const k of keys) {
    value = value?.[k]
  }
  if (typeof value !== 'string') return key
  if (!vars) return value
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
    value
  )
}

export function getLocalizedPath(lang: Lang, path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') // '/news'
  if (lang === DEFAULT_LANG) return `${base}${path}`
  return `${base}/${lang}${path}`
}
