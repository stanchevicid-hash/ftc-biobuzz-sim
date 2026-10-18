package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.VectorF;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

import java.util.ArrayList;

public class AprilTagClusterMetadata {
    public final String name;
    public final String shortName;
    public final DistanceUnit distanceUnit;
    public final VectorF fieldPosition;
    public final Quaternion fieldOrientation;
    final ArrayList<AprilTagClusterMemberMetadata> clusterMembers;
    public AprilTagClusterMetadata(ArrayList<AprilTagClusterMemberMetadata> clusterMembers, String name, String shortName, VectorF fieldPosition, DistanceUnit distanceUnit, Quaternion fieldOrientation) {
        this.clusterMembers = clusterMembers; this.name = name; this.shortName = shortName; this.fieldPosition = fieldPosition; this.distanceUnit = distanceUnit; this.fieldOrientation = fieldOrientation;
    }
    protected boolean containsTagId(int id) { for (AprilTagClusterMemberMetadata m : clusterMembers) if (m.id == id) return true; return false; }
    protected ArrayList<Integer> getMemberIds() { ArrayList<Integer> r = new ArrayList<Integer>(); for (AprilTagClusterMemberMetadata m : clusterMembers) r.add(m.id); return r; }
    protected AprilTagClusterMemberMetadata getMemberMetadata(int id) { for (AprilTagClusterMemberMetadata m : clusterMembers) if (m.id == id) return m; return null; }
    public int simMemberCount() { return clusterMembers.size(); }
    public boolean simContains(int id) { return containsTagId(id); }
}
