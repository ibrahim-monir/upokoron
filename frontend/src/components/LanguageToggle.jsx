import { cx } from '../lib/format'
import { useTranslation } from '../lib/i18n'
import { useLocaleStore } from '../stores/localeStore'

/**
 * Bangla/English switch for the storefront header.
 *
 * Both options sit in view rather than one button that silently flips --
 * a shopper glancing at it can tell which language is active without
 * having to click first and see what changes.
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
        'flex items-center gap-0.5 rounded-full border border-white/25 bg-white/10 p-0.5 text-xs font-bold',
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
          locale === 'bn' ? 'bg-white text-brand-800' : 'text-white/80 hover:text-white',
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
          locale === 'en' ? 'bg-white text-brand-800' : 'text-white/80 hover:text-white',
        )}
      >
        EN
      </button>
    </div>
  )
}
