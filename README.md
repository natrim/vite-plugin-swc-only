# vite-plugin-swc-only

Use the [swc](https://swc.rs/) in [vite](https://vitejs.dev/) for transformation and minification.

Hot glued from other plugins.

Only React for now, pulls welcome.

- Don't need `vite-plugin-react`
- Support for `React Fast Refresh` - faster than the `vite-plugin-react` with babel
- Skip `import React`,`React` is dynamically injected
- `swc` minification instead of `esbuild` or `terser` (as minification is sorta unstable, added shortcut `swcMinify` option to fine tune)
- 3 separate plugins for each mode available (serve, build, minify)

- `serve` - applied only in dev (apply: serve), contains `React Fast Refresh`
- `build` - applied only in build mode (apply: build), disables esbuild transform
- `minify` - applied only for minification (disables esbuild, terser minify), overrides `config.minify`

## Installation

```bash
npm i -D vite-plugin-swc-only @swc/core
```

## Usage

```ts
import { defineConfig } from "vite";
import swc from "vite-plugin-swc";

// use all plugins (serve, build, minify)
export default defineConfig({
  plugins: [swc()],
  // or ie. plugins: [swc({minify: false, serve: true, build: false})],
});

// or define each plugin separately
export default defineConfig({
  plugins: [swc.serve(), swc.build(), swc.minify()],
});
```

## Problems

If you use this plugin only for `serve` and/or `minify` and not use `vite-plugin-react`, then you will need to add extra
options for `esbuild` transformation to support React dynamic import.

```ts
import { defineConfig } from "vite";
import swc from "vite-plugin-swc";

// if you use this plugin only in dev mode for fast react refresh
export default defineConfig({
  plugins: [swc.serve()],
  // you will need these settings for automatic react inject in esbuild
  esbuild: {
    jsxFactory: "_jsx",
    jsxFragment: "_jsxFragment",
    jsxInject:
      "import { createElement as _jsx, Fragment as _jsxFragment } from 'react'",
  },
});
```
