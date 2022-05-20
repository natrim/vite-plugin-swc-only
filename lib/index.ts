import * as fs from "fs";
import * as path from "path";
import type {
  JscTarget,
  JsMinifyOptions,
  Options as SWCOptions,
} from "@swc/core";
import { transform } from "@swc/core";
import type { PluginOption } from "vite";
// @cjs_start
import * as url from "url";
import { createRequire } from "module";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
// @cjs_end

const runtimePublicPath = "/@react-refresh";
const refreshLoadCode = `import{injectIntoGlobalHook}from"${runtimePublicPath}";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;`;

const validFilename = (id: string) => {
  if (id.includes("node_modules")) return { ok: false };
  const [filepath, querystring = ""] = id.split("?");
  const ext =
    (querystring.indexOf(".") !== -1
      ? querystring.substring(querystring.lastIndexOf("."))
      : "") ||
    (filepath.indexOf(".") !== -1
      ? filepath.substring(filepath.lastIndexOf("."))
      : "") ||
    "";
  const isTS = ext === ".ts" || ext === ".tsx";
  const isJSX = ext === ".jsx" || ext === ".tsx";
  if (!(isTS || isJSX || ext === ".js" || ext === ".mjs" || ext === ".cjs"))
    return { ok: false };

  return { ok: true, isTS, isJSX, ext, filepath, querystring };
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
} & SWCOptions;

const tsConfigCache: any = {};
const appDirectory = fs.realpathSync(process.cwd());
const getTsConfigOptions = async (mode: "build" | "serve" | "minify") => {
  if (!tsConfigCache[mode]) {
    let file = path.resolve(appDirectory, "tsconfig.json");
    if (!fs.existsSync(file)) {
      file = path.resolve(appDirectory, "jsconfig.json");
      if (!fs.existsSync(file)) {
        return Promise.resolve({});
      }
    }
    tsConfigCache[mode] = require(file);
  }

  return Promise.resolve(tsConfigCache[mode]);
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
  code: string,
  id: string,
  filepath: string | undefined,
  tsconfig: any,
  isTS: boolean = false,
  isJSX: boolean = false,
  runtime: "automatic" | "classic",
  refresh: boolean = false,
  development: boolean = false,
  target: any,
  browserslist: boolean | undefined,
  swcOptions: SWCOptions,
) {
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
        swcTargets.includes(tsconfig?.compilerOptions?.target)
      ? tsconfig?.compilerOptions?.target
      : "es2020";
  return await transform(code, {
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

export const serve: (options: Options) => PluginOption = ({
  minify,
  build,
  serve = true,
  refresh = true,
  runtime = "automatic",
  target,
  minifyOptions,
  ...swcOptions
}: Options = {}) => {
  if (build || minify)
    throw new Error(
      "cannot use minify or build in serve plugin, use plugins separately or use the all helper",
    );
  if (!serve) return null;

  let refreshStuffLoad: Partial<PluginOption> = {};
  if (refresh) {
    refreshStuffLoad = {
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
    };
  }

  return {
    name: "swc-serve",
    apply: "serve",
    enforce: "pre",
    config: (config) => {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
      tsConfigCache["serve"] = undefined;
    },
    ...refreshStuffLoad,
    async transform(code, id) {
      const { ok, isTS, isJSX, filepath } = validFilename(id);
      if (!ok) return;

      const tsconfig = await getTsConfigOptions("serve");

      const result = await transformFile(
        code,
        id,
        filepath,
        tsconfig,
        isTS,
        isJSX,
        runtime,
        refresh,
        true,
        target ? target : "es2020",
        false,
        swcOptions,
      );

      if (!refresh) return result;
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
  refresh = true,
  runtime = "automatic",
  target,
  minifyOptions,
  ...swcOptions
}: Options = {}) => {
  if (serve || minify)
    throw new Error(
      "cannot use minify or serve in build plugin, use plugins separately or use the all helper",
    );
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

  return {
    name: "swc-build",
    apply: "build",
    enforce: "pre",
    config: (config) => {
      if (config.esbuild) define = config.esbuild.define;
      config.esbuild = false;
      tsConfigCache["build"] = undefined;
    },
    configResolved(config) {
      viteBuildTarget = config.build?.target;
    },
    async transform(code, id) {
      const { ok, isTS, isJSX, filepath } = validFilename(id);
      if (!ok) return;

      const tsconfig = await getTsConfigOptions("build");

      return await transformFile(
        code,
        id,
        filepath,
        tsconfig,
        isTS,
        isJSX,
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

export const minify: (options: Options) => PluginOption = ({
  minify = true,
  build,
  serve,
  refresh = true,
  runtime = "automatic",
  target,
  minifyOptions,
  ...swcOptions
}: Options = {}) => {
  if (serve || build)
    throw new Error(
      "cannot use build or serve in minify plugin, use plugins separately or use the all helper",
    );
  if (!minify) return null;
  return {
    name: "swc-minify",
    apply: "build",
    enforce: "post",
    config: (config) => {
      if (!config.build) config.build = {};
      config.build.minify = false;
      tsConfigCache["minify"] = undefined;
    },
    async renderChunk(code, chunk, outputOptions) {
      const tsconfig = await getTsConfigOptions("minify");

      return await transform(code, {
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
