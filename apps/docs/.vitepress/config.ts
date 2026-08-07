import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ZwenTS",
  description:
    "Explicit TypeScript backends — Zod routes, middleware, OpenAPI. No decorator DI.",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  head: [
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
    ],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap",
      },
    ],
  ],
  themeConfig: {
    siteTitle: "ZwenTS",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Recipes", link: "/recipes/result" },
      { text: "Reference", link: "/reference/throws" },
      {
        text: "GitHub",
        link: "https://github.com/danielfetico21/ZwenTS",
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Why ZwenTS", link: "/guide/why" },
          ],
        },
        {
          text: "Core",
          items: [
            { text: "App & middleware", link: "/guide/app" },
            { text: "Routes & Zod", link: "/guide/routing" },
            { text: "Errors & Problem Details", link: "/guide/errors" },
            { text: "Result helpers", link: "/guide/result" },
            { text: "Deploy", link: "/guide/deploy" },
          ],
        },
      ],
      "/recipes/": [
        {
          text: "Recipes",
          items: [
            { text: "Result in handlers", link: "/recipes/result" },
            { text: "Graceful shutdown", link: "/recipes/shutdown" },
            { text: "Request bodies", link: "/recipes/body" },
            { text: "OpenTelemetry", link: "/recipes/otel" },
            { text: "Auth (production)", link: "/recipes/auth" },
            { text: "Health & ready", link: "/recipes/health" },
            { text: "Database", link: "/recipes/db" },
            { text: "Redis stores", link: "/recipes/redis" },
            { text: "Access log", link: "/recipes/access-log" },
            { text: "Metrics", link: "/recipes/metrics" },
            { text: "SSE", link: "/recipes/sse" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "What APIs throw", link: "/reference/throws" },
            { text: "API style", link: "/reference/api-style" },
            { text: "Semver contract", link: "/reference/semver" },
            { text: "Security checklist", link: "/reference/security-checklist" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/danielfetico21/ZwenTS" },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3] },
    editLink: {
      pattern:
        "https://github.com/danielfetico21/ZwenTS/edit/main/apps/docs/:path",
      text: "Edit this page",
    },
    footer: {
      message: "Explicit composition. Zod routes. No decorator DI.",
      copyright: "ZwenTS",
    },
  },
});
