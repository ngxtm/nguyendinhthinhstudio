export const ALBUM_NAMING_PROMPT_VERSION = 'artistic-collection-v2';

export const ARTISTIC_NAMING_POLICY = `Create a distinctive 2–4 word collection name.
Beauty, Fashion, Editorial, Glamour, Cyber, and modern studio concepts may use polished English editorial naming.
Áo dài, Vietnamese wedding, family, heritage, and traditional concepts should prefer poetic Vietnamese or Hán–Việt naming.
Write Hán–Việt in Vietnamese Latin spelling, never Chinese characters.
Use one coherent language with no awkward mixing.
Avoid generic or overused templates such as Nàng Thơ, Bộ Ảnh, Chàng Trai, Portrait, and Beauty Portrait, as well as literal visible-object lists.
Do not reuse a reserved or rejected title.
Visual details belong in SEO copy and image alt text, not in the collection name.`;

function normalizeText(value) {
    return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function normalizeSlug(value) {
    return normalizeText(value).toLowerCase();
}

export class AlbumTitleRegistry {
    #titlesBySlug = new Map();

    constructor(entries = []) {
        if (!Array.isArray(entries)) return;
        for (const entry of entries) {
            const title = normalizeText(entry?.title);
            const slug = normalizeSlug(entry?.slug);
            if (!title || !slug || this.#titlesBySlug.has(slug)) continue;
            this.#titlesBySlug.set(slug, title);
        }
    }

    hasSlug(slug) {
        const normalizedSlug = normalizeSlug(slug);
        return normalizedSlug ? this.#titlesBySlug.has(normalizedSlug) : false;
    }

    tryReserve(title, slug) {
        const normalizedTitle = normalizeText(title);
        const normalizedSlug = normalizeSlug(slug);
        if (!normalizedTitle || !normalizedSlug) {
            return { accepted: false, conflictTitle: null };
        }
        if (this.#titlesBySlug.has(normalizedSlug)) {
            return {
                accepted: false,
                conflictTitle: this.#titlesBySlug.get(normalizedSlug),
            };
        }
        this.#titlesBySlug.set(normalizedSlug, normalizedTitle);
        return { accepted: true, conflictTitle: null };
    }

    titles() {
        return [...this.#titlesBySlug.values()];
    }
}
