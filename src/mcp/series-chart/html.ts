// The served view document. Self-contained: one inline <style>, one classic inline <script>, no network loads.
import { VIEW_SCRIPT } from "./view-bundle.generated";

const STYLE = `
:root{color-scheme:light dark;--fg:#1b1f24;--bg:#fff;--muted:#5b6670;--line:#2457c5;--axis:#8a949e}
@media (prefers-color-scheme:dark){:root{--fg:#e8ecf0;--bg:#14181c;--muted:#9aa5b0;--line:#7aa2f7;--axis:#5b6670}}
body{margin:0;padding:12px;font:14px/1.4 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
h1{font-size:16px;margin:0 0 8px}
.msg{color:var(--muted)}
.axis{stroke:var(--axis);stroke-width:1}
svg{display:block;max-width:640px}
.tick{fill:var(--muted);font-size:11px}
@media (max-width:640px){.tick{font-size:20px}}
.line{stroke:var(--line);stroke-width:2}
.marker{fill:var(--line)}
`;

export const VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Series chart</title>
<style>${STYLE}</style>
</head>
<body>
<div id="root"><p class="msg">Waiting for the chart data from the host.</p></div>
<script>${VIEW_SCRIPT}</script>
</body>
</html>
`;
