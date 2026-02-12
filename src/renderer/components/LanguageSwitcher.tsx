import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    i18n.changeLanguage('en');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-active text-text-secondary hover:text-text-primary transition-colors text-sm"
      title="Language: English"
    >
      <Globe className="w-4 h-4" />
      <span>English</span>
    </button>
  );
}
