import 'dotenv/config';
import assert from 'node:assert/strict';

const ensureDbEnv = () => {
  if (!process.env.COOLBITS_DATABASE_URL) {
    process.env.COOLBITS_DATABASE_URL = 'postgres://coolbits:coolbits@localhost:5432/coolbits';
  }
};

const run = async () => {
  ensureDbEnv();

  const {
    __test: cbplTest,
  } = await import('../app/server/services/payloadService.js');
  const {
    createRunPreview,
    consumeRunPreview,
    __test: previewTest,
  } = await import('../app/server/services/runPreviewService.js');

  const baseCbpl = {
    schemaVersion: 'cbpl.v1',
    kind: 'selection',
    selection: {
      workspaceId: 'business',
      connector: 'ga4',
      ga4: {
        propertyId: '123',
        from: '2025-01-01',
        to: '2025-01-07',
        blocks: ['overview'],
        compareMode: 'none',
        compareFrom: null,
        compareTo: null,
      },
    },
    payload: {
      querySpec: {
        blocks: ['overview'],
      },
    },
    availability: {
      'ga4.overview': { status: 'available' },
    },
  };

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });
  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const expectErrorCode = (fn, code) => {
    let err = null;
    try {
      fn();
    } catch (error) {
      err = error;
    }
    assert.ok(err, `Expected error ${code}`);
    assert.equal(err.code, code);
  };

  test('CBPL validation rejects missing schemaVersion', async () => {
    const missing = clone(baseCbpl);
    delete missing.schemaVersion;
    const result = await cbplTest.validateCbpl(missing);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('schema_version_invalid'));
  });

  test('Hash stable across key order changes', () => {
    const a = clone(baseCbpl);
    const b = {
      kind: baseCbpl.kind,
      schemaVersion: baseCbpl.schemaVersion,
      availability: baseCbpl.availability,
      payload: baseCbpl.payload,
      selection: baseCbpl.selection,
    };
    const hashA = cbplTest.computeCbplHash(a).hash;
    const hashB = cbplTest.computeCbplHash(b).hash;
    assert.equal(hashA, hashB);
  });

  test('Hash ignores name differences (dedupe stability)', () => {
    const a = { ...clone(baseCbpl), name: 'First payload' };
    const b = { ...clone(baseCbpl), name: 'Second payload' };
    const hashA = cbplTest.computeCbplHash(a).hash;
    const hashB = cbplTest.computeCbplHash(b).hash;
    assert.equal(hashA, hashB);
  });

  test('Size cap rejection triggers cbpl_too_large', () => {
    const huge = clone(baseCbpl);
    huge.payload = { blob: 'a'.repeat(cbplTest.MAX_CBPL_BYTES + 16) };
    const { canonical } = cbplTest.computeCbplHash(huge);
    expectErrorCode(() => cbplTest.assertCbplSize(canonical), 'cbpl_too_large');
  });

  test('payloadIds normalization enforces max count and dedupes', () => {
    const ids = Array.from({ length: cbplTest.MAX_PAYLOAD_IDS + 1 }, (_v, i) => `id-${i}`);
    expectErrorCode(() => cbplTest.normalizePayloadIds(ids), 'payload_ids_too_many');

    const normalized = cbplTest.normalizePayloadIds(['a', 'a', 'b', '']);
    assert.deepEqual(normalized.ids, ['a', 'b']);
  });

  test('Preview TTL expires and consume returns null', () => {
    previewTest.resetStore();
    previewTest.setNowFn(() => 0);
    const preview = createRunPreview({
      userId: 'user-1',
      workspaceId: 'ws-1',
      payloadIds: [],
      payloadHashes: [],
    });
    previewTest.setNowFn(() => previewTest.PREVIEW_TTL_MS + 1);
    previewTest.sweep();
    const consumed = consumeRunPreview(preview.previewId, { userId: 'user-1', workspaceId: 'ws-1' });
    assert.equal(consumed, null);
  });

  test('Preview caps evict oldest per user', () => {
    previewTest.resetStore();
    const total = previewTest.MAX_PREVIEWS_PER_USER + 5;
    for (let i = 0; i < total; i += 1) {
      previewTest.setNowFn(() => i);
      createRunPreview({
        userId: 'user-2',
        workspaceId: 'ws-2',
        payloadIds: [],
        payloadHashes: [],
      });
    }
    assert.ok(previewTest.getCount() <= previewTest.MAX_PREVIEWS_PER_USER);
  });

  test('Preview enforces payloadIds cap', () => {
    previewTest.resetStore();
    const ids = Array.from({ length: cbplTest.MAX_PAYLOAD_IDS + 1 }, (_v, i) => `id-${i}`);
    expectErrorCode(
      () => createRunPreview({ userId: 'user-3', workspaceId: 'ws-3', payloadIds: ids, payloadHashes: [] }),
      'payload_ids_too_many',
    );
  });

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`[ok] ${t.name}`);
    } catch (err) {
      console.error(`[fail] ${t.name}`);
      console.error(err);
      process.exitCode = 1;
      break;
    }
  }
};

run().catch((err) => {
  console.error('[fatal]', err);
  process.exitCode = 1;
});
