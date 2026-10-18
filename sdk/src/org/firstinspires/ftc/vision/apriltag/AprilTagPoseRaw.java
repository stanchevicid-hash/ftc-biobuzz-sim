package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;

public class AprilTagPoseRaw {
    public final double x, y, z;
    public final MatrixF R;
    public AprilTagPoseRaw(double x, double y, double z, MatrixF R) { this.x = x; this.y = y; this.z = z; this.R = R; }
}
