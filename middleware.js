export const config = { matcher: '/' };

function parseLangCookie(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wcn_lang=([^;]+)/);
  return match ? match[1] : null;
}

function redirect(url, lang, setCookie) {
  const headers = { Location: url };
  if (setCookie) {
    headers['Set-Cookie'] = `wcn_lang=${lang}; Path=/; Max-Age=2592000; SameSite=Lax`;
  }
  return new Response(null, { status: 302, headers });
}

export default function middleware(request) {
  const langCookie = parseLangCookie(request);
  if (langCookie === 'tr' || langCookie === 'es') {
    return redirect(new URL(`/${langCookie}`, request.url).href, langCookie, false);
  }

  const acceptLang = (request.headers.get('accept-language') || '').toLowerCase();

  let lang = null;
  if (/\btr\b/.test(acceptLang)) lang = 'tr';
  else if (/\bes\b/.test(acceptLang)) lang = 'es';

  if (!lang) return;

  return redirect(new URL(`/${lang}`, request.url).href, lang, true);
}
