<?php
// Thin CORS proxy for the GFZ Potsdam Hp30/ap30 nowcast feed.
// Upload alongside index.html — no configuration needed.
//
// Why: kp.gfz.de sends no Access-Control-Allow-Origin, so browsers block a
// direct fetch from a different host. This pass-through fixes CORS and adds a
// 15-minute server-side cache so the upstream is never hit more than ~4× per
// hour regardless of viewer count. Hp30 itself is a 30-min cadence index, so
// 15 min is the right Nyquist.
//
// Source: GFZ Helmholtz Centre for Geosciences (Yamazaki et al. 2024,
// DOI 10.5880/Hpo.0003, CC BY 4.0). The data licence travels with the body —
// the GFZ file header carries the attribution this proxy serves unmodified.

$upstream = 'https://kp.gfz.de/fileadmin/files_for_gfz_cms/Hp30_ap30_nowcast.txt';
$cache    = sys_get_temp_dir() . '/aegis_hp30_nowcast.txt';
$ttl      = 900; // 15 min

$body = null;
if (is_file($cache) && (time() - filemtime($cache)) < $ttl) {
    $body = @file_get_contents($cache);
}
if ($body === null || $body === false) {
    $ctx  = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true,
        'header' => "User-Agent: AEGIS-Hp30-proxy/1.0\r\n"]]);
    $fresh = @file_get_contents($upstream, false, $ctx);
    if ($fresh !== false && strlen($fresh) > 1024) {
        @file_put_contents($cache, $fresh);
        $body = $fresh;
    } elseif (is_file($cache)) {
        // Upstream failed but a stale cache exists — serve it rather than 502.
        // Hp30 changes slowly enough that an hour-old value is still useful.
        $body = @file_get_contents($cache);
    }
}
if ($body === null || $body === false) { http_response_code(502); exit; }
header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=' . $ttl);
echo $body;
