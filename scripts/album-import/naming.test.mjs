import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALBUM_NAMING_PROMPT_VERSION,
    ARTISTIC_NAMING_POLICY,
    AlbumTitleRegistry,
} from './naming.mjs';

test('artistic naming policy is versioned and contains the required editorial guidance', () => {
    assert.equal(ALBUM_NAMING_PROMPT_VERSION, 'artistic-collection-v2');
    assert.match(ARTISTIC_NAMING_POLICY, /distinctive 2[–-]4 word collection name/i);
    assert.match(
        ARTISTIC_NAMING_POLICY,
        /Beauty.*Fashion.*Editorial.*Glamour.*Cyber.*modern studio/is,
    );
    assert.match(ARTISTIC_NAMING_POLICY, /polished English editorial/i);
    assert.match(
        ARTISTIC_NAMING_POLICY,
        /áo dài.*Vietnamese wedding.*family.*heritage.*traditional/is,
    );
    assert.match(ARTISTIC_NAMING_POLICY, /poetic Vietnamese or Hán[–-]Việt/i);
    assert.match(ARTISTIC_NAMING_POLICY, /Vietnamese Latin spelling/i);
    assert.match(ARTISTIC_NAMING_POLICY, /never Chinese characters/i);
    assert.match(ARTISTIC_NAMING_POLICY, /one coherent language/i);
    assert.match(ARTISTIC_NAMING_POLICY, /no awkward mixing/i);
    assert.match(ARTISTIC_NAMING_POLICY, /Nàng Thơ/);
    assert.match(ARTISTIC_NAMING_POLICY, /Bộ Ảnh/);
    assert.match(ARTISTIC_NAMING_POLICY, /Chàng Trai/);
    assert.match(ARTISTIC_NAMING_POLICY, /Portrait/);
    assert.match(ARTISTIC_NAMING_POLICY, /Beauty Portrait/);
    assert.match(ARTISTIC_NAMING_POLICY, /literal visible-object lists/i);
    assert.match(ARTISTIC_NAMING_POLICY, /reserved or rejected title/i);
    assert.match(ARTISTIC_NAMING_POLICY, /SEO.*alt/is);
});

test('title registry normalizes slugs and preserves the first title in insertion order', () => {
    const registry = new AlbumTitleRegistry([
        { title: ' Midnight Frequency ', slug: ' Midnight-Frequency ' },
        { title: 'Xích Điệp', slug: 'xi\u0301ch-đie\u0323̂p' },
        { title: 'Duplicate', slug: 'MIDNIGHT-FREQUENCY' },
        { title: '', slug: 'invalid-title' },
        { title: 'Invalid slug', slug: '   ' },
        null,
    ]);

    assert.equal(registry.hasSlug('midnight-frequency'), true);
    assert.equal(registry.hasSlug(' XI\u0301CH-ĐIE\u0323̂P '), true);
    assert.deepEqual(registry.titles(), ['Midnight Frequency', 'Xích Điệp']);
    assert.deepEqual(registry.tryReserve('Another title', 'Midnight-Frequency'), {
        accepted: false,
        conflictTitle: 'Midnight Frequency',
    });
});

test('title registry reserves new normalized slugs and returns a stable title snapshot', () => {
    const registry = new AlbumTitleRegistry();

    assert.deepEqual(registry.tryReserve(' Xích Điệp ', ' XI\u0301CH-ĐIE\u0323̂P '), {
        accepted: true,
        conflictTitle: null,
    });
    const snapshot = registry.titles();
    assert.deepEqual(snapshot, ['Xích Điệp']);

    snapshot.push('Mutation');
    assert.deepEqual(registry.titles(), ['Xích Điệp']);
    assert.equal(registry.hasSlug(null), false);
    assert.deepEqual(registry.tryReserve('', 'valid-slug'), {
        accepted: false,
        conflictTitle: null,
    });
});
