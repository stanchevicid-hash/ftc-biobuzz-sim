package org.firstinspires.ftc.vision.apriltag;

import ftcsim.SimAprilTagProcessor;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Position;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.vision.VisionProcessor;

import java.util.ArrayList;

public abstract class AprilTagProcessor implements VisionProcessor {
    public static final int THREADS_DEFAULT = 3;
    public enum PoseSolver { APRILTAG_BUILTIN, OPENCV_ITERATIVE, OPENCV_SOLVEPNP_EPNP, OPENCV_IPPE, OPENCV_IPPE_SQUARE, OPENCV_SQPNP }
    public enum TagFamily { TAG_36h11, TAG_25h9, TAG_16h5, TAG_standard41h12 }

    public static AprilTagProcessor easyCreateWithDefaults() { return new Builder().build(); }

    public abstract void setDecimation(float decimation);
    public abstract void setPoseSolver(PoseSolver poseSolver);
    public abstract int getPerTagAvgPoseSolveTime();
    public abstract ArrayList<AprilTagDetection> getDetections();
    public abstract ArrayList<AprilTagDetection> getFreshDetections();
    /** simulator hook: which webcam feeds this processor */
    public abstract void simBind(String cameraName, Object portal, int width, int height);

    public static class Builder {
        AprilTagLibrary library = AprilTagGameDatabase.getCurrentGameTagLibrary();
        DistanceUnit distanceUnit = DistanceUnit.INCH; AngleUnit angleUnit = AngleUnit.DEGREES;
        TagFamily family = TagFamily.TAG_36h11;
        double fx, fy, cx, cy;
        Position cameraPosition = new Position(DistanceUnit.INCH, 0, 0, 0, 0);
        YawPitchRollAngles cameraOrientation = new YawPitchRollAngles(AngleUnit.DEGREES, 0, 0, 0, 0);
        public Builder setCameraPose(Position position, YawPitchRollAngles orientation) { cameraPosition = position; cameraOrientation = orientation; return this; }
        public Builder setLensIntrinsics(double fx, double fy, double cx, double cy) { this.fx = fx; this.fy = fy; this.cx = cx; this.cy = cy; return this; }
        public Builder setSuppressCalibrationWarnings(boolean suppress) { return this; }
        public Builder setTagFamily(TagFamily tagFamily) { family = tagFamily; return this; }
        public Builder setTagLibrary(AprilTagLibrary tagLibrary) { library = tagLibrary; return this; }
        public Builder setOutputUnits(DistanceUnit d, AngleUnit a) { distanceUnit = d; angleUnit = a; return this; }
        public Builder setDrawAxes(boolean drawAxes) { return this; }
        public Builder setDrawCubeProjection(boolean drawCube) { return this; }
        public Builder setDrawTagOutline(boolean drawOutline) { return this; }
        public Builder setDrawTagID(boolean drawTagId) { return this; }
        public Builder setNumThreads(int threads) { return this; }
        public AprilTagProcessor build() {
            if (library == null) throw new RuntimeException("Cannot create AprilTagProcessor without setting tag library!");
            if (family == null) throw new RuntimeException("Cannot create AprilTagProcessor without setting tag family!");
            return new SimAprilTagProcessor(library, distanceUnit, angleUnit, family, cameraPosition, cameraOrientation);
        }
    }
}
