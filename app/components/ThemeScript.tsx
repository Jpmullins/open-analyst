import { themeBlockingScript } from "~/lib/theme";

/**
 * Blocking inline script that applies the saved theme before first paint.
 * Render this in <head> to prevent flash of wrong theme on hard refresh.
 */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeBlockingScript }}
    />
  );
}
