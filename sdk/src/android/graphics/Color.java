package android.graphics;

public class Color {
    public static final int BLACK = 0xFF000000, DKGRAY = 0xFF444444, GRAY = 0xFF888888, LTGRAY = 0xFFCCCCCC, WHITE = 0xFFFFFFFF,
            RED = 0xFFFF0000, GREEN = 0xFF00FF00, BLUE = 0xFF0000FF, YELLOW = 0xFFFFFF00, CYAN = 0xFF00FFFF, MAGENTA = 0xFFFF00FF, TRANSPARENT = 0;
    public static int alpha(int color) { return color >>> 24; }
    public static int red(int color) { return (color >> 16) & 0xFF; }
    public static int green(int color) { return (color >> 8) & 0xFF; }
    public static int blue(int color) { return color & 0xFF; }
    public static int rgb(int red, int green, int blue) { return 0xFF000000 | (red << 16) | (green << 8) | blue; }
    public static int argb(int alpha, int red, int green, int blue) { return (alpha << 24) | (red << 16) | (green << 8) | blue; }
    public static void RGBToHSV(int red, int green, int blue, float[] hsv) {
        float r = red / 255f, g = green / 255f, b = blue / 255f;
        float max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), d = max - min;
        float h = 0;
        if (d != 0) {
            if (max == r) h = 60 * (((g - b) / d) % 6);
            else if (max == g) h = 60 * (((b - r) / d) + 2);
            else h = 60 * (((r - g) / d) + 4);
        }
        if (h < 0) h += 360;
        hsv[0] = h; hsv[1] = max == 0 ? 0 : d / max; hsv[2] = max;
    }
    public static void colorToHSV(int color, float[] hsv) { RGBToHSV(red(color), green(color), blue(color), hsv); }
    public static int HSVToColor(float[] hsv) { return HSVToColor(255, hsv); }
    public static int HSVToColor(int alpha, float[] hsv) {
        float h = hsv[0], s = hsv[1], v = hsv[2], c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r, g, b;
        if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
        return argb(alpha, Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
    }
    public static int parseColor(String s) {
        if (s.startsWith("#")) { long v = Long.parseLong(s.substring(1), 16); if (s.length() == 7) v |= 0xFF000000L; return (int) v; }
        throw new IllegalArgumentException("Unknown color " + s);
    }
}
