package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.VectorF;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

import java.util.ArrayList;

/** Same content as FTC SDK 12.0 (BIOBUZZ clusters 30-45, decompiled values). */
public class AprilTagGameDatabase {
    public static AprilTagLibrary getCurrentGameTagLibrary() {
        return new AprilTagLibrary.Builder().addLibrary(getSampleTagLibrary()).addLibrary(getBioBuzzTagLibrary()).build();
    }
    public static AprilTagLibrary getBioBuzzTagLibrary() {
        return new AprilTagLibrary.Builder()
                .addCluster(new AprilTagClusterMetadata(getBioBuzzCluster(30), "RED SCORING", "RED SCORING", new VectorF(0, 0, 0), DistanceUnit.INCH, Quaternion.identityQuaternion()))
                .addCluster(new AprilTagClusterMetadata(getBioBuzzCluster(34), "RED AUDIENCE", "RED AUDIENCE", new VectorF(0, 0, 0), DistanceUnit.INCH, Quaternion.identityQuaternion()))
                .addCluster(new AprilTagClusterMetadata(getBioBuzzCluster(38), "BLUE AUDIENCE", "BLUE AUDIENCE", new VectorF(0, 0, 0), DistanceUnit.INCH, Quaternion.identityQuaternion()))
                .addCluster(new AprilTagClusterMetadata(getBioBuzzCluster(42), "BLUE SCORING", "BLUE SCORING", new VectorF(0, 0, 0), DistanceUnit.INCH, Quaternion.identityQuaternion()))
                .build();
    }
    private static ArrayList<AprilTagClusterMemberMetadata> getBioBuzzCluster(int firstID) {
        ArrayList<AprilTagClusterMemberMetadata> c = new ArrayList<AprilTagClusterMemberMetadata>();
        c.add(new AprilTagClusterMemberMetadata(firstID, new VectorF(-6.5f, 7.1874f, -5.622f), 3.25));
        c.add(new AprilTagClusterMemberMetadata(firstID + 1, new VectorF(-2.75f, 7.1874f, -5.622f), 3.25));
        c.add(new AprilTagClusterMemberMetadata(firstID + 2, new VectorF(2.75f, 7.1874f, -5.622f), 3.25));
        c.add(new AprilTagClusterMemberMetadata(firstID + 3, new VectorF(6.5f, 7.1874f, -5.622f), 3.25));
        return c;
    }
    public static AprilTagLibrary getSampleTagLibrary() {
        ArrayList<AprilTagClusterMemberMetadata> m = new ArrayList<AprilTagClusterMemberMetadata>();
        m.add(new AprilTagClusterMemberMetadata(581, new VectorF(-2.0f, 0.0f, 0.0f), 3.0));
        m.add(new AprilTagClusterMemberMetadata(582, new VectorF(2.0f, 0.0f, 0.0f), 3.0));
        return new AprilTagLibrary.Builder().addTag(583, "Robbie", 2.0, DistanceUnit.INCH).addTag(584, "Number 5", 4.0, DistanceUnit.INCH)
                .addTag(585, "C3PO", 6.0, DistanceUnit.INCH).addTag(586, "K9", 6.0, DistanceUnit.INCH)
                .addCluster(new AprilTagClusterMetadata(m, "Center Goal", "GOAL", new VectorF(0, 0, 0), DistanceUnit.INCH, Quaternion.identityQuaternion())).build();
    }
    public static AprilTagLibrary getDecodeTagLibrary() {
        return new AprilTagLibrary.Builder()
                .addTag(20, "BlueTarget", 6.5, new VectorF(-58.3727f, -55.6425f, 29.5f), DistanceUnit.INCH, new Quaternion(0.2182149f, -0.2182149f, -0.6725937f, 0.6725937f, 0))
                .addTag(21, "Obelisk_GPP", 6.5, DistanceUnit.INCH).addTag(22, "Obelisk_PGP", 6.5, DistanceUnit.INCH).addTag(23, "Obelisk_PPG", 6.5, DistanceUnit.INCH)
                .addTag(24, "RedTarget", 6.5, new VectorF(-58.3727f, 55.6425f, 29.5f), DistanceUnit.INCH, new Quaternion(0.6725937f, -0.6725937f, -0.2182149f, 0.2182149f, 0)).build();
    }
}
