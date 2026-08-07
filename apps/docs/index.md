---
layout: home
title: ZwenTS
titleTemplate: Explicit TypeScript backends

hero:
  name: ZwenTS
  text: Backends you can read.
  tagline: Explicit composition, Zod routes, middleware, OpenAPI — without decorator DI or Nest ceremony.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why ZwenTS
      link: /guide/why

features:
  - title: Explicit composition
    details: createApp → use → route. No reflect-metadata, no global modules, no hidden providers.
  - title: Zod at the edge
    details: route() validates params, query, body, and output. Types flow into handlers — and into OpenAPI.
  - title: Problem Details
    details: Stable ErrorCodes and RFC 7807 responses. Distinguish failures by code, not string matching.
  - title: Ops-ready defaults
    details: Body limits, timeouts, drain on shutdown, rate limit, idempotency, OTEL — as opt-in middleware.
---
