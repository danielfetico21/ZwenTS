import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
// Side-effect CSS import (VitePress theme).
// oxlint-disable-next-line import/no-unassigned-import -- required by Vite
import "./custom.css";

export default {
  extends: DefaultTheme,
} satisfies Theme;
