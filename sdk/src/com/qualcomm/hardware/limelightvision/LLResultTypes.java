package com.qualcomm.hardware.limelightvision;

import org.firstinspires.ftc.robotcore.external.navigation.Pose3D;
import org.firstinspires.ftc.robotcore.external.navigation.Position;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

import java.util.List;

public class LLResultTypes {
    static Pose3D zero() { return new Pose3D(new Position(DistanceUnit.METER, 0, 0, 0, 0), new YawPitchRollAngles(AngleUnit.DEGREES, 0, 0, 0, 0)); }

    public static class FiducialResult {
        final int id; final double tx, ty, ta, txp, typ; final Pose3D targetInCamera;
        FiducialResult(int id, double tx, double ty, double ta, double txp, double typ, Pose3D targetInCamera) {
            this.id = id; this.tx = tx; this.ty = ty; this.ta = ta; this.txp = txp; this.typ = typ; this.targetInCamera = targetInCamera;
        }
        public int getFiducialId() { return id; }
        public String getFamily() { return "36H11C"; }
        public double getSkew() { return 0; }
        public double getTargetXDegrees() { return tx; }
        public double getTargetYDegrees() { return ty; }
        public double getTargetXDegreesNoCrosshair() { return tx; }
        public double getTargetYDegreesNoCrosshair() { return ty; }
        public double getTargetXPixels() { return txp; }
        public double getTargetYPixels() { return typ; }
        public double getTargetArea() { return ta; }
        public Pose3D getTargetPoseCameraSpace() { return targetInCamera; }
        public Pose3D getRobotPoseFieldSpace() { return zero(); }
        public Pose3D getRobotPoseTargetSpace() { return zero(); }
        public Pose3D getCameraPoseTargetSpace() { return zero(); }
        public Pose3D getTargetPoseRobotSpace() { return zero(); }
        public List<List<Double>> getTargetCorners() { return new java.util.ArrayList<List<Double>>(); }
    }
    public static class ColorResult {
        public double getTargetXDegrees() { return 0; }
        public double getTargetYDegrees() { return 0; }
        public double getTargetArea() { return 0; }
    }
    public static class DetectorResult { public String getClassName() { return ""; } public double getConfidence() { return 0; } public double getTargetArea() { return 0; } public double getTargetXDegrees() { return 0; } public double getTargetYDegrees() { return 0; } }
    public static class ClassifierResult { public String getClassName() { return ""; } public double getConfidence() { return 0; } }
    public static class BarcodeResult { public String getData() { return ""; } }
}
