import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  ApiErrorSchema,
  ArtifactListSchema,
  ArtifactManifestSchema,
  ArtifactVersionViewSchema,
  ArtifactViewSchema,
} from '@swellwright/contracts';

import {
  auditEvents,
  type Client,
  createOwner,
  createUser,
  databaseUrl,
  type Instance,
  signInAs,
  start,
  stop,
} from '../test-support.js';
import { sha256Hex, type TestCatalogue, testCatalogue } from './test-catalogue.js';

const SCRIPT = '#!/bin/sh\necho "a demo artifact"\n';

/** A download straight from the server: the test client parses every answer as JSON, a file is not. */
async function download(
  instance: Instance,
  client: Client,
  path: string,
): Promise<{ status: number; headers: Headers; bytes: Buffer }> {
  const res = await fetch(`${instance.base}${path}`, {
    headers: client.cookie ? { cookie: client.cookie } : {},
  });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

describe('the artifact catalogue over the API', { skip: !databaseUrl }, () => {
  let catalogue: TestCatalogue;
  let instance: Instance;
  let owner: Client;
  let observer: Client;
  const big = randomBytes(5 * 1024 * 1024 + 17);

  before(async () => {
    catalogue = testCatalogue();
    catalogue.add('demo', SCRIPT);
    catalogue.add('newer', 'old\n');
    catalogue.add('newer-2', 'newer\n', { name: 'newer', version: '1.2.0' });
    catalogue.add('big', big, { file: 'big.bin', interpreter: 'none' });
    catalogue.add('tampered', 'the original bytes\n');
    catalogue.add('vanished', 'gone soon\n');
    catalogue.add('malformed', 'x');
    catalogue.add('wrong-size', 'twelve bytes');
    // Damage done before the server starts: it must be found when the server starts.
    writeFileSync(join(catalogue.directory, 'tampered', 'run.sh'), 'the spoiled  bytes\n');
    writeFileSync(join(catalogue.directory, 'malformed', 'manifest.json'), '{"name": "malformed"');
    writeFileSync(join(catalogue.directory, 'wrong-size', 'run.sh'), 'not twelve bytes at all');
    instance = await start({ SW_ARTIFACTS_DIR: catalogue.directory });
    const { secret } = await createOwner(instance);
    owner = await signInAs(instance, 'owner', secret);
    const viewer = await createUser(instance, 'viewer', 'observer');
    observer = await signInAs(instance, 'viewer', viewer.secret);
  });

  after(async () => {
    await stop(instance);
    catalogue.cleanup();
  });

  it('lists every artifact with its versions, hash, size, steps and parameters', async () => {
    const reply = await observer.get('/artifacts');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const list = ArtifactListSchema.parse(reply.body);
    assert.deepEqual(
      list.artifacts.map((artifact) => artifact.name),
      ['big', 'demo', 'malformed', 'newer', 'tampered', 'vanished', 'wrong-size'],
      'ordered by name; a malformed manifest is listed under its directory name',
    );
    const demo = list.artifacts.find((artifact) => artifact.name === 'demo');
    assert.equal(demo?.latestVersion, '1.0.0');
    const version = demo.versions[0];
    assert.equal(version?.state, 'ok');
    assert.equal(version.problem, null);
    assert.equal(version.sha256, sha256Hex(SCRIPT));
    assert.equal(version.size, Buffer.byteLength(SCRIPT));
    assert.equal(version.manifest?.steps[0]?.id, 'check');
    assert.equal(version.manifest.params['MODE']?.default, 'quick');
    ArtifactManifestSchema.parse(version.manifest);
  });

  it('puts the newest version first and says which is the latest that is ok', async () => {
    const view = ArtifactViewSchema.parse((await owner.get('/artifacts/newer')).body);
    assert.deepEqual(
      view.versions.map((version) => version.version),
      ['1.2.0', '1.0.0'],
    );
    assert.equal(view.latestVersion, '1.2.0');
    const one = ArtifactVersionViewSchema.parse(
      (await owner.get('/artifacts/newer/versions/1.0.0')).body,
    );
    assert.equal(one.manifest?.version, '1.0.0');
    assert.equal((await owner.get('/artifacts/newer/versions/3.0.0')).status, 404);
    assert.equal((await owner.get('/artifacts/nothing')).status, 404);
  });

  it('marks what is wrong at start as broken, with the reason, and records it once each', async () => {
    const list = ArtifactListSchema.parse((await owner.get('/artifacts')).body);
    const state = (name: string) => list.artifacts.find((artifact) => artifact.name === name);
    assert.equal(state('tampered')?.versions[0]?.state, 'broken');
    assert.match(state('tampered')?.versions[0]?.problem ?? '', /SHA-256 of the file is/u);
    assert.equal(state('tampered')?.latestVersion, null);
    assert.equal(state('wrong-size')?.versions[0]?.state, 'broken');
    assert.match(state('wrong-size')?.versions[0]?.problem ?? '', /bytes, the manifest says/u);
    assert.equal(state('malformed')?.versions[0]?.state, 'broken');
    assert.equal(state('malformed')?.versions[0]?.manifest, null);
    assert.equal(state('malformed')?.versions[0]?.version, null);
    assert.equal(state('demo')?.versions[0]?.state, 'ok');

    const noted = (await auditEvents(instance)).filter(
      (event) => event.action === 'artifact.broken',
    );
    assert.deepEqual(noted.map((event) => event.details['artifact']).sort(), [
      'malformed',
      'tampered',
      'wrong-size',
    ]);
    for (const event of noted) {
      assert.equal(event.outcome, 'failure');
      assert.equal(event.actor, null, 'found at start: nobody asked');
    }
  });

  it('downloads the file as it is, with its name and its hash in the headers', async () => {
    const got = await download(instance, observer, '/artifacts/demo/content');
    assert.equal(got.status, 200);
    assert.deepEqual(got.bytes, Buffer.from(SCRIPT));
    assert.equal(got.headers.get('x-content-sha256'), sha256Hex(SCRIPT));
    assert.equal(got.headers.get('content-disposition'), 'attachment; filename="run.sh"');
    assert.equal(got.headers.get('content-type'), 'application/octet-stream');
    assert.equal(got.headers.get('content-length'), String(Buffer.byteLength(SCRIPT)));
    assert.equal(
      createHash('sha256').update(got.bytes).digest('hex'),
      got.headers.get('x-content-sha256'),
    );
  });

  it('downloads the latest intact version, or the one that is named', async () => {
    const latest = await download(instance, owner, '/artifacts/newer/content');
    assert.equal(latest.bytes.toString(), 'newer\n');
    const named = await download(instance, owner, '/artifacts/newer/versions/1.0.0/content');
    assert.equal(named.bytes.toString(), 'old\n');
    assert.equal(
      (await download(instance, owner, '/artifacts/newer/versions/4.0.0/content')).status,
      404,
    );
  });

  it('streams a file of several megabytes, and the hash of what arrives is the header', async () => {
    const got = await download(instance, owner, '/artifacts/big/content');
    assert.equal(got.status, 200);
    assert.equal(got.bytes.length, big.length);
    assert.equal(createHash('sha256').update(got.bytes).digest('hex'), sha256Hex(big));
    assert.equal(got.headers.get('x-content-sha256'), sha256Hex(big));
  });

  it('does not serve what is broken, nor what is not there', async () => {
    for (const name of ['tampered', 'wrong-size']) {
      const got = await download(instance, owner, `/artifacts/${name}/content`);
      assert.equal(got.status, 409, name);
      const error = ApiErrorSchema.parse(JSON.parse(got.bytes.toString())).error;
      assert.equal(error.code, 'artifact_broken');
      assert.ok(
        !got.bytes.toString().includes('spoiled'),
        'the spoiled bytes are not in the answer',
      );
    }
    assert.equal((await download(instance, owner, '/artifacts/malformed/content')).status, 404);
    assert.equal((await download(instance, owner, '/artifacts/nothing/content')).status, 404);
  });

  it('looks at a file again when it is used, so one spoiled after the start is not served', async () => {
    writeFileSync(join(catalogue.directory, 'vanished', 'run.sh'), 'spoiled after the start\n');
    const got = await download(instance, owner, '/artifacts/vanished/content');
    assert.equal(got.status, 409);
    const listed = ArtifactViewSchema.parse((await owner.get('/artifacts/vanished')).body);
    assert.equal(listed.versions[0]?.state, 'broken');
    const noted = (await auditEvents(instance)).filter(
      (event) => event.action === 'artifact.broken' && event.details['artifact'] === 'vanished',
    );
    assert.equal(noted.length, 1);
    assert.equal(noted[0]?.actor?.name, 'owner', 'found while somebody used it');
    // Asking again does not add a second record for the same damage.
    await download(instance, owner, '/artifacts/vanished/content');
    assert.equal(
      (await auditEvents(instance)).filter(
        (event) => event.action === 'artifact.broken' && event.details['artifact'] === 'vanished',
      ).length,
      1,
    );
  });

  it('asks for a session', async () => {
    const anonymous = instance.client();
    for (const path of ['/artifacts', '/artifacts/demo', '/artifacts/demo/versions/1.0.0']) {
      assert.equal((await anonymous.get(path)).status, 401, path);
    }
    assert.equal((await download(instance, anonymous, '/artifacts/demo/content')).status, 401);
  });
});

describe('the catalogue of this installation', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let owner: Client;

  before(async () => {
    // No SW_ARTIFACTS_DIR: the artifacts directory of the repository, which is also where the image keeps it.
    instance = await start();
    const { secret } = await createOwner(instance);
    owner = await signInAs(instance, 'owner', secret);
  });
  after(async () => {
    await stop(instance);
  });

  it('offers the node installer, intact, with its real hash', async () => {
    const view = ArtifactViewSchema.parse((await owner.get('/artifacts/node-installer')).body);
    const version = view.versions[0];
    assert.equal(version?.state, 'ok', version?.problem ?? '');
    const got = await download(instance, owner, '/artifacts/node-installer/content');
    assert.equal(got.status, 200);
    assert.equal(createHash('sha256').update(got.bytes).digest('hex'), version.sha256);
    assert.equal(got.headers.get('content-disposition'), 'attachment; filename="install.sh"');
    assert.ok(got.bytes.toString('utf8').startsWith('#!/bin/sh\n'));
  });
});
