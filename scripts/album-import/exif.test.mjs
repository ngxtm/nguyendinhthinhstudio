import assert from 'node:assert/strict';
import test from 'node:test';

import { groupCaptureSessions, parseDateTimeOriginal } from './exif.mjs';

function littleEndianExif(dateText) {
    const date = Buffer.from(`${dateText}\0`, 'ascii');
    const buffer = Buffer.alloc(6 + 8 + 2 + 12 + 4 + 2 + 12 + 4 + date.length);
    buffer.write('Exif\0\0', 0, 'binary');
    const tiff = 6;
    buffer.write('II', tiff, 'ascii');
    buffer.writeUInt16LE(42, tiff + 2);
    buffer.writeUInt32LE(8, tiff + 4);
    const ifd0 = tiff + 8;
    buffer.writeUInt16LE(1, ifd0);
    buffer.writeUInt16LE(0x8769, ifd0 + 2);
    buffer.writeUInt16LE(4, ifd0 + 4);
    buffer.writeUInt32LE(1, ifd0 + 6);
    const exifIfdOffset = 8 + 2 + 12 + 4;
    buffer.writeUInt32LE(exifIfdOffset, ifd0 + 10);
    const exifIfd = tiff + exifIfdOffset;
    buffer.writeUInt16LE(1, exifIfd);
    buffer.writeUInt16LE(0x9003, exifIfd + 2);
    buffer.writeUInt16LE(2, exifIfd + 4);
    buffer.writeUInt32LE(date.length, exifIfd + 6);
    const dateOffset = exifIfdOffset + 2 + 12 + 4;
    buffer.writeUInt32LE(dateOffset, exifIfd + 10);
    date.copy(buffer, tiff + dateOffset);
    return buffer;
}

test('reads DateTimeOriginal from EXIF rather than filesystem timestamps', () => {
    const capturedAt = parseDateTimeOriginal(littleEndianExif('2025:02:25 11:41:12'));
    assert.equal(capturedAt?.toISOString(), '2025-02-25T11:41:12.000Z');
});

test('returns null when EXIF DateTimeOriginal is absent', () => {
    assert.equal(parseDateTimeOriginal(Buffer.from('not exif')), null);
});

test('groups chronologically adjacent captures and splits at a 90-minute gap', () => {
    const records = [
        { relativePath: 'c.jpg', capturedAt: '2025-02-25T13:00:01.000Z' },
        { relativePath: 'a.jpg', capturedAt: '2025-02-25T10:00:00.000Z' },
        { relativePath: 'b.jpg', capturedAt: '2025-02-25T10:30:00.000Z' },
    ];

    const sessions = groupCaptureSessions(records);

    assert.deepEqual(
        sessions.map((session) => session.map((record) => record.relativePath)),
        [['a.jpg', 'b.jpg'], ['c.jpg']],
    );
});

test('keeps missing EXIF records out of automatic sessions', () => {
    const sessions = groupCaptureSessions([
        { relativePath: 'known.jpg', capturedAt: '2025-02-25T10:00:00.000Z' },
        { relativePath: 'unknown.jpg', capturedAt: null },
    ]);

    assert.deepEqual(
        sessions.map((session) => session.map((record) => record.relativePath)),
        [['known.jpg']],
    );
});
