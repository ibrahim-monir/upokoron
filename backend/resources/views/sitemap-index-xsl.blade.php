<?php echo '<?xml version="1.0" encoding="UTF-8"?>'; ?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Sitemap index</title>
<style>
    body { margin: 0; padding: 2.5rem 1.5rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a202c; background: #f7fafc; }
    .wrap { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 1.375rem; margin: 0 0 0.25rem; }
    p.lede { color: #718096; margin: 0 0 1.5rem; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    th { text-align: left; padding: 0.65rem 1rem; background: #edf2f7; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: #4a5568; }
    td { padding: 0.65rem 1rem; border-top: 1px solid #e2e8f0; font-size: 0.9rem; }
    a { color: #2563eb; text-decoration: none; word-break: break-all; }
    a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="wrap">
<h1>Sitemap index</h1>
<p class="lede"><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/> sub-sitemap(s). Click one to see the URLs it lists.</p>
<table>
<tr><th>Sitemap</th></tr>
<xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
<tr>
<td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
</tr>
</xsl:for-each>
</table>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
