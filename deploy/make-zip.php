<?php

declare(strict_types=1);

/**
 * Zips a directory for upload to cPanel.
 *
 * PowerShell's Compress-Archive is not usable here. Windows PowerShell 5.1
 * runs on .NET Framework, whose zip writer stores paths with BACKSLASH
 * separators. The ZIP specification requires forward slashes, and cPanel's
 * extractor is one of the many Unix tools that takes it literally: instead of
 * a directory you get a single flat file called `api\.htaccess`. The API then
 * 404s on every route and nothing on the server explains why.
 *
 * ZipArchive writes correct entries, and PHP is already required by the build.
 *
 * --prefix=NAME wraps everything in a top-level folder. Without it, an
 * archive of 6,600 loose files extracts wherever the person happened to be
 * standing -- scattering app/, vendor/ and artisan across their home
 * directory, which is miserable to undo through a File Manager. With it,
 * extracting anywhere puts the tree in NAME/ and there is nothing to get
 * wrong.
 *
 * Any further arguments are entries that MUST exist in the finished archive;
 * the script exits non-zero if one is absent. Worth checking rather than
 * assuming, because the files most likely to go missing are the dotfiles the
 * whole deployment depends on.
 *
 * Usage: php make-zip.php <source-dir> <target.zip> [--prefix=NAME] [entry...]
 */

$arguments = array_slice($argv, 1);
$prefix = '';

foreach ($arguments as $index => $argument) {
    if (str_starts_with($argument, '--prefix=')) {
        $prefix = rtrim(substr($argument, 9), '/').'/';

        unset($arguments[$index]);
    }
}

$arguments = array_values($arguments);

$source = $arguments[0] ?? null;
$target = $arguments[1] ?? null;
$required = array_slice($arguments, 2);

if ($source === null || $target === null) {
    fwrite(STDERR, "Usage: php make-zip.php <source-directory> <target.zip>\n");
    exit(1);
}

$source = realpath($source);

if ($source === false || ! is_dir($source)) {
    fwrite(STDERR, "Not a directory: {$argv[1]}\n");
    exit(1);
}

if (is_file($target)) {
    unlink($target);
}

$zip = new ZipArchive;

if ($zip->open($target, ZipArchive::CREATE) !== true) {
    fwrite(STDERR, "Could not create {$target}\n");
    exit(1);
}

$files = new RecursiveIteratorIterator(
    // SKIP_DOTS drops "." and ".." only -- .htaccess and .gitignore are
    // ordinary files to the iterator and must survive, since they are exactly
    // what the deployment depends on.
    new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST,
);

$count = 0;

foreach ($files as $file) {
    /** @var SplFileInfo $file */
    $local = $prefix.str_replace('\\', '/', substr($file->getPathname(), strlen($source) + 1));

    if ($file->isDir()) {
        // Empty directories vanish otherwise, and Laravel fails on a missing
        // storage path the first time it tries to write a log.
        $zip->addEmptyDir($local);

        continue;
    }

    $zip->addFile($file->getPathname(), $local);
    $count++;
}

$zip->close();

if ($required !== []) {
    $check = new ZipArchive;
    $check->open($target);

    $missing = array_values(array_filter(
        $required,
        static fn (string $entry): bool => $check->locateName($entry) === false,
    ));

    $check->close();

    if ($missing !== []) {
        fwrite(STDERR, 'MISSING from '.basename($target).': '.implode(', ', $missing)."\n");
        exit(1);
    }
}

printf("    %s  (%d files, %.1f MB)\n", basename($target), $count, filesize($target) / 1048576);
