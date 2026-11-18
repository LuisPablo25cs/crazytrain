import { LANGS, S, setLang, useLang, type Lang } from '../strings.js';

/** English or Spanish, remembered on this device. */
export function LanguagePicker() {
  const lang = useLang();
  return (
    <label className="theme-picker language-picker">
      {S.language}
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {(Object.keys(LANGS) as Lang[]).map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
