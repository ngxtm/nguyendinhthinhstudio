import { DEFAULT_SESSION_GAP_MINUTES } from './constants.mjs';

function tiffView(exif) {
    if (!Buffer.isBuffer(exif) || exif.length < 8) return null;
    const signature = exif.indexOf(Buffer.from('Exif\0\0', 'binary'));
    const start = signature >= 0 ? signature + 6 : 0;
    if (start + 8 > exif.length) return null;
    const order = exif.toString('ascii', start, start + 2);
    if (order !== 'II' && order !== 'MM') return null;
    const littleEndian = order === 'II';
    const readU16 = (offset) => {
        const absolute = start + offset;
        if (absolute < start || absolute + 2 > exif.length) return null;
        return littleEndian ? exif.readUInt16LE(absolute) : exif.readUInt16BE(absolute);
    };
    const readU32 = (offset) => {
        const absolute = start + offset;
        if (absolute < start || absolute + 4 > exif.length) return null;
        return littleEndian ? exif.readUInt32LE(absolute) : exif.readUInt32BE(absolute);
    };
    if (readU16(2) !== 42) return null;
    return { exif, start, readU16, readU32 };
}

function entries(view, ifdOffset) {
    const count = view.readU16(ifdOffset);
    if (count === null || count > 4096) return [];
    const result = [];
    for (let index = 0; index < count; index += 1) {
        const offset = ifdOffset + 2 + index * 12;
        const tag = view.readU16(offset);
        const type = view.readU16(offset + 2);
        const valueCount = view.readU32(offset + 4);
        const valueOffset = view.readU32(offset + 8);
        if ([tag, type, valueCount, valueOffset].some((value) => value === null)) break;
        result.push({ offset, tag, type, valueCount, valueOffset });
    }
    return result;
}

function asciiValue(view, entry) {
    if (entry.type !== 2 || entry.valueCount < 2 || entry.valueCount > 1024) return null;
    const dataOffset = entry.valueCount <= 4 ? entry.offset + 8 : entry.valueOffset;
    const start = view.start + dataOffset;
    const end = start + entry.valueCount;
    if (start < view.start || end > view.exif.length) return null;
    return view.exif.toString('ascii', start, end).replace(/\0+$/, '').trim();
}

function parseExifDate(value) {
    const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day ||
        date.getUTCHours() !== hour ||
        date.getUTCMinutes() !== minute ||
        date.getUTCSeconds() !== second
    ) {
        return null;
    }
    return date;
}

export function parseDateTimeOriginal(exif) {
    const view = tiffView(exif);
    if (!view) return null;
    const ifd0Offset = view.readU32(4);
    if (ifd0Offset === null) return null;
    const ifd0Entries = entries(view, ifd0Offset);
    const exifPointer = ifd0Entries.find((entry) => entry.tag === 0x8769);
    const candidateIfds = [ifd0Offset];
    if (exifPointer?.valueOffset) candidateIfds.unshift(exifPointer.valueOffset);
    for (const ifdOffset of candidateIfds) {
        const original = entries(view, ifdOffset).find((entry) => entry.tag === 0x9003);
        if (!original) continue;
        const value = asciiValue(view, original);
        if (!value) continue;
        const parsed = parseExifDate(value);
        if (parsed) return parsed;
    }
    return null;
}

export function groupCaptureSessions(
    records,
    { maxGapMinutes = DEFAULT_SESSION_GAP_MINUTES } = {},
) {
    if (!Number.isFinite(maxGapMinutes) || maxGapMinutes <= 0) {
        throw new TypeError('maxGapMinutes must be a positive number');
    }
    const known = records
        .filter((record) => record.capturedAt && Number.isFinite(Date.parse(record.capturedAt)))
        .toSorted((left, right) => {
            const byDate = Date.parse(left.capturedAt) - Date.parse(right.capturedAt);
            return byDate || left.relativePath.localeCompare(right.relativePath, 'vi');
        });
    const sessions = [];
    const maxGapMs = maxGapMinutes * 60 * 1000;
    for (const record of known) {
        const current = sessions.at(-1);
        const previous = current?.at(-1);
        if (
            !previous ||
            Date.parse(record.capturedAt) - Date.parse(previous.capturedAt) > maxGapMs
        ) {
            sessions.push([record]);
        } else {
            current.push(record);
        }
    }
    return sessions;
}
