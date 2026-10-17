import 'server-only';

import { NextResponse } from 'next/server';

import { SIGN_IN_FAILED_MESSAGE, SIGNED_IN_MESSAGE, SSO_POPUP_CHANNEL, type SsoPopupMessage } from '@/lib/auth/sso-popup';

function scriptValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function popupResultPage(error: string | null, fallbackPath: string): NextResponse {
  const message: SsoPopupMessage = error ? { type: SIGN_IN_FAILED_MESSAGE, error } : { type: SIGNED_IN_MESSAGE };
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signing in</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<p>${error ? 'Sign-in did not complete.' : 'Signed in. You can close this window.'}</p>
<script>
(function () {
  try { window.name = ''; } catch (e) {}
  var message = ${scriptValue(message)};
  var fallback = ${scriptValue(fallbackPath)};
  var sent = false;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
      sent = true;
    }
  } catch (e) {}
  try {
    if ('BroadcastChannel' in window) {
      var channel = new BroadcastChannel(${scriptValue(SSO_POPUP_CHANNEL)});
      channel.postMessage(message);
      channel.close();
      sent = true;
    }
  } catch (e) {}
  if (sent) window.close();
  setTimeout(function () { window.location.replace(fallback); }, sent ? 400 : 0);
})();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
