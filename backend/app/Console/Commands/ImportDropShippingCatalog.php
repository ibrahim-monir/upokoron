<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Catalog\Import\DropShippingCatalog;
use App\Services\Catalog\Import\DropShippingCatalogImporter;
use Illuminate\Console\Command;

class ImportDropShippingCatalog extends Command
{
    protected $signature = 'dropshipping:import-catalog';

    protected $description = 'Import the complete DropShipping.com.bd catalog as unpublished drafts';

    public function handle(DropShippingCatalog $catalog, DropShippingCatalogImporter $importer): int
    {
        $totals = ['created' => 0, 'skipped' => 0, 'failed' => 0];

        try {
            foreach ($catalog->allPages() as $batch) {
                $this->info("Reading supplier page {$batch['page']} of {$batch['last_page']}...");
                $summary = $importer->importProducts($batch['products']);

                foreach (array_keys($totals) as $key) $totals[$key] += $summary[$key];
                foreach ($summary['errors'] as $error) $this->warn($error);
            }
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());
            return self::FAILURE;
        }

        $this->newLine();
        $this->info("Drafts created: {$totals['created']}; already imported: {$totals['skipped']}; failed: {$totals['failed']}.");
        $this->warn('Supplier category IDs are grouped under inactive placeholder categories. Review category names and variants before publishing drafts.');

        return $totals['failed'] === 0 ? self::SUCCESS : self::FAILURE;
    }
}
