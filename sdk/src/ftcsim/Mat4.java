package ftcsim;

import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;

/** Minimal 4x4 rigid-transform math (row-major), mirrors the OpenGLMatrix calls the SDK uses for AprilTag poses. */
public final class Mat4 {
    public final double[] m = new double[16];
    public static Mat4 identity() { Mat4 a = new Mat4(); a.m[0] = a.m[5] = a.m[10] = a.m[15] = 1; return a; }
    public static Mat4 translation(double x, double y, double z) { Mat4 a = identity(); a.m[3] = x; a.m[7] = y; a.m[11] = z; return a; }
    public static Mat4 rotation(MatrixF r) { Mat4 a = identity(); for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) a.m[i * 4 + j] = r.get(i, j); return a; }
    public Mat4 times(Mat4 b) {
        Mat4 c = new Mat4();
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) { double s = 0; for (int k = 0; k < 4; k++) s += m[i * 4 + k] * b.m[k * 4 + j]; c.m[i * 4 + j] = s; }
        return c;
    }
    /** inverse of a rigid transform [R t; 0 1] */
    public Mat4 inverted() {
        Mat4 c = identity();
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) c.m[i * 4 + j] = m[j * 4 + i];
        for (int i = 0; i < 3; i++) c.m[i * 4 + 3] = -(c.m[i * 4] * m[3] + c.m[i * 4 + 1] * m[7] + c.m[i * 4 + 2] * m[11]);
        return c;
    }
    public double tx() { return m[3]; }
    public double ty() { return m[7]; }
    public double tz() { return m[11]; }
    public MatrixF rot() {
        double[][] r = new double[3][3];
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) r[i][j] = m[i * 4 + j];
        return org.firstinspires.ftc.robotcore.external.matrices.GeneralMatrixF.of(r);
    }
}
