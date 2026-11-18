export {
  DECLARATIVE_KINDS,
  EXTENSION_KINDS,
  ExtensionKindSchema,
  MANIFEST_FILE,
  PLUGIN_ID_PATTERN,
  PluginManifestSchema,
  PluginPermissionsSchema,
  ProvidedExtensionSchema,
  isNetworkTarget,
  isSafeRelativePath,
  referencedFiles,
  type ExtensionKind,
  type PluginManifest,
  type PluginPermissions,
} from './manifest.js';
export {
  permissionDiff,
  widensPermissions,
  type ListChange,
  type PermissionDiff,
} from './permissions.js';
export {
  definePlugin,
  PLUGIN_LIMITS,
  type PluginContext,
  type PluginFetchInit,
  type PluginFetchResponse,
  type PluginMethod,
  type PluginModule,
} from './module.js';
