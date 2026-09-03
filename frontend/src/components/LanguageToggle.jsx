import { cx } from '../lib/format'
import { useTranslation } from '../lib/i18n'
import { useLocaleStore } from '../stores/localeStore'

/**
 * Bangla/English switch for the storefront header.
 *
 * Both options sit in view rather than one button that silently flips --
 * a shopper glancing at it can tell which language is active without
 * having to click first and see what changes.
 *
 * Every colour here comes from the header tokens, which are derived from the
 * bar's own brightness (lib/theme.js). The active pill is the ink itself with
 * the bar colour as its text, so the pair is guaranteed to read whatever the
 * shop paints the header -- the white-on-white it used to be only worked
 * while that bar was navy.
 */
export function LanguageToggle({ className }) {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const { t } = useTranslation()

  return (
    <div
      role="group"
      aria-label={t('header.language')}
      className={cx(
        'flex items-center gap-0.5 rounded-full border border-header-line bg-header-line p-0.5 text-xs font-bold',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLocale('bn')}
        aria-pressed={locale === 'bn'}
        title={t('header.switchToBangla')}
        className={cx(
          'rounded-full px-2 py-1 transition-colors',
          locale === 'bn' ? 'bg-header-ink text-header' : 'text-header-muted hover:text-header-ink',
        )}
      >
        বাং
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        title={t('header.switchToEnglish')}
        className={cx(
          'rounded-full px-2 py-1 transition-colors',
          locale === 'en' ? 'bg-header-ink text-header' : 'text-header-muted hover:text-header-ink',
        )}
      >
        EN
      </button>
    </div>
  )
}
