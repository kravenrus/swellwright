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
  type PluginStorage,
} from './module.js';
export {
  ConfigFieldSchema,
  ConfigSchemaFileSchema,
  MAX_CONFIG_FIELDS,
  secretFields,
  validateConfig,
  type ConfigField,
  type ConfigProblem,
  type ConfigSchemaFile,
  type ConfigValue,
  type ConfigValues,
} from './config-schema.js';
