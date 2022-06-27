import * as fs from "fs";
import * as path from "path";
import type {
  JscTarget,
  JsMinifyOptions,
  Options as SWCOptions,
} from "@swc/core";
import { transform } from "@swc/core";
import type { PluginOption, ResolvedConfig } from "vite";
import { transformWithEsbuild } from "vite";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
// @cjs_start
import * as url from "url";
import { createRequire } from "module";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
// @cjs_end

const runtimePublicPath = "/@react-refresh";
const refreshLoadCode = `import{injectIntoGlobalHook}from"${runtimePublicPath}";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;`;
const importReactRE = /(^|\n)import\s+(\*\s+as\s+)?React(,|\s+)/;

const parsePath = (id: string, code: string = "") => {
  const [filepath, querystring = ""] = id.split("?");
  const ext =
    (querystring.indexOf(".") !== -1
      ? querystring.substring(querystring.lastIndexOf("."))
      : "") ||
    (filepath.indexOf(".") !== -1
      ? filepath.substring(filepath.lastIndexOf("."))
      : "") ||
    "";
  const isJSX = ext === ".jsx" || ext === ".tsx" || importReactRE.test(code);
  const isTS = ext === ".ts" || ext === ".tsx";

  return { isTS, isJSX, ext, filepath, querystring };
};

let define: { [key: string]: string } | undefined;

type Options = {
  /**
   * @default true
   */
  minify?: boolean;
  /**
   * @default true
   */
  build?: boolean;
  /**
   * @default true
   */
  serve?: boolean;
  /**
   * @default true
   */
  refresh?: boolean;
  /**
   * @default "automatic"
   */
  runtime?: "automatic" | "classic";
  /**
   * @default tsconfig.compilerOptions.target OR es2020
   */
  target?: JscTarget;
  /**
   * @default { minify: { toplevel: false }, mangle: { top_level: false } }
   */
  minifyOptions?: JsMinifyOptions;
  include?: FilterPattern;
  exclude?: FilterPattern;
} & SWCOptions;

let tsConfigPath = "";
const appDirectory = fs.realpathSync(process.cwd());
const getTsConfigOptions = (_: "build" | "serve" | "minify") => {
  if (!tsConfigPath) {
    let file = path.resolve(appDirectory, "tsconfig.json");
    if (fs.existsSync(file)) {
      tsConfigPath = file;
    } else {
      file = path.resolve(appDirectory, "jsconfig.json");
      if (fs.existsSync(file)) {
        tsConfigPath = file;
      } else {
        tsConfigPath = "__none__";
      }
    }
  }
  if (tsConfigPath === "__none__") return {};
  return require(tsConfigPath);
};

const swcTargets = [
  "es3",
  "es5",
  "es2015",
  "es2016",
  "es2017",
  "es2018",
  "es2019",
  "es2020",
  "es2021",
  "es2022",
];

async function transformFile(
  id: string,
  code: string,
  tsconfig: { compilerOptions?: { [index: string]: any } },
  runtime: "automatic" | "classic",
  refresh: boolean = false,
  development: boolean = false,
  target: any,
  browserslist: boolean | undefined,
  swcOptions: SWCOptions,
) {
  const { isTS, isJSX, filepath } = parsePath(id, code);
  const jsExtras = isTS
    ? undefined
    : {
        decoratorsBeforeExport:
          !!tsconfig?.compilerOptions?.experimentalDecorators,
        exportDefaultFrom: true,
      };
  let swcTarget =
    typeof target !== "undefined"
      ? target === "modules"
        ? "es2020"
        : target === "esnext"
        ? "es2022"
        : !swcTargets.includes(target)
        ? "es2020"
        : target
      : tsconfig?.compilerOptions?.target &&
        swcTargets.includes(
          tsconfig?.compilerOptions?.target as unknown as string,
        )
      ? tsconfig?.compilerOptions?.target
      : "es2020";
  return transform(code, {
    swcrc: false,
    configFile: false,
    env: browserslist
      ? {
          targets:
            target === "modules"
              ? ["es2020", "edge88", "firefox78", "chrome87", "safari13"]
              : target,
          mode: "usage",
          coreJs: "3",
          dynamicImport: true,
          ...swcOptions?.env,
        }
      : undefined,
    ...swcOptions,
    filename: id,
    sourceFileName: filepath,
    inputSourceMap: false,
    sourceMaps: true,
    jsc: {
      target: swcTarget,
      keepClassNames: !!tsconfig?.compilerOptions?.experimentalDecorators,
      ...swcOptions?.jsc,
      parser: {
        syntax: isTS ? "typescript" : "ecmascript",
        [isTS ? "tsx" : "jsx"]: isJSX,
        decorators: !!tsconfig?.compilerOptions?.experimentalDecorators,
        dynamicImport: true,
        ...jsExtras,
        ...swcOptions?.jsc?.parser,
      },
      transform: {
        legacyDecorator: !!tsconfig?.compilerOptions?.experimentalDecorators,
        decoratorMetadata: !!tsconfig?.compilerOptions?.experimentalDecorators
          ? tsconfig?.compilerOptions?.emitDecoratorMetadata
          : undefined,
        ...swcOptions?.jsc?.transform,
        react: {
          runtime: runtime,
          pragma: tsconfig?.compilerOptions?.jsxFactory,
          pragmaFrag: tsconfig?.compilerOptions?.jsxFragmentFactory,
          importSource: tsconfig?.compilerOptions?.jsxImportSource,
          refresh: refresh,
          useBuiltins: refresh,
          ...swcOptions?.jsc?.transform?.react,
          development: development,
        },
        optimizer: {
          ...swcOptions?.jsc?.transform?.optimizer,
          globals: {
            ...swcOptions?.jsc?.transform?.optimizer?.globals,
            vars: {
              ...define,
              ...swcOptions?.jsc?.transform?.optimizer?.globals?.vars,
            },
          },
        },
      },
    },
  });
}

export const serve: (options?: Options) => PluginOption = ({
  minify,
  build,
  serve = true,
  refresh = true,
  runtime = "automatic",
  target,
  minifyOptions,
  include,
  exclude,
  ...swcOptions
}: Options = {}) => {
  if (!serve) return null;

  let refreshStuffLoad: Partial<PluginOption> = {};
  if (refresh) {
    refreshStuffLoad = {
      async resolveId(id) {
        return id === runtimePublicPath ? id : null;
      },
      async load(id) {
        if (id === runtimePublicPath) {
          return new Promise((resolve, reject) => {
            fs.readFile(
              path.join(__dirname, "react-refresh-runtime.js"),
              (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer.toString("utf-8"));
              },
            );
          });
        }

        return null;
      },
      async transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { type: "module" },
            children: refreshLoadCode,
          },
        ];
      },
    };
  }

  const filter = createFilter(
    include || /\.mjs|[jt]sx?$/,
    exclude || /node_modules/,
  );

  return {
    name: "swc:serve",
    apply: "serve",
    enforce: "pre",
    async config(config) {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
    },
    ...refreshStuffLoad,
    async transform(code, id) {
      if (!filter(id)) return null;
      const tsconfig = getTsConfigOptions("serve");
      const result = transformFile(
        id,
        code,
        tsconfig,
        runtime,
        refresh,
        true,
        target ? target : "es2020",
        false,
        swcOptions,
      );

      if (!refresh) return result;

      const { code: transformedCode, map: sourcemap } = await result;

      if (!transformedCode.includes("$RefreshReg$"))
        return { code: transformedCode, map: sourcemap };

      const header = `import * as RefreshRuntime from "${runtimePublicPath}";let prevRefreshReg;let prevRefreshSig;if(!window.$RefreshReg$)throw new Error("React refresh preamble was not loaded!");prevRefreshReg=window.$RefreshReg$;prevRefreshSig=window.$RefreshSig$;window.$RefreshReg$=RefreshRuntime.getRefreshReg("${id}");window.$RefreshSig$=RefreshRuntime.createSignatureFunctionForTransform;`;
      const footer = `;window.$RefreshReg$=prevRefreshReg;window.$RefreshSig$=prevRefreshSig;import.meta.hot.accept();RefreshRuntime.enqueueUpdate();`;

      return { code: `${header}${transformedCode}${footer}`, map: sourcemap };
    },
  };
};

export const build: (options?: Options) => PluginOption = ({
  minify,
  build = true,
  serve,
  refresh = true,
  runtime = "automatic",
  target,
  include,
  exclude,
  minifyOptions,
  ...swcOptions
}: Options = {}) => {
  if (!build) return null;

  let viteBuildTarget: any = undefined;
  let hasBrowserList = false;
  try {
    // @ts-ignore
    require("browserlist");
    hasBrowserList = true;
  } catch (e) {
    hasBrowserList = false;
    if (swcOptions?.env) {
      console.error('"browserlist" is not installed!');
      process.exit(1);
    }
  }

  const filter = createFilter(
    include || /\.mjs|[jt]sx?$/,
    exclude || /node_modules/,
  );

  return {
    name: "swc:build",
    apply: "build",
    enforce: "pre",
    async config(config) {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
    },
    async configResolved(config) {
      viteBuildTarget = config.build?.target;
    },
    async transform(code, id) {
      if (!filter(id)) return null;
      const tsconfig = getTsConfigOptions("build");
      return transformFile(
        id,
        code,
        tsconfig,
        runtime,
        false,
        false,
        target ? target : viteBuildTarget || "modules",
        hasBrowserList,
        swcOptions,
      );
    },
  };
};

export const minify: (options?: Options) => PluginOption = ({
  minify = true,
  build,
  serve,
  refresh = true,
  runtime = "automatic",
  target,
  minifyOptions,
  ...swcOptions
}: Options = {}) => {
  if (!minify) {
    return esbuildMinifyFallback();
  }
  return {
    name: "swc:minify",
    apply: "build",
    enforce: "post",
    async config(config) {
      if (!config.build) config.build = {};
      // @ts-ignore force esbuild disabled in minify
      config.build.minify = "swc";
    },
    async renderChunk(code, chunk, outputOptions) {
      const tsconfig = getTsConfigOptions("minify");
      return transform(code, {
        swcrc: false,
        configFile: false,
        ...swcOptions,
        sourceMaps: true,
        inputSourceMap: false,
        filename: chunk.fileName,
        minify: true,
        jsc: {
          minify: {
            safari10: true,
            ...minifyOptions,
            compress: ["object", "undefined"].includes(
              typeof minifyOptions?.compress,
            )
              ? {
                  toplevel: false,
                  ...((minifyOptions?.compress || {}) as object),
                }
              : minifyOptions?.compress,
            mangle: ["object", "undefined"].includes(
              typeof minifyOptions?.mangle,
            )
              ? {
                  // @ts-ignore
                  topLevel: false,
                  ...((minifyOptions?.mangle || {}) as object),
                }
              : minifyOptions?.mangle,
            sourceMap: !!outputOptions.sourcemap,
            module: outputOptions.format.startsWith("es"),
            toplevel: outputOptions.format === "cjs",
          },
          target:
            typeof target !== "undefined"
              ? target
              : tsconfig?.compilerOptions?.target || "es2020",
          ...swcOptions?.jsc,
        },
      });
    },
  };
};

function esbuildMinifyFallback(): PluginOption {
  let resolvedConfig: ResolvedConfig;
  const rollupToEsbuildFormatMap: { [key: string]: any } = {
    es: "esm",
    cjs: "cjs",
    iife: undefined,
  };
  const INJECT_HELPERS_IIFE_RE =
    /(.*)((?:const|var) [^\s]+=function\([^)]*?\){"use strict";)(.*)/s;
  const INJECT_HELPERS_UMD_RE =
    /(.*)(\(function\([^)]*?\){.+amd.+function\([^)]*?\){"use strict";)(.*)/s;
  return {
    name: "swc:minify:fallback",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      resolvedConfig = config;
    },
    async renderChunk(code, chunk, opts) {
      if (
        // ignore esbuild false
        resolvedConfig.esbuild !== false ||
        // skip if not minify
        !(
          resolvedConfig.build.minify === "esbuild" ||
          resolvedConfig.build.minify === true
        )
      ) {
        return null;
      }
      // @ts-ignore injected by @vitejs/plugin-legacy
      if (opts.__vite_skip_esbuild__) {
        return null;
      }
      const target = resolvedConfig.build.target;
      const minify = resolvedConfig.build.minify === "esbuild";

      if ((!target || target === "esnext") && !minify) {
        return null;
      }

      const isEsLibBuild = resolvedConfig.build.lib && opts.format === "es";
      const isGranularMinify =
        resolvedConfig.esbuild &&
        (resolvedConfig.esbuild?.minifyWhitespace ||
          resolvedConfig.esbuild?.minifySyntax ||
          resolvedConfig.esbuild?.minifyIdentifiers);

      const res = await transformWithEsbuild(code, chunk.fileName, {
        ...(resolvedConfig.esbuild || {}),
        target: target || undefined,
        format: rollupToEsbuildFormatMap[opts.format],
        ...(minify
          ? {
              treeShaking: true,
              // Do not minify ES lib output since that would remove pure annotations
              // and break tree-shaking
              // https://github.com/vuejs/core/issues/2860#issuecomment-926882793
              minify: !isEsLibBuild || isGranularMinify,
              ...(isEsLibBuild && isGranularMinify
                ? { minifyWhitespace: false }
                : isEsLibBuild && !isGranularMinify
                ? {
                    minifyWhitespace: false,
                    minifySyntax: true,
                    minifyIdentifiers: true,
                  }
                : {}),
            }
          : undefined),
      });

      if (resolvedConfig.build.lib) {
        // #7188, esbuild adds helpers out of the UMD and IIFE wrappers, and the
        // names are minified potentially causing collision with other globals.
        // We use a regex to inject the helpers inside the wrappers.
        // We don't need to create a MagicString here because both the helpers and
        // the headers don't modify the sourcemap
        const injectHelpers =
          opts.format === "umd"
            ? INJECT_HELPERS_UMD_RE
            : opts.format === "iife"
            ? INJECT_HELPERS_IIFE_RE
            : undefined;
        if (injectHelpers) {
          res.code = res.code.replace(
            injectHelpers,
            (_, helpers, header, rest) => header + helpers + rest,
          );
        }
      }
      return res;
    },
  };
}

function swcPluginsFactory(options: Options = {}): PluginOption[] {
  return [serve(options), build(options), minify(options)];
}

swcPluginsFactory.serve = serve;
swcPluginsFactory.build = build;
swcPluginsFactory.minify = minify;

export default swcPluginsFactory;
