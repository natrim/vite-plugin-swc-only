import fs from "fs";
import path from "path";
import { JsMinifyOptions, Options as SWCOptions, transform } from "@swc/core";
import { PluginOption } from "vite";

const runtimePublicPath = "/@react-refresh";
const refreshLoadCode = `import{injectIntoGlobalHook}from"${runtimePublicPath}";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;`;

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
  reactRefresh?: boolean;
  /**
   * @default "automatic"
   */
  reactRuntime?: "automatic" | "classic";
  /**
   * @default { minify: { toplevel: false }, mangle: true }
   */
  minifyOptions?: JsMinifyOptions;
} & SWCOptions;

const tsConfigCache: any = {};
const appDirectory = fs.realpathSync(process.cwd());
const getTsConfigOptions = async (mode: "build" | "serve" | "minify") => {
  if (!tsConfigCache[mode])
    tsConfigCache[mode] = await import(
      path.resolve(appDirectory, "tsconfig.json")
    );

  return Promise.resolve(tsConfigCache[mode]);
};

export const serve: (options: Options) => PluginOption = ({
  minify,
  build,
  serve = true,
  reactRefresh = true,
  reactRuntime = "automatic",
  minifyOptions,
  ...swcOptions
} = {}) => {
  if (build || minify)
    throw new Error(
      "cannot use minify or build in serve plugin, use plugins separately or use the all helper",
    );
  if (!serve) return null;
  return {
    name: "swc-serve",
    apply: "serve",
    config: (config) => {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
      tsConfigCache["serve"] = undefined;
    },
    resolveId: (id) => (id === runtimePublicPath ? id : undefined),
    load: (id) =>
      id === runtimePublicPath
        ? fs.readFileSync(
            path.join(__dirname, "react-refresh-runtime.js"),
            "utf-8",
          )
        : undefined,
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module" }, children: refreshLoadCode },
    ],
    async transform(code, id) {
      if (id.includes("node_modules")) return;
      if (!/\.[jt]sx?$/.test(id)) return;

      const isTS = /\.(ts|tsx)$/.test(id);
      const isJSX = !id.endsWith(".ts");

      const tsconfig = await getTsConfigOptions("serve");

      const result = await transform(code, {
        filename: id,
        swcrc: false,
        configFile: false,
        ...swcOptions,
        jsc: {
          target: tsconfig?.compilerOptions?.target || "es2020",
          keepClassNames: !!tsconfig?.compilerOptions?.experimentalDecorators,
          ...swcOptions?.jsc,
          parser: {
            syntax: isTS ? "typescript" : "ecmascript",
            [isTS ? "tsx" : "jsx"]: isJSX,
            decorators: !!tsconfig?.compilerOptions?.experimentalDecorators,
            ...swcOptions?.jsc?.parser,
          },
          transform: {
            legacyDecorator:
              !!tsconfig?.compilerOptions?.experimentalDecorators,
            decoratorMetadata: !!tsconfig?.compilerOptions
              ?.experimentalDecorators
              ? tsconfig?.compilerOptions?.emitDecoratorMetadata
              : undefined,
            ...swcOptions?.jsc?.transform,
            react: {
              runtime: reactRuntime,
              pragma: tsconfig?.compilerOptions?.jsxFactory,
              pragmaFrag: tsconfig?.compilerOptions?.jsxFragmentFactory,
              importSource: tsconfig?.compilerOptions?.jsxImportSource,
              refresh: reactRefresh,
              useBuiltins: true,
              ...swcOptions?.jsc?.transform?.react,
              development: true,
            },
            optimizer: {
              ...swcOptions?.jsc?.transform?.optimizer,
              globals: {
                ...swcOptions?.jsc?.transform?.optimizer?.globals,
                vars: define,
              },
            },
          },
        },
      });

      if (!result.code.includes("$RefreshReg$")) return result;

      const header = `import * as RefreshRuntime from "${runtimePublicPath}";let prevRefreshReg;let prevRefreshSig;if(!window.$RefreshReg$)throw new Error("React refresh preamble was not loaded!");prevRefreshReg=window.$RefreshReg$;prevRefreshSig=window.$RefreshSig$;window.$RefreshReg$=RefreshRuntime.getRefreshReg("${id}");window.$RefreshSig$=RefreshRuntime.createSignatureFunctionForTransform;`;
      const footer = `;window.$RefreshReg$=prevRefreshReg;window.$RefreshSig$=prevRefreshSig;import.meta.hot.accept();RefreshRuntime.enqueueUpdate();`;

      return { code: `${header}${result.code}${footer}`, map: result.map };
    },
  };
};

export const build: (options: Options) => PluginOption = ({
  minify,
  build = true,
  serve,
  reactRefresh = true,
  reactRuntime = "automatic",
  minifyOptions,
  ...swcOptions
} = {}) => {
  if (serve || minify)
    throw new Error(
      "cannot use minify or serve in build plugin, use plugins separately or use the all helper",
    );
  if (!build) return null;

  let sourcemaps = true;

  return {
    name: "swc-build",
    apply: "build",
    config: (config) => {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
      sourcemaps = !!config?.build?.sourcemap;
      tsConfigCache["build"] = undefined;
    },
    async transform(code, id) {
      if (id.includes("node_modules")) return;
      if (!/\.[jt]sx?$/.test(id)) return;

      const isTS = /\.(ts|tsx)$/.test(id);
      const isJSX = !id.endsWith(".ts");

      const tsconfig = await getTsConfigOptions("build");

      return await transform(code, {
        filename: id,
        swcrc: false,
        configFile: false,
        ...swcOptions,
        sourceMaps: sourcemaps,
        jsc: {
          target: tsconfig?.compilerOptions?.target || "es2020",
          keepClassNames: !!tsconfig?.compilerOptions?.experimentalDecorators,
          ...swcOptions?.jsc,
          parser: {
            syntax: isTS ? "typescript" : "ecmascript",
            [isTS ? "tsx" : "jsx"]: isJSX,
            decorators: !!tsconfig?.compilerOptions?.experimentalDecorators,
            ...swcOptions?.jsc?.parser,
          },
          transform: {
            legacyDecorator:
              !!tsconfig?.compilerOptions?.experimentalDecorators,
            decoratorMetadata: !!tsconfig?.compilerOptions
              ?.experimentalDecorators
              ? tsconfig?.compilerOptions?.emitDecoratorMetadata
              : undefined,
            ...swcOptions?.jsc?.transform,
            react: {
              runtime: reactRuntime,
              pragma: tsconfig?.compilerOptions?.jsxFactory,
              pragmaFrag: tsconfig?.compilerOptions?.jsxFragmentFactory,
              importSource: tsconfig?.compilerOptions?.jsxImportSource,
              ...swcOptions?.jsc?.transform?.react,
            },
            optimizer: {
              ...swcOptions?.jsc?.transform?.optimizer,
              globals: {
                ...swcOptions?.jsc?.transform?.optimizer?.globals,
                vars: define,
              },
            },
          },
        },
      });
    },
  };
};

export const minify: (options: Options) => PluginOption = ({
  minify = true,
  build,
  serve,
  reactRefresh = true,
  reactRuntime = "automatic",
  minifyOptions,
  ...swcOptions
} = {}) => {
  if (serve || build)
    throw new Error(
      "cannot use build or serve in minify plugin, use plugins separately or use the all helper",
    );
  if (!minify) return null;
  let sourcemaps = true;
  return {
    name: "swc-minify",
    apply: "build",
    enforce: "post",
    config: (config) => {
      if (!config.build) config.build = {};
      config.build.minify = false;
      sourcemaps = !!config.build.sourcemap;
      tsConfigCache["minify"] = undefined;
    },
    async renderChunk(code, chunk) {
      const tsconfig = await getTsConfigOptions("minify");

      return await transform(code, {
        sourceMaps: sourcemaps,
        swcrc: false,
        configFile: false,
        ...swcOptions,
        filename: chunk.fileName,
        minify: true,
        jsc: {
          minify: {
            compress:
              minifyOptions?.compress === false
                ? false
                : {
                    toplevel: false,
                    ...(typeof minifyOptions?.compress === "object"
                      ? minifyOptions?.compress
                      : {}),
                  },
            mangle: true,
            ...minifyOptions,
          },
          target: tsconfig?.compilerOptions?.target || "es2020",
          ...swcOptions?.jsc,
        },
      });
    },
  };
};

function swcPluginsFactory({
  minify: m = true,
  build: b = true,
  serve: s = true,
  ...options
}: Options = {}): PluginOption[] {
  return [s && serve(options), b && build(options), m && minify(options)];
}

swcPluginsFactory.serve = serve;
swcPluginsFactory.build = build;
swcPluginsFactory.minify = minify;

export default swcPluginsFactory;
