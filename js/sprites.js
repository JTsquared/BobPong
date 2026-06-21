// ============================================================
// BobPong - Sprite Loader
// ============================================================

import { CONFIG } from './config.js';

export class SpriteLoader {
    constructor() {
        this.images = {};
        this.loaded = 0;
        this.total = 0;
    }

    load(name, src) {
        this.total++;
        const img = new Image();
        img.onload = () => {
            this.images[name] = img;
            this.loaded++;
        };
        img.onerror = () => {
            console.warn(`Failed to load: ${name} (${src})`);
            this.loaded++;
        };
        img.src = src;
    }

    loadAll() {
        this.load('background', CONFIG.BG_IMAGE);
        CONFIG.BG_ALT_IMAGES.forEach((src, i) => {
            this.load(`bgAlt${i}`, src);
        });
        this.load('table', CONFIG.TABLE_IMAGE);
        this.load('cup', CONFIG.CUP_IMAGE);
        this.load('bob', CONFIG.BOB_IMAGE);
        this.load('bobAlt', CONFIG.BOB_ALT_IMAGE);
        this.load('arm', CONFIG.ARM_IMAGE);
        this.load('throwSheet', CONFIG.THROW_SHEET);
    }

    isReady() {
        return this.loaded >= this.total;
    }

    get(name) {
        return this.images[name] || null;
    }
}
