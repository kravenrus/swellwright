import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';

import { SshConnection } from './connection.js';
import {
  SshConnectionLostError,
  SshHashMismatchError,
  SshInputError,
  SshSftpError,
  SshTimeoutError,
} from './errors.js';
import type { SftpClient } from './sftp.js';
import { TestSshServer, type ExecHandler } from './test-support/index.js';
import { USERS, sleep, targetFor, tempDir } from './test-util.js';

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/** Answers `sha256sum -- '<path>'` from the files under `root`, like a real server would. `lie` returns a wrong hash. */
function hashingExec(root: string, options: { lie?: boolean } = {}): ExecHandler {
  return (channel, request) => {
    const match = /^sha256sum -- '(.*)'$/su.exec(request.command);
    const path = match?.[1];
    if (path === undefined) {
      channel.stderr.write('unsupported\n');
      channel.exit(127);
      channel.end();
      return;
    }
    const file = join(root, path);
    if (!existsSync(file)) {
      channel.stderr.write('no such file\n');
      channel.exit(1);
    } else {
      const hash = options.lie === true ? sha256('something else') : sha256(readFileSync(file));
      channel.write(`${hash}  ${path}\n`);
      channel.exit(0);
    }
    channel.end();
  };
}

describe('SFTP', () => {
  const root = tempDir();
  const local = tempDir();
  let server: TestSshServer;
  let connection: SshConnection;
  let sftp: SftpClient;

  before(async () => {
    server = await TestSshServer.start({
      users: USERS,
      sftpRoot: root.path,
      exec: hashingExec(root.path),
    });
    connection = await SshConnection.connect(targetFor(server));
    sftp = await connection.sftp();
  });
  after(async () => {
    connection.close();
    await server.close();
    root.cleanup();
    local.cleanup();
  });

  it('writes and reads a file and reports the hash of what arrived', async () => {
    const result = await sftp.writeFile('/hello.txt', 'héllo wörld');
    assert.equal(result.bytes, Buffer.byteLength('héllo wörld'));
    assert.equal(result.sha256, sha256('héllo wörld'));
    assert.equal((await sftp.readFile('/hello.txt')).toString('utf8'), 'héllo wörld');
    // No temporary file is left next to it.
    assert.deepEqual(
      readdirSync(root.path).filter((name) => name.includes('.part')),
      [],
    );
  });

  it('streams a large local file up and down without reading it whole, and the hashes agree', async () => {
    const content = randomBytes(6 * 1024 * 1024 + 123);
    const source = join(local.path, 'big.bin');
    writeFileSync(source, content);
    const expected = sha256(content);

    const up = await sftp.put(source, '/big.bin', { expectedSha256: expected });
    assert.equal(up.bytes, content.length);
    assert.equal(up.sha256, expected);
    assert.equal(sha256(readFileSync(join(root.path, 'big.bin'))), expected);

    const target = join(local.path, 'big-down.bin');
    const down = await sftp.get('/big.bin', target, { expectedSha256: expected });
    assert.equal(down.bytes, content.length);
    assert.equal(sha256(readFileSync(target)), expected);
    assert.deepEqual(
      readdirSync(local.path).filter((name) => name.endsWith('.part')),
      [],
    );
  });

  it('confirms the upload by hashing on the server when it can run commands', async () => {
    const before = server.execLog.length;
    await sftp.put(Buffer.from('checked on the server'), '/checked.txt', { verify: 'exec' });
    const hashed = server.execLog
      .slice(before)
      .filter((entry) => entry.command.startsWith('sha256sum -- '));
    assert.equal(hashed.length, 1);
    // The temporary file is what is hashed: only a verified file is moved into place.
    assert.ok(hashed[0]?.command.includes('.swellwright-'));
  });

  it('reads the file back when told to, or when the server cannot run commands', async () => {
    const before = server.execLog.length;
    const result = await sftp.put(Buffer.from('read back'), '/readback.txt', {
      verify: 'readback',
    });
    assert.equal(result.sha256, sha256('read back'));
    assert.equal(server.execLog.length, before);

    const bare = await TestSshServer.start({ users: USERS, sftpRoot: root.path });
    const bareConnection = await SshConnection.connect(targetFor(bare));
    try {
      const bareSftp = await bareConnection.sftp();
      const auto = await bareSftp.put(Buffer.from('no exec here'), '/auto.txt');
      assert.equal(auto.sha256, sha256('no exec here'));
    } finally {
      bareConnection.close();
      await bare.close();
    }
  });

  it('refuses an upload that does not match the expected hash and leaves nothing behind', async () => {
    const before = readdirSync(root.path).sort();
    await assert.rejects(
      sftp.writeFile('/mismatch.txt', 'actual content', {
        expectedSha256: sha256('other content'),
      }),
      (error: unknown) => {
        assert.ok(error instanceof SshHashMismatchError);
        assert.equal(error.code, 'ssh_hash_mismatch');
        assert.equal(error.expected, sha256('other content'));
        assert.equal(error.actual, sha256('actual content'));
        return true;
      },
    );
    assert.deepEqual(readdirSync(root.path).sort(), before);
  });

  it('detects corruption on the way and keeps the previous version of the file', async () => {
    await sftp.writeFile('/precious.txt', 'version one');
    const lying = await TestSshServer.start({
      users: USERS,
      sftpRoot: root.path,
      exec: hashingExec(root.path, { lie: true }),
    });
    const lyingConnection = await SshConnection.connect(targetFor(lying));
    try {
      const lyingSftp = await lyingConnection.sftp();
      await assert.rejects(
        lyingSftp.writeFile('/precious.txt', 'version two', { verify: 'exec' }),
        SshHashMismatchError,
      );
    } finally {
      lyingConnection.close();
      await lying.close();
    }
    assert.equal(readFileSync(join(root.path, 'precious.txt'), 'utf8'), 'version one');
    assert.deepEqual(
      readdirSync(root.path).filter((name) => name.includes('.part')),
      [],
    );
  });

  it('replaces an existing file only after the new one is complete', async () => {
    await sftp.writeFile('/replace.txt', 'old');
    await sftp.writeFile('/replace.txt', 'new and longer');
    assert.equal(readFileSync(join(root.path, 'replace.txt'), 'utf8'), 'new and longer');
  });

  it('downloads into a stream and refuses a download that does not match', async () => {
    await sftp.writeFile('/stream.txt', 'into a stream');
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const result = await sftp.get('/stream.txt', sink);
    assert.equal(Buffer.concat(chunks).toString('utf8'), 'into a stream');
    assert.equal(result.sha256, sha256('into a stream'));

    const target = join(local.path, 'wrong.txt');
    await assert.rejects(
      sftp.get('/stream.txt', target, { expectedSha256: sha256('x') }),
      SshHashMismatchError,
    );
    assert.equal(existsSync(target), false);
    assert.deepEqual(
      readdirSync(local.path).filter((name) => name.startsWith('wrong')),
      [],
    );
  });

  it('refuses to read a file larger than the limit', async () => {
    await sftp.writeFile('/large.txt', 'x'.repeat(2000));
    await assert.rejects(sftp.readFile('/large.txt', { maxBytes: 1000 }), SshSftpError);
    assert.equal((await sftp.readFile('/large.txt', { maxBytes: 2000 })).length, 2000);
  });

  it('reports a missing file as null from stat and as an SFTP error elsewhere', async () => {
    assert.equal(await sftp.stat('/missing'), null);
    await assert.rejects(
      sftp.readFile('/missing'),
      (error: unknown) => error instanceof SshSftpError && error.sftpStatus === 2,
    );
    await assert.rejects(sftp.remove('/missing'), SshSftpError);
    await sftp.remove('/missing', { ignoreMissing: true });
  });

  it('stats files and directories', async () => {
    await sftp.writeFile('/s.txt', 'abc');
    const file = await sftp.stat('/s.txt');
    assert.ok(file?.isFile);
    assert.equal(file.size, 3);
    const directory = await sftp.stat('/');
    assert.ok(directory?.isDirectory);
  });

  it('creates directories like mkdir -p and refuses to treat a file as one', async () => {
    await sftp.mkdir('/a/b/c');
    assert.ok((await sftp.stat('/a/b/c'))?.isDirectory);
    await sftp.mkdir('/a/b/c');
    await assert.rejects(sftp.mkdir('/a/b/c', { recursive: false }), SshSftpError);
    await sftp.writeFile('/a/file.txt', 'x');
    await assert.rejects(sftp.mkdir('/a/file.txt/inside'), SshSftpError);
    await sftp.rmdir('/a/b/c');
    assert.equal(await sftp.stat('/a/b/c'), null);
  });

  it('renames over an existing file and refuses when told not to overwrite', async () => {
    await sftp.writeFile('/r1.txt', 'one');
    await sftp.writeFile('/r2.txt', 'two');
    await assert.rejects(sftp.rename('/r1.txt', '/r2.txt', { overwrite: false }), SshSftpError);
    await sftp.rename('/r1.txt', '/r2.txt');
    assert.equal(readFileSync(join(root.path, 'r2.txt'), 'utf8'), 'one');
    assert.equal(await sftp.stat('/r1.txt'), null);
    await assert.rejects(
      sftp.rename('/nothing', '/target'),
      (error: unknown) => error instanceof SshSftpError,
    );
  });

  it('refuses malformed input before sending anything', async () => {
    await assert.rejects(sftp.stat(''), SshInputError);
    await assert.rejects(sftp.stat('/a\0b'), SshInputError);
    await assert.rejects(
      sftp.put(Buffer.from('x'), '/x.txt', { expectedSha256: 'NOTHEX' }),
      SshInputError,
    );
    await assert.rejects(
      sftp.get('/x', join(local.path, 'x'), { expectedSha256: sha256('x').toUpperCase() }),
      SshInputError,
    );
  });

  it('is closed with its connection', async () => {
    const other = await SshConnection.connect(targetFor(server));
    const session = await other.sftp();
    assert.equal(session.closed, false);
    other.close();
    await sleep(100);
    assert.equal(session.closed, true);
    await assert.rejects(session.stat('/'), SshConnectionLostError);
  });
});

describe('SFTP deadlines', () => {
  const root = tempDir();
  let server: TestSshServer;
  before(async () => {
    server = await TestSshServer.start({
      users: USERS,
      sftpRoot: root.path,
      sftpStallWrites: true,
    });
  });
  after(async () => {
    await server.close();
    root.cleanup();
  });

  it('gives up on a transfer that stopped moving', async () => {
    const connection = await SshConnection.connect(targetFor(server));
    try {
      const sftp = await connection.sftp();
      const started = Date.now();
      await assert.rejects(
        sftp.put(Buffer.from('never acknowledged'), '/stuck.txt', {
          idleTimeoutMs: 300,
          verify: 'none',
        }),
        (error: unknown) => {
          assert.ok(error instanceof SshTimeoutError);
          assert.equal(error.phase, 'sftp');
          return true;
        },
      );
      assert.ok(Date.now() - started < 4000);
    } finally {
      connection.close();
    }
  });

  it('fails with a connection error, not a hang, when the connection drops mid-transfer', async () => {
    const connection = await SshConnection.connect(targetFor(server));
    try {
      const sftp = await connection.sftp();
      setTimeout(() => {
        server.dropConnections();
      }, 150);
      await assert.rejects(
        sftp.put(Buffer.from('cut off'), '/cut.txt', { idleTimeoutMs: 20_000, verify: 'none' }),
        (error: unknown) => error instanceof SshConnectionLostError,
      );
    } finally {
      connection.close();
    }
  });
});
