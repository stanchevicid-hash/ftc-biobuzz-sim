package org.firstinspires.ftc.robotcore.external.navigation;

import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;
import org.firstinspires.ftc.robotcore.external.matrices.GeneralMatrixF;
import java.util.Locale;

public class Orientation {
    public AxesReference axesReference;
    public AxesOrder axesOrder;
    public AngleUnit angleUnit;
    public float firstAngle, secondAngle, thirdAngle;
    public long acquisitionTime;

    public Orientation() { this(AxesReference.EXTRINSIC, AxesOrder.XYZ, AngleUnit.RADIANS, 0, 0, 0, 0); }
    public Orientation(AxesReference axesReference, AxesOrder axesOrder, AngleUnit angleUnit, float firstAngle, float secondAngle, float thirdAngle, long acquisitionTime) {
        this.axesReference = axesReference; this.axesOrder = axesOrder; this.angleUnit = angleUnit;
        this.firstAngle = firstAngle; this.secondAngle = secondAngle; this.thirdAngle = thirdAngle; this.acquisitionTime = acquisitionTime;
    }
    public Orientation toAngleUnit(AngleUnit u) {
        if (u == angleUnit) return this;
        return new Orientation(axesReference, axesOrder, u, u.fromUnit(angleUnit, firstAngle), u.fromUnit(angleUnit, secondAngle), u.fromUnit(angleUnit, thirdAngle), acquisitionTime);
    }
    public Orientation toAxesReference(AxesReference r) { return r == axesReference ? this : getOrientation(getRotationMatrix(), r, axesOrder, angleUnit); }
    public Orientation toAxesOrder(AxesOrder o) { return o == axesOrder ? this : getOrientation(getRotationMatrix(), axesReference, o, angleUnit); }
    @Override public String toString() {
        return String.format(Locale.US, "{%s %s %.0f %.0f %.0f}", axesReference, axesOrder, firstAngle, secondAngle, thirdAngle);
    }
    public MatrixF getRotationMatrix() { return getRotationMatrix(axesReference, axesOrder, angleUnit, firstAngle, secondAngle, thirdAngle); }

    static double[][] axisRot(int axis, double a) {
        double c = Math.cos(a), s = Math.sin(a);
        switch (axis) {
            case 0: return new double[][]{{1, 0, 0}, {0, c, -s}, {0, s, c}};
            case 1: return new double[][]{{c, 0, s}, {0, 1, 0}, {-s, 0, c}};
            default: return new double[][]{{c, -s, 0}, {s, c, 0}, {0, 0, 1}};
        }
    }
    static double[][] mul(double[][] a, double[][] b) {
        double[][] r = new double[3][3];
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) for (int k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j];
        return r;
    }
    public static MatrixF getRotationMatrix(AxesReference ref, AxesOrder order, AngleUnit unit, float firstAngle, float secondAngle, float thirdAngle) {
        int[] ix = order.indices();
        double a1 = unit.toRadians(firstAngle), a2 = unit.toRadians(secondAngle), a3 = unit.toRadians(thirdAngle);
        double[][] r = ref == AxesReference.INTRINSIC
                ? mul(mul(axisRot(ix[0], a1), axisRot(ix[1], a2)), axisRot(ix[2], a3))
                : mul(mul(axisRot(ix[2], a3), axisRot(ix[1], a2)), axisRot(ix[0], a1));
        return GeneralMatrixF.of(r);
    }
    public static Orientation getOrientation(MatrixF rot, AxesReference ref, AxesOrder order, AngleUnit unit) {
        double[][] r = new double[3][3];
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) r[i][j] = rot.get(i, j);
        int[] ix = order.indices();
        boolean intrinsic = ref == AxesReference.INTRINSIC;
        // an extrinsic rotation in order (a,b,c) equals the intrinsic one in order (c,b,a) with the angles reversed
        int i = intrinsic ? ix[0] : ix[2], j = ix[1], k = intrinsic ? ix[2] : ix[0];
        double t1, t2, t3;
        if (i != k) { // Tait-Bryan
            double s = ((j - i + 3) % 3 == 1) ? 1 : -1;
            t2 = Math.asin(Math.max(-1, Math.min(1, s * r[i][k])));
            t1 = Math.atan2(-s * r[j][k], r[k][k]);
            t3 = Math.atan2(-s * r[i][j], r[i][i]);
        } else { // proper Euler (i == k)
            int m = 3 - i - j;
            double s = ((j - i + 3) % 3 == 1) ? 1 : -1;
            t2 = Math.acos(Math.max(-1, Math.min(1, r[i][i])));
            t1 = Math.atan2(r[j][i], -s * r[m][i]);
            t3 = Math.atan2(r[i][j], s * r[i][m]);
        }
        double f = intrinsic ? t1 : t3, sec = t2, th = intrinsic ? t3 : t1;
        return new Orientation(ref, order, unit, (float) unit.fromRadians(f), (float) unit.fromRadians(sec), (float) unit.fromRadians(th), 0);
    }
    public static Orientation getOrientation(MatrixF rot, AxesReference ref, AxesOrder order, AngleUnit unit, AngleSet angleSet) {
        return getOrientation(rot, ref, order, unit);
    }
    public enum AngleSet { THEONE, THEOTHER }
}
