// ============================================================
// BobPong - Game Configuration Constants
// ============================================================

export const CONFIG = {
    // Canvas — scale up to fill more screen
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 900,

    // Backgrounds — one static, one animated (randomly chosen per game)
    BG_IMAGE: 'assets/spritesheets/tempbackground.png',
    BG_ALT_IMAGES: [
        'assets/spritesheets/background1.png',
        'assets/spritesheets/background2.png',
        'assets/spritesheets/background3.png',
        'assets/spritesheets/background4.png',
    ],
    BG_ALT_FPS: 6,             // animation speed for alt background

    // Player arm image
    ARM_IMAGE: 'assets/spritesheets/arm_with_ping_pong.png',
    ARM_WIDTH: 60,
    ARM_HEIGHT: 100,

    // Throw animation spritesheet (3 columns x 3 rows, 9 frames)
    THROW_SHEET: 'assets/spritesheets/throw_spritesheet.png',
    THROW_FRAME_W: 341,        // source frame width (1024 / 3)
    THROW_FRAME_H: 512,        // source frame height (1536 / 3)
    THROW_CROP_BOTTOM: 0.75,   // only use top 75% of each frame (crop empty space)
    THROW_COLS: 3,
    THROW_FRAMES: 9,           // all 9 frames
    THROW_FPS: 32,             // animation speed
    THROW_DRAW_W: 160,         // rendered width on screen
    THROW_DRAW_H: 200,         // rendered height

    // Drunk Bob character (stands behind the far end of the table)
    BOB_IMAGE: 'assets/spritesheets/drunk_bob.png',
    BOB_ALT_IMAGE: 'assets/spritesheets/drunk_bob2.png',
    BOB_WIDTH: 240,
    BOB_HEIGHT: 281,
    BOB_ALT_WIDTH: 180,        // drunk_bob2 at 50% size
    BOB_ALT_HEIGHT: 211.5,
    BOB_OFFSET_Y: -170,        // shift up from table top edge (negative = higher)
    BOB_ALT_OFFSET_Y: -130,     // adjusted for smaller size

    // Bartender (top-left corner, behind bar counter, only with original background)
    BARTENDER_IMAGE: 'assets/spritesheets/bar_tender.png',
    BARTENDER_WIDTH: 158,
    BARTENDER_HEIGHT: 178,
    BARTENDER_X: 76,            // pixels from left edge of canvas
    BARTENDER_Y: 0,             // top of image at top of canvas (head cropped off)

    // Table image — scaled 1.255x from native 408x612 (92% of previous 1.364x)
    TABLE_IMAGE: 'assets/spritesheets/BobPong_Table.png',
    TABLE_IMG_WIDTH: 408,
    TABLE_IMG_HEIGHT: 612,
    TABLE_DRAW_WIDTH: 512,     // 408 * 1.255
    TABLE_DRAW_HEIGHT: 768,    // 612 * 1.255
    TABLE_CROP_FRAC: 0.85,    // show top 85% (legs visible for depth)
    TABLE_X: 344,              // centered: (1200 - 512) / 2
    TABLE_Y: 245,              // adjusted for smaller table

    // Table surface bounds (pixel coords within the DRAWN table, after scaling)
    SURFACE_FAR_Y: 19,
    SURFACE_NEAR_Y: 550,
    SURFACE_FAR_LEFT: 125,
    SURFACE_FAR_RIGHT: 386,
    SURFACE_NEAR_LEFT: 6,
    SURFACE_NEAR_RIGHT: 506,

    // Cup image
    CUP_IMAGE: 'assets/spritesheets/partycup.png',
    CUP_IMG_SIZE: 500,

    // Cup placement — t: 0=near edge, 1=far edge
    NEAR_CUP_T: 0.10,         // very close to player's edge
    FAR_CUP_T: 0.92,          // pushed far back toward opponent's edge
    CUP_SPACING_NEAR: 57,     // 92% of previous
    CUP_SPACING_FAR: 29,      // 92% of previous
    CUP_ROW_SPACING_RATIO: 0.55,
    CUP_SIZE_NEAR: 91,        // 92% of previous
    CUP_SIZE_FAR: 46,         // 92% of previous
    CUP_ROWS: [4, 3, 2, 1],  // 10-cup triangle

    // Ball
    BALL_RADIUS: 13,           // screen pixels at near side (reduced 10%)
    MAX_THROW_SPEED: 3200,     // world units/s
    GRAVITY: 1800,             // world units/s^2
    FIXED_ELEVATION_ANGLE: 0.65,
    BOUNCE_RESTITUTION: 0.75,
    BOUNCE_FRICTION: 0.85,
    BOUNCE_SETTLE_THRESHOLD: 15,

    // World-space table (used for physics — maps to pixel positions via interpolation)
    TABLE_LENGTH: 2400,
    TABLE_WIDTH: 600,

    // Cup collision (world space)
    CUP_RADIUS: 30,
    RIM_INNER_RATIO: 0.7,
    RIM_BOUNCE_OUT_CHANCE: 0.1,

    // Player
    PLAYER_MOVE_SPEED: 300,
    PLAYER_MIN_X: 100,
    PLAYER_MAX_X: 500,
    PLAYER_START_X: 300,
    PLAYER_HAND_Z: 100,

    // Power meter
    MAX_CHARGE_TIME: 2000,

    // Physics
    PHYSICS_DT: 1 / 60,

    // Colors (for HUD elements only now)
    COLOR_CROSSHAIR: 'rgba(255, 255, 255, 0.8)',
    COLOR_POWER_LOW: '#44CC44',
    COLOR_POWER_MID: '#CCCC44',
    COLOR_POWER_HIGH: '#CC4444',
    COLOR_POWER_SWEET: '#00FF88',
    COLOR_HUD_TEXT: '#FFFFFF',
    COLOR_MENU_BG: '#0d0d1a',
    COLOR_MENU_BUTTON: '#2a2a4a',
    COLOR_MENU_BUTTON_HOVER: '#3a3a6a',
    COLOR_MENU_TEXT: '#FFFFFF',
    COLOR_TITLE: '#FFD700',
    COLOR_BALL_SHADOW: 'rgba(0, 0, 0, 0.3)',

    // Power sweet spot — these are the BASE values at full sobriety (10 cups).
    // The center stays fixed; the width scales with intoxication.
    POWER_CENTER: 0.63,          // center of the sweet zones
    // Half-widths at 10 cups (sober) — 2x the original sizes
    POWER_SWEET_HALF_SOBER: 0.10,   // sweet zone spans center ± 0.10 = 0.53–0.73
    POWER_PERFECT_HALF_SOBER: 0.04, // perfect zone spans center ± 0.04 = 0.59–0.67
    // Half-widths at 1 cup (wasted) — 0.5x the original sizes
    POWER_SWEET_HALF_DRUNK: 0.025,  // sweet zone spans center ± 0.025 = 0.605–0.655
    POWER_PERFECT_HALF_DRUNK: 0.01, // perfect zone spans center ± 0.01 = 0.62–0.64

    // Rerack thresholds
    RERACK_THRESHOLDS: [6, 3, 2, 1],

    // AI
    AI_THINK_DELAY_MIN: 1000,
    AI_THINK_DELAY_MAX: 2500,
    AI_DIFFICULTY: {
        easy: { angleNoise: 0.15, powerNoise: 0.15 },
        medium: { angleNoise: 0.08, powerNoise: 0.08 },
        hard: { angleNoise: 0.03, powerNoise: 0.03 },
    },

    // Turn switch
    TURN_SWITCH_DELAY: 1500,

    // Ball trail
    TRAIL_LENGTH: 15,
    TRAIL_ALPHA_START: 0.4,

    // Near cup world Y offset and far cup world Y offset
    NEAR_CUP_START_Y: 350,
    FAR_CUP_START_Y: 200,
};
