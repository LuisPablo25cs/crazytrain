import { useTheme } from '../../theme/ThemeProvider.js';
import { S, T } from '../strings.js';

export function ThemePicker() {
  const { theme, themes, setTheme } = useTheme();
  // Nothing to choose while only one theme is offered.
  if (themes.length < 2) return null;
  return (
    <label className="theme-picker">
      {S.theme}
      <select value={theme.id} onChange={(e) => setTheme(e.target.value)}>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {T.themes[t.id] ?? t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
