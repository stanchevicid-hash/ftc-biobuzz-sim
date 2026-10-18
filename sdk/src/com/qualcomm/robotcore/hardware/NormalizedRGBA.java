package com.qualcomm.robotcore.hardware;

public class NormalizedRGBA {
    public float red, green, blue, alpha;
    public int toColor() {
        int r = Math.min(255, Math.max(0, Math.round(red * 255)));
        int g = Math.min(255, Math.max(0, Math.round(green * 255)));
        int b = Math.min(255, Math.max(0, Math.round(blue * 255)));
        int a = Math.min(255, Math.max(0, Math.round(alpha * 255)));
        return (a << 24) | (r << 16) | (g << 8) | b;
    }
}
