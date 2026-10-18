package org.firstinspires.ftc.robotcore.external.navigation;

import org.firstinspires.ftc.robotcore.external.matrices.GeneralMatrixF;
import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;
import org.firstinspires.ftc.robotcore.external.matrices.VectorF;
import java.util.Locale;

public class Quaternion {
    public float w, x, y, z;
    public long acquisitionTime;
    public static Quaternion identityQuaternion() { return new Quaternion(1, 0, 0, 0, 0); }
    public Quaternion() { this(1, 0, 0, 0, 0); }
    public Quaternion(float w, float x, float y, float z, long acquisitionTime) { this.w = w; this.x = x; this.y = y; this.z = z; this.acquisitionTime = acquisitionTime; }
    public static Quaternion fromMatrix(MatrixF m, long acquisitionTime) {
        double t = m.get(0, 0) + m.get(1, 1) + m.get(2, 2), w, x, y, z;
        if (t > 0) { double s = Math.sqrt(t + 1) * 2; w = s / 4; x = (m.get(2, 1) - m.get(1, 2)) / s; y = (m.get(0, 2) - m.get(2, 0)) / s; z = (m.get(1, 0) - m.get(0, 1)) / s; }
        else if (m.get(0, 0) > m.get(1, 1) && m.get(0, 0) > m.get(2, 2)) { double s = Math.sqrt(1 + m.get(0, 0) - m.get(1, 1) - m.get(2, 2)) * 2; w = (m.get(2, 1) - m.get(1, 2)) / s; x = s / 4; y = (m.get(0, 1) + m.get(1, 0)) / s; z = (m.get(0, 2) + m.get(2, 0)) / s; }
        else if (m.get(1, 1) > m.get(2, 2)) { double s = Math.sqrt(1 + m.get(1, 1) - m.get(0, 0) - m.get(2, 2)) * 2; w = (m.get(0, 2) - m.get(2, 0)) / s; x = (m.get(0, 1) + m.get(1, 0)) / s; y = s / 4; z = (m.get(1, 2) + m.get(2, 1)) / s; }
        else { double s = Math.sqrt(1 + m.get(2, 2) - m.get(0, 0) - m.get(1, 1)) * 2; w = (m.get(1, 0) - m.get(0, 1)) / s; x = (m.get(0, 2) + m.get(2, 0)) / s; y = (m.get(1, 2) + m.get(2, 1)) / s; z = s / 4; }
        return new Quaternion((float) w, (float) x, (float) y, (float) z, acquisitionTime);
    }
    public float magnitude() { return (float) Math.sqrt(w * w + x * x + y * y + z * z); }
    public Quaternion normalized() { float m = magnitude(); return new Quaternion(w / m, x / m, y / m, z / m, acquisitionTime); }
    public Quaternion conjugate() { return new Quaternion(w, -x, -y, -z, acquisitionTime); }
    @Deprecated public Quaternion congugate() { return conjugate(); }
    public Quaternion inverse() { return normalized().conjugate(); }
    public Quaternion multiply(Quaternion q, long acquisitionTime) {
        return new Quaternion(w * q.w - x * q.x - y * q.y - z * q.z, w * q.x + x * q.w + y * q.z - z * q.y,
                w * q.y - x * q.z + y * q.w + z * q.x, w * q.z + x * q.y - y * q.x + z * q.w, acquisitionTime);
    }
    public VectorF applyToVector(VectorF v) {
        Quaternion p = new Quaternion(0, v.get(0), v.get(1), v.get(2), 0);
        Quaternion r = multiply(p, 0).multiply(inverse(), 0);
        return new VectorF(r.x, r.y, r.z);
    }
    public MatrixF toMatrix() {
        double xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
        return GeneralMatrixF.of(new double[][]{
                {1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)},
                {2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)},
                {2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)}});
    }
    public Orientation toOrientation(AxesReference ref, AxesOrder order, AngleUnit unit) {
        Orientation o = Orientation.getOrientation(toMatrix(), ref, order, unit); o.acquisitionTime = acquisitionTime; return o;
    }
    @Override public String toString() { return String.format(Locale.US, "{w=%.3f, x=%.3f, y=%.3f, z=%.3f}", w, x, y, z); }
}
