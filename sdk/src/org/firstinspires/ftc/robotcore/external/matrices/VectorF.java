package org.firstinspires.ftc.robotcore.external.matrices;

public class VectorF {
    protected final float[] data;
    public VectorF(float[] data) { this.data = data.clone(); }
    public VectorF(float x) { data = new float[]{x}; }
    public VectorF(float x, float y) { data = new float[]{x, y}; }
    public VectorF(float x, float y, float z) { data = new float[]{x, y, z}; }
    public VectorF(float x, float y, float z, float w) { data = new float[]{x, y, z, w}; }
    public static VectorF length(int length) { return new VectorF(new float[length]); }
    public float[] getData() { return data; }
    public int length() { return data.length; }
    public float get(int index) { return data[index]; }
    public void put(int index, float value) { data[index] = value; }
    public float magnitude() { double s = 0; for (float f : data) s += f * f; return (float) Math.sqrt(s); }
    public VectorF normalized3D() { float m = magnitude(); return new VectorF(data[0] / m, data[1] / m, data[2] / m); }
    public float dotProduct(VectorF him) { float s = 0; for (int i = 0; i < data.length; i++) s += data[i] * him.data[i]; return s; }
    public VectorF added(VectorF him) { float[] r = data.clone(); for (int i = 0; i < r.length; i++) r[i] += him.data[i]; return new VectorF(r); }
    public VectorF subtracted(VectorF him) { float[] r = data.clone(); for (int i = 0; i < r.length; i++) r[i] -= him.data[i]; return new VectorF(r); }
    public VectorF multiplied(float scale) { float[] r = data.clone(); for (int i = 0; i < r.length; i++) r[i] *= scale; return new VectorF(r); }
    @Override public String toString() { StringBuilder b = new StringBuilder("{"); for (int i = 0; i < data.length; i++) { if (i > 0) b.append(' '); b.append(String.format("%.2f", data[i])); } return b.append('}').toString(); }
}
