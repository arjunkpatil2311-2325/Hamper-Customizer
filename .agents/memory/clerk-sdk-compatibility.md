---
name: Clerk SDK compatibility
description: Resolving Clerk runtime export errors without bypassing package release-age protections.
---

Keep the Clerk React SDK and `@clerk/shared` on a compatible release train. A newer React SDK may require a newer shared-package major, while an older release can reference exports absent from the resolved shared package. If the newest release is blocked by the package firewall, use the newest mature compatible version rather than excluding it from the age guard.

**Why:** Type checks can pass while Vite fails on missing runtime exports, and the package firewall intentionally rejects releases younger than its configured maturity window.

**How to apply:** When Clerk reports a missing named export from `@clerk/shared`, inspect the installed package manifests and release maturity before changing imports or package policies.
