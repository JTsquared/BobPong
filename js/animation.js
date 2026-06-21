// ============================================================
// BobPong - Animation System
// ============================================================

export class Animation {
    constructor(frameCount, fps, loop = false) {
        this.frameCount = frameCount;
        this.fps = fps;
        this.loop = loop;
        this.currentFrame = 0;
        this.elapsed = 0;
        this.active = false;
        this.x = 0;
        this.y = 0;
    }

    start(x, y) {
        this.x = x;
        this.y = y;
        this.currentFrame = 0;
        this.elapsed = 0;
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;

        this.elapsed += dt;
        const frameDuration = 1 / this.fps;

        if (this.elapsed >= frameDuration) {
            this.elapsed -= frameDuration;
            this.currentFrame++;

            if (this.currentFrame >= this.frameCount) {
                if (this.loop) {
                    this.currentFrame = 0;
                } else {
                    this.active = false;
                    this.currentFrame = this.frameCount - 1;
                }
            }
        }
    }
}
