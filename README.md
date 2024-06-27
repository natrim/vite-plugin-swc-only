# vite-plugin-swc-only

Use the [swc](https://swc.rs/) in [vite](https://vitejs.dev/) for transformation and minification.

# DEPRECATED
no longer developed as Vite has offical [swc plugin](https://github.com/vitejs/vite-plugin-react-swc/tree/main) and using swc for minify make no reason anymore

##

Hot glued from other plugins.

Only React for now, pulls welcome.

- Don't need `vite-plugin-react`
- Support for `React Fast Refresh` - faster than the `vite-plugin-react` with babel
- Skip `import React`,`React` is dynamically injected
- `swc` minification instead of `esbuild` or `terser` (no css minify as that is hardcoded to esbuild)
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

## Polyfill

To enable polyfill, you would need to

- install `browserlist` as a devDependency
- install `core-js` as a dependency

```bash
npm i browserlist && npm i -D core-js
```

## ES5

If your target browser only supports ES5, you may want to
checkout [`@vitejs/plugin-legacy`](https://github.com/vitejs/vite/tree/main/packages/plugin-legacy).

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

## Examples

### disable HMR

```ts
import { defineConfig } from "vite";
import swc from "vite-plugin-swc-only";

export default defineConfig({
  plugins: [
    swc({
      refresh: false,
    }),
  ],
});
```

### Classic JSX runtime

You need to include `import React from 'react';` in every tsx file yourself.

```ts
import { defineConfig } from "vite";
import swc from "vite-plugin-swc-only";

export default defineConfig({
  plugins: [
    swc({
      runtime: "classic",
    }),
  ],
});
```

### Disable minification

If there is ie. problem with minification on your `swc` version, it will fallback back to esbuild.

```ts
import { defineConfig } from "vite";
import swc from "vite-plugin-swc-only";

export default defineConfig({
  plugins: [
    swc({
      minify: false,
    }),
  ],
});
```
