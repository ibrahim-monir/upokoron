<?php echo '<?xml version="1.0" encoding="UTF-8"?>'; ?>
<?php echo '<?xml-stylesheet type="text/xsl" href="/sitemap-index.xsl"?>'; ?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
@foreach ($refs as $ref)
    <sitemap>
        <loc>{{ $ref }}</loc>
    </sitemap>
@endforeach
</sitemapindex>
