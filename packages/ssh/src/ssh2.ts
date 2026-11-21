// ssh2 is a CommonJS package whose `utils` export Node's named-export detection does not see, so the module is
// imported as a whole here and the pieces this package uses are re-exported with their types.

import ssh2 from 'ssh2';

export type {
  AuthContext,
  ClientChannel,
  Connection,
  SFTPWrapper,
  ServerChannel,
  Stats,
} from 'ssh2';

export const Client = ssh2.Client;
export type Client = InstanceType<typeof ssh2.Client>;

export const Server = ssh2.Server;
export type Server = InstanceType<typeof ssh2.Server>;

export const utils = ssh2.utils;
