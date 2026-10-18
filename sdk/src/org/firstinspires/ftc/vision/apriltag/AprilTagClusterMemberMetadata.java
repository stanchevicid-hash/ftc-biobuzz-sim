package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.VectorF;

public class AprilTagClusterMemberMetadata {
    public final int id;
    public final VectorF positionInClusterPlane;
    public final double tagsize;
    public AprilTagClusterMemberMetadata(int id, VectorF positionInClusterPlane, double tagsize) { this.id = id; this.positionInClusterPlane = positionInClusterPlane; this.tagsize = tagsize; }
}
