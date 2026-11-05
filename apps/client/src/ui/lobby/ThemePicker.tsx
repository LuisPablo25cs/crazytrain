import { useTheme } from '../../theme/ThemeProvider.js';
import { S } from '../strings.js';

export function ThemePicker() {
  const { theme, themes, setTheme } = useTheme();
  return (
    <label className="theme-picker">
      {S.theme}
      <select value={theme.id} onChange={(e) => setTheme(e.target.value)}>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
