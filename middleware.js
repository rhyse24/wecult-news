export const config = { matcher: '/' };

function parseLangCookie(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wcn_lang=([^;]+)/);
  return match ? match[1] : null;
}

export default function middleware(request) {
  // If user already has a language preference cookie, respect it
  const langCookie = parseLangCookie(request);
  if (langCookie === 'tr' || langCookie === 'es') {
    const target = new URL(`/${langCookie}`, request.url);
    return Response.redirect(target, 302);
  }

  const acceptLang = (request.headers.get('accept-language') || '').toLowerCase();

  let lang = null;
  if (/\btr\b/.test(acceptLang)) lang = 'tr';
  else if (/\bes\b/.test(acceptLang)) lang = 'es';

  if (!lang) return; // English or unknown → stay on /

  const target = new URL(`/${lang}`, request.url);
  const res = Response.redirect(target, 302);
  res.headers.set(
    'Set-Cookie',
    `wcn_lang=${lang}; Path=/; Max-Age=2592000; SameSite=Lax`
  );
  return res;
}
