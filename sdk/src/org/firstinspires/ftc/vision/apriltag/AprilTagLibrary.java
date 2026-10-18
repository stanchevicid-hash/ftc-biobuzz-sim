package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.VectorF;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

import java.util.ArrayList;

public class AprilTagLibrary {
    private final AprilTagMetadata[] tags;
    private final AprilTagClusterMetadata[] clusters;
    private AprilTagLibrary(AprilTagMetadata[] tags, AprilTagClusterMetadata[] clusters) { this.tags = tags; this.clusters = clusters; }
    public AprilTagMetadata[] getAllTags() { return tags; }
    public AprilTagClusterMetadata[] getAllClusters() { return clusters; }
    public AprilTagMetadata lookupTag(int id) { for (AprilTagMetadata t : tags) if (t.id == id) return t; return null; }
    public AprilTagClusterMetadata lookupCluster(int id) { for (AprilTagClusterMetadata c : clusters) if (c.containsTagId(id)) return c; return null; }

    public static class Builder {
        private final ArrayList<AprilTagMetadata> tags = new ArrayList<AprilTagMetadata>();
        private final ArrayList<AprilTagClusterMetadata> clusters = new ArrayList<AprilTagClusterMetadata>();
        private boolean allowOverwrite = false;
        public Builder setAllowOverwrite(boolean allowOverwrite) { this.allowOverwrite = allowOverwrite; return this; }
        public Builder addTag(AprilTagMetadata t) {
            for (int i = 0; i < tags.size(); i++) if (tags.get(i).id == t.id) {
                if (!allowOverwrite) throw new RuntimeException("You attempted to add a tag to the library when it already contains a tag with that ID. You can call .setAllowOverwrite(true) to allow overwriting the existing entry");
                tags.set(i, t); return this;
            }
            tags.add(t); return this;
        }
        public Builder addCluster(AprilTagClusterMetadata c) { clusters.add(c); return this; }
        public Builder addTag(int id, String name, double size, VectorF fieldPosition, DistanceUnit distanceUnit, Quaternion fieldOrientation) {
            return addTag(new AprilTagMetadata(id, name, size, fieldPosition, distanceUnit, fieldOrientation));
        }
        public Builder addTag(int id, String name, double size, DistanceUnit distanceUnit) { return addTag(new AprilTagMetadata(id, name, size, distanceUnit)); }
        public Builder addTags(AprilTagLibrary library) { for (AprilTagMetadata t : library.tags) addTag(t); return this; }
        public Builder addClusters(AprilTagLibrary library) { for (AprilTagClusterMetadata c : library.clusters) addCluster(c); return this; }
        public Builder addLibrary(AprilTagLibrary lib) { addTags(lib); return addClusters(lib); }
        public AprilTagLibrary build() { return new AprilTagLibrary(tags.toArray(new AprilTagMetadata[0]), clusters.toArray(new AprilTagClusterMetadata[0])); }
    }
}
